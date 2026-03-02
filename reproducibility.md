# Reproducibility Guide

**Audit:** Duel.com Plinko\
**Version:** 1.0\
**Date:** February 2026\
**Auditor:** [ProvablyFair.org](https://www.provablyfair.org)

---

## Prerequisites

- Node.js ≥ 18
- TypeScript (installed via npm as a dev dependency — no global install required)
- Git

---

## Repository

The verification code lives at `repositories/plinkov3/`. Directory structure:

```
plinkov3/
├── src/
│   ├── rng.ts           # HMAC-SHA256 implementation
│   ├── config.ts        # PlinkoConfig wrapper (plinkoConfig.json)
│   ├── loader.ts        # Dataset loader
│   ├── stats.ts         # Chi-squared, lag-1 autocorrelation, KS test
│   ├── types.ts         # TypeScript interfaces
│   └── simulate.ts      # Monte Carlo simulation (27M rounds)
├── tests/
│   └── verify.ts        # 19-step verification suite
├── plinkoConfig.json    # Duel.com supplied config
├── results/
│   └── merged/
│       └── plinko-master.json  # 7,600-bet dataset
└── outputs/             # Generated artifacts
```

**Dataset SHA-256:** `8382e45f8cdf4d439a8866669d15e6f4be543f4b926fb64c67e09d9da7d6b2db`

---

## Dataset Integrity Check

Before running anything, verify you have the exact dataset used in this audit:

```bash
shasum -a 256 repositories/plinkov3/results/merged/plinko-master.json
# Expected: 8382e45f8cdf4d439a8866669d15e6f4be543f4b926fb64c67e09d9da7d6b2db
```

A mismatch means the dataset has been modified. Do not proceed until the hash matches.

---

## Running the Verification

```bash
cd repositories/plinkov3
npm install
npx ts-node tests/verify.ts
```

Expected output: 19 steps, all `PASS`, final verdict `PROVABLY FAIR — Full Pass`.

The verification suite covers: slot recomputation against all 7,600 bets, server seed hash commit-reveal integrity, nonce ordering, payout correctness, configuration coverage, statistical tests (chi-squared, lag-1 autocorrelation, Wald-Wolfowitz runs test, KS test), and drand non-influence confirmation.

---

## Running the Simulation

```bash
npx ts-node src/simulate.ts
```

Expected: approximately 7 minutes (420 seconds in the reference run). Output: 27M rounds across all 27 Plinko configurations, average simulated RTP ≈ 99.890%, 27/27 chi-squared pass at α=0.01 (0 flags). Results are written to `outputs/simulation-results.json`.

---

## The RNG Algorithm

This is the exact implementation. The correct direction is: odd uint32 = right (+1), even uint32 = left (no change).

```typescript
function computeSlot(serverSeed: string, clientSeed: string, nonce: number, rows: number): number {
  const key = Buffer.from(serverSeed, 'hex');  // decode hex — NOT Buffer.from(serverSeed)
  let slot = 0;
  for (let cursor = 0; cursor < rows; cursor++) {
    const message = `${clientSeed}:${nonce}:${cursor}`;
    const hmac = crypto.createHmac('sha256', key).update(message).digest('hex');
    const hex4 = hmac.substring(0, 8);  // first 8 hex chars = 4 bytes
    const int = parseInt(hex4, 16);
    slot += int % 2;  // odd = right (+1), even = left (+0)
  }
  return slot;
}
```

**Key encoding.** The server seed is a 64-character hex string. It must be decoded to raw bytes before use as the HMAC key: `Buffer.from(serverSeed, 'hex')`. Passing the hex string directly (`Buffer.from(serverSeed)`) produces a different key and wrong slot outputs.

**Bit direction.** `int % 2 === 1` means the ball moves right (slot increments). `int % 2 === 0` means the ball moves left (slot unchanged). The correct direction is confirmed by 7,600/7,600 zero-mismatch slot recomputations and cross-checked against the reference implementation at https://github.com/paulocentr/duelplinko (`src/plinko/PlinkoResultsGenerator.ts`) — external repo, not included in this deliverable.

**Message format.** The HMAC message is `clientSeed:nonce:cursor` — colon-separated, no spaces, cursor is the zero-based row index.

**Output.** The function returns an integer in [0, rows]. For a 16-row board, slot ranges from 0 (all-left path) to 16 (all-right path).

---

## Seed Verification (Browser)

To verify a single server seed hash commitment in any browser console without installing anything:

```javascript
async function verifyHash(serverSeed, serverSeedHashed) {
  const seedBytes = new Uint8Array(serverSeed.match(/../g).map(b => parseInt(b, 16)));
  const hashBuffer = await crypto.subtle.digest('SHA-256', seedBytes);
  const computed = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  console.log(computed === serverSeedHashed ? 'PASS' : `FAIL: got ${computed}`);
}
```

Call it with any revealed `serverSeed` and its corresponding `serverSeedHashed` value from the dataset. A `PASS` confirms the server committed to that seed before bets were placed.

---

## Capture-Retry Note

Five epochs in the dataset contain bets with nonce 50 (outside the normal 0–49 range). These arose from a capture-retry pattern: the server processed 51 bets (nonces 0–50); the capture script recorded 50 of them, missing one nonce within the 0–49 range (the specific missed nonce is logged in `outputs/verification-results.json` step 4). Nonce 50 from the server's response was captured instead. Slot recomputation passes for all 50 captured bets in each affected epoch. All 7,600 bets in the dataset were verified with 0 skipped.
