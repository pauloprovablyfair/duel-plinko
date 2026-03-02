# RNG Algorithm Analysis

## What Was Tested

- The HMAC-SHA256 algorithm used to determine ball direction at each row
- Key encoding method: hex-decoded bytes vs. UTF-8 string
- Modulo bias analysis on `int % 2` applied to a 32-bit unsigned integer
- drand field presence and its effect (or lack thereof) on slot output
- Commit-reveal scheme: SHA-256 pre-image verification for all 152 seeds
- Full slot recomputation against 7,600 live bets

## What This Means for Players

Duel.com Plinko uses a standard cryptographic construction (HMAC-SHA256) with a commit-reveal scheme. Before a bet is placed, the server has already committed to a hash of its seed — it cannot change the outcome after the fact. The full algorithm is published, standard, and independently reproducible from first principles using only the inputs the player can observe.

## Verdict Summary

| Check | Result | Finding |
|-------|--------|---------|
| Algorithm specification | Pass | HMAC-SHA256, key = hex-decoded server seed |
| Key encoding | Pass | `Buffer.from(serverSeed, 'hex')` — not UTF-8 |
| Modulo bias | Pass | `2^32 % 2 = 0` — zero bias, exact 50/50 |
| drand absent from RNG | Pass | 7,600/7,600 bets recomputed correctly without drand |
| Commit-reveal integrity | Pass | All 152 seeds satisfy SHA-256(hexDecode(seed)) = committedHash |
| Slot recomputation | Pass | 0 mismatches across 7,600 bets |

**Overall Verdict:** The RNG is a correctly implemented HMAC-SHA256 commit-reveal scheme with no bias, no hidden inputs, and full post-hoc verifiability. **[Evidence: EC-1, EC-6, EC-7]**

---

## Algorithm Specification

Each Plinko bet resolves one row at a time. For a game with `rows` rows, the algorithm runs `rows` HMAC computations and accumulates a slot value:

```
key     = Buffer.from(serverSeed, 'hex')   // 32-byte key, hex-decoded
slot    = 0
for cursor = 0 to rows-1:
    message = `${clientSeed}:${nonce}:${cursor}`
    hmac    = HMAC-SHA256(key, message)
    hex4    = hmac.substring(0, 8)         // first 4 bytes as hex
    int     = parseInt(hex4, 16)           // big-endian uint32
    slot   += int % 2                      // 1 if odd (right), 0 if even (left)
final_slot = slot                          // range [0, rows]
```

This is the exact algorithm implemented in `src/rng.ts` (function `computeSlot`). The implementation is coded from the cryptographic specification, not copied from any casino source code. **[Evidence: EC-7]**

### Key Encoding

The server seed is transmitted as a lowercase hex string. The HMAC key is constructed by hex-decoding that string:

```typescript
const key = Buffer.from(serverSeed, 'hex');
```

This produces a 32-byte Buffer — not a 64-character ASCII string. Using the hex string directly as a UTF-8 key would produce different HMAC outputs for every bet. The audit implementation was verified to produce correct outputs by cross-checking against the worked example in the section below.

### Message Format

Each cursor step uses a colon-separated message: `clientSeed:nonce:cursor`. The nonce is an integer (not zero-padded). The cursor is an integer starting at 0. No other fields — including drand fields — appear in the message.

---

## Modulo Bias Analysis

Each bounce uses `int % 2` where `int` is a 32-bit unsigned integer (range 0 to 4,294,967,295). For a modulus `m`, bias exists when `2^32` is not evenly divisible by `m`.

```
2^32 = 4,294,967,296
4,294,967,296 / 2 = 2,147,483,648  (exact, no remainder)
```

There are exactly 2,147,483,648 even values and 2,147,483,648 odd values in `[0, 2^32 - 1]`. Each HMAC output is uniform over this range (HMAC-SHA256 is a pseudorandom function). The probability of a right bounce at any row is exactly 1/2. No rejection sampling is required or applied.

This contrasts with moduli that are not powers of 2 — for example, `int % 37` on a 32-bit integer would have a non-uniform residue distribution requiring rejection sampling. `int % 2` requires none. **[Evidence: EC-7]**

---

## drand Non-Participation

For all 7,600 captured Plinko bets, `drand_round` and `drand_randomness` are absent from the API response. They play no role in computing the Plinko slot.

Verification method: slot recomputation for all 7,600 bets was performed using only `(serverSeed, clientSeed, nonce, rows)`. drand fields were not read or passed to the computation at any point.

Result: 0 mismatches out of 7,600 bets. If drand were a hidden input to the slot calculation, recomputation would fail for those bets. It does not. **[Evidence: EC-6, EC-7]**

---

## Worked Example

Bet ID 60086398 (Phase B, 16 rows, high risk):

```
serverSeed = 5b98f89529c39a86b701f4e4ac44feda603e2b5ab0ce6338c1383e8ba9f7d4ff
clientSeed = 8zZ78btAe6T8gvtH
nonce      = 0
rows       = 16
```

| cursor | HMAC[:8] | uint32 | % 2 | direction | slot |
|--------|----------|--------|-----|-----------|------|
| 0 | `11bcb113` | 297,578,771 | 1 | right | 1 |
| 1 | `e78ed6ac` | 3,884,897,964 | 0 | left | 1 |
| 2 | `df13e4b7` | 3,742,622,903 | 1 | right | 2 |
| … | … | … | … | … | … |
| 15 | `746204c1` | 1,952,580,801 | 1 | right | 12 |

`final_slot = 12` — matches the `final_slot` value returned by the API.

The corresponding multiplier from `scaling_edge[0].multipliers` for 16r/high, slot 12 is `4.03732442×`.

---

## Commit-Reveal Scheme

The scheme operates in fixed 50-bet epochs:

1. **Commitment:** Before the epoch begins, the server generates a random 32-byte `serverSeed` and publishes `SHA-256(Buffer.from(serverSeed, 'hex'))` as `serverSeedHashed`. This hash appears in every bet response throughout the epoch.
2. **Betting:** 50 bets are placed using `(serverSeed, clientSeed, nonce)` where nonce runs 0–49. The player sets their own `clientSeed`.
3. **Rotation:** After bet 49, the server rotates seeds. The rotation API call returns a transaction ID, and a subsequent fetch to `GET /api/v2/user/transactions/{txId}` returns the plaintext `serverSeed`.
4. **Verification:** The auditor recomputes `SHA-256(Buffer.from(revealedSeed, 'hex'))` and compares it to the previously recorded `serverSeedHashed`.

**Verification result:** All 152 seeds pass hash verification. Zero mismatches. This means the server cannot have chosen a different seed after observing bets — the seed was fixed before the first bet of each epoch. **[Evidence: EC-1]**

Implemented in `src/rng.ts` (function `verifyHash`):

```typescript
export function verifyHash(serverSeed: string, serverSeedHashed: string): boolean {
  const hash = crypto
    .createHash('sha256')
    .update(Buffer.from(serverSeed, 'hex'))
    .digest('hex');
  return hash === serverSeedHashed;
}
```

---

## Evidence Coverage

| Test | Source File | Status |
|------|-------------|--------|
| Slot recomputation (7,600 bets) | `src/rng.ts` | Pass |
| Hash integrity (152 seeds) | `src/rng.ts` | Pass |
| drand absent | `src/rng.ts` | Pass |
| Client seed influence (7,600 bets, 152 epochs) | verification pipeline | Pass — 6,409/7,600 slots changed (84.3%) |

**Code References:**
- RNG implementation: `src/rng.ts`
- Simulation runner: `src/simulate.ts`
- Verification output: `outputs/verification-results.json`

**Dataset:** `results/merged/plinko-master.json` (7,600 bets, 152 seed entries (149 rotations + 3 pre-capture), SHA-256: `8382e45f8cdf4d439a8866669d15e6f4be543f4b926fb64c67e09d9da7d6b2db`)
