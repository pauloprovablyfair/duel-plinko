# System Architecture

## What Was Tested

- All API endpoints used for bet placement, seed management, and seed reveal
- Bet API request payload and response field structure
- Security token lifecycle and refresh mechanism
- Seed lifecycle: commit, bet epoch, rotation, reveal
- drand field presence and role in Plinko RNG (absent)
- Scaling edge bracket structure in plinkoConfig.json
- Bot protection headers required for authenticated API calls

## What This Means for Players

The game runs on Duel.com's centralized server infrastructure. All cryptographic operations — HMAC-SHA256 for slot generation, SHA-256 for seed commitment — execute server-side. Players cannot observe the raw seed computation; they can only verify outcomes after the server reveals its seed. The commit-reveal scheme is the mechanism that makes post-hoc verification possible: the server cannot change its seed after committing to its hash.

## Verdict Summary

| Check | Result | Finding |
|-------|--------|---------|
| Bet API fields captured | Pass | 12 verification-relevant fields stored per bet (see capture/plinko-capture.js) |
| drand not required for Plinko RNG | Informational | drand_round and drand_randomness not needed for slot computation; confirmed by 7,600/7,600 reproductions without drand inputs |
| Security token mechanism documented | Pass | Token refreshes every ~8 minutes; required for bet API calls |
| Seed lifecycle complete | Pass | Commit before Phase A/B/C; 50-bet epoch; rotation; reveal via transaction API |
| Scaling edge structure documented | Pass | 191 brackets per config; bracket 0 (house_edge=0.001) covers all test amounts |
| Bot protection headers identified | Informational | x-duel-device-identifier and x-env-class required; sourced from localStorage |

**Overall Verdict:** The platform architecture is consistent with a standard commit-reveal provably fair implementation. No hidden inputs are required to reproduce slot outcomes.

---

## API Endpoints

All endpoints are authenticated via session cookie (`credentials: 'include'`) plus two custom headers sourced from the browser's localStorage:

```
x-duel-device-identifier: <localStorage['security:uuid']>
x-env-class: <localStorage['env_class']>  // typically 'blue'
```

These headers are required on every API call. Without them, requests return authentication errors. The capture script reads them from localStorage automatically.

### Bet Placement

```
POST /api/v2/games/plinko/bet
```

**Request payload:**
```json
{
  "rows": 16,
  "risk_level": 3,
  "amount": "0.01",
  "currency": 105,
  "instant": true,
  "security_token": "<token>"
}
```

`risk_level` is sent as an integer: 1 = low, 2 = medium, 3 = high, per the mapping in plinkoConfig.json `risk_levels`. `currency` integer 105 = USDT. `instant: true` bypasses the animated ball-drop and returns the result immediately.

**Response fields relevant to the audit:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Bet ID — unique across all bets |
| `rows` | integer | Row count echoed from request |
| `risk_level` | string | `"low"`, `"medium"`, or `"high"` |
| `final_slot` | integer | Ball's landing slot (0 through rows) |
| `payout_multiplier` | string | Decimal string, e.g. `"4.03732442"` |
| `amount_currency` | string | Actual bet amount applied (decimal string) |
| `win_amount` | string | `amount_currency × payout_multiplier` |
| `nonce` | integer | Nonce for this bet within the current seed epoch (0–49) |
| `server_seed_hashed` | string | SHA-256 commitment of the active server seed |
| `client_seed` | string | Active client seed at time of bet |
| `transaction_id` | integer | Transaction ID used for seed reveal after rotation |
| `effective_edge` | number | House edge applied to this bet |
| `created_at` | string | ISO 8601 timestamp |

The server echoes `rows` and `risk_level` in every response. The capture script validates these against the request values after each bet — any mismatch indicates the server applied a different configuration than requested.

### Active Seed State

```
GET /api/v2/client-seed
```

Returns the currently active seed pair: `serverSeedHashed`, `clientSeed`, and the current `nonce`. Called at the start of each phase to record the pre-capture commitment, and on resume to sync nonce state.

### Seed Rotation

```
POST /api/v2/client-seed/rotate

Body: { "client_seed": "<new_client_seed>" }
```

Rotates to a new seed pair. The server assigns a new server seed (committing to its hash) and adopts the provided client seed. Returns a transaction ID that can be used to reveal the previous server seed.

Note: the previous server seed's reveal comes from the last bet's `transaction_id`, not the rotation response. The rotation response confirms the new seed state.

### Seed Reveal

```
GET /api/v2/user/transactions/{txId}
```

Returns the plaintext `serverSeed` for the transaction's seed epoch. Called immediately after rotation using the last bet's `transaction_id`. The returned plaintext seed is verified as:

```
SHA-256(Buffer.from(serverSeed, 'hex')) === serverSeedHashed
```

This is the core hash verification step (EC-1). All 152 seed entries include both the committed hash and the revealed plaintext (3 pre-capture seeds were retrieved post-collection via the transactions API).

### Security Token Refresh

```
POST /api/v2/user/security/token

Body: { "uuid": "<security:uuid>", "code": "0000", "type": "standard" }
```

Returns a short-lived security token required in every bet request. The capture script caches the token and refreshes it after 8 minutes (the observed expiry is ~10 minutes; the script uses a conservative 8-minute window). On HTTP 401 from the bet API, the script refreshes the token immediately and retries.

---

## Seed Lifecycle

Each seed epoch spans exactly 50 bets (nonce 0–49). The lifecycle is:

**1. Commitment capture**
Before the first bet of each phase, the script calls `GET /api/v2/client-seed` and records `serverSeedHashed` and `clientSeed`. This is stored as a pre-capture commitment entry. The hash commits the server to its seed before any bet is placed.

**2. Betting**
50 bets are placed in sequence. Each bet response includes `nonce` (incrementing 0–49), `server_seed_hashed` (constant within the epoch), and `client_seed` (constant within the epoch). The nonce and hash values in responses are cross-checked against local state after each bet.

**3. Rotation**
After the 50th bet, the script:
1. Saves a checkpoint (`rotationPending`) with the current seed hash — this survives a page crash
2. Calls `POST /api/v2/client-seed/rotate` with a freshly generated client seed
3. Calls `GET /api/v2/user/transactions/{lastBetTxId}` to retrieve the plaintext server seed
4. Stores the complete seed entry (committed hash + revealed plaintext + client seed) in the dataset
5. Clears the checkpoint

**4. Repeat**
The next epoch begins immediately. The new `serverSeedHashed` is captured from the first bet response (or from `GET /api/v2/client-seed` on resume).

**Dataset composition:**
- 152 total seed entries (149 rotations + 3 pre-capture)
- 152 seed entries with revealed plaintext serverSeed — hash verified (EC-1)
- 3 pre-capture commitment entries — one per phase start; plaintext seeds retrieved post-collection via the transactions API and verified (these confirm the commitment predates Phase A, B, C respectively)

---

## drand

Duel.com uses drand (a distributed randomness beacon) for some games, including Crash. `drand_round` and `drand_randomness` are not required for Plinko slot computation.

drand is **not used in Plinko's RNG**. The slot is fully reproducible from `(serverSeed, clientSeed, nonce, rows)` alone using HMAC-SHA256. This is confirmed by Step 5 of the verification suite (`tests/verify.ts`): all 7,600 slots are recomputed without referencing drand fields, and all match `final_slot`.

---

## Scaling Edge

plinkoConfig.json contains a `scaling_edge` key with 191 bet-size brackets per configuration (27 configs total). Each bracket is an object:

```json
{
  "id": 1,
  "config_id": 12,
  "min_bet": "0",
  "max_bet": "335.95",   // truncated for display; full precision: "335.946312864870400000"
  "house_edge": "0.001",
  "probabilities": [...],
  "multipliers": [...]
}
```

The server selects the bracket based on `amount_currency`. For bracket 0 (the lowest):
- `house_edge` = `"0.001"` (0.1%)
- `max_bet` ≈ $335.95 for the 16r/high configuration (the most restrictive; other configs have higher ceilings)
- All test bets ($0.01 and $10) fall within this bracket

At higher brackets the house edge increases to a maximum of `"0.02"` (2%). The multiplier tables in higher brackets are lower, reflecting reduced player expected value.

Two multiplier sources exist in plinkoConfig.json:
- `payout_tables` — a compact top-level table (one multiplier set per rows/risk combo)
- `scaling_edge[rows][risk][bracket].multipliers` — the per-bracket multiplier array

The two sources differ by at most 1.49×10⁻⁶ (floating-point rounding). Step 8 of the verification suite determines which source the server uses by comparing live `payout_multiplier` values from bet responses against both. The reference table is recorded in `outputs/verification-results.json`.

---

## Security Token

The `security_token` field in bet requests is a short-lived token issued by `POST /api/v2/user/security/token`. The token expires approximately every 10 minutes. The capture script:

- Caches the token with a timestamp
- Refreshes automatically when the cached token is older than 8 minutes
- Refreshes immediately on HTTP 401 from the bet API
- Also refreshes after every seed rotation (the rotation call triggers a token refresh as a precaution)

The token is stored in script state and in `localStorage['plinko_meta']` between sessions. It is stripped from the localStorage entry by `plinko.save()` before the dataset JSON is downloaded, so no active token appears in the exported dataset.

---

## Bot Protection

The platform enforces two custom request headers on all API calls:

| Header | Source | Value |
|--------|--------|-------|
| `x-duel-device-identifier` | `localStorage['security:uuid']` | UUID assigned at first login |
| `x-env-class` | `localStorage['env_class']` | Typically `"blue"` |

Both values are present in the browser's localStorage for any authenticated Duel.com session. The capture script reads them automatically via:

```js
var deviceId = localStorage.getItem('security:uuid') || '';
var envClass = localStorage.getItem('env_class') || 'blue';
```

Requests without these headers return authentication errors. These headers identify the browser session, not the user account — they are browser-local values, not credentials.

---

## Evidence Coverage

| Test | Source File | Status |
|------|-------------|--------|
| Bet API payload structure | `src/types.ts` (BetRequest, BetResponse) | Verified — matches captured data |
| Token refresh mechanism | `capture/plinko-capture.js` (refreshToken, getToken) | Verified |
| Seed rotation and reveal | `capture/plinko-capture.js` (doRotation, getTransaction) | Verified — 152 epochs |
| drand absent from RNG | `tests/verify.ts` Step 5 | Verified — EC-6, EC-7 |
| Scaling edge bracket 0 | `tests/verify.ts` Step 19 | Verified — EC-17, EC-32 |
| Pre-capture commitments | `tests/verify.ts` Step 2 | Verified — 3 commitment records |

**Code References:**
- API call implementation: `capture/plinko-capture.js` (`api`, `placeBet`, `rotateSeed`, `getTransaction`)
- RNG verification: `src/rng.ts` (`computeSlot`, `verifyHash`)
- Type definitions for all API fields: `src/types.ts`
- Scaling edge and multiplier lookup: `src/config.ts`

**Dataset:** `results/merged/plinko-master.json` (7,600 bets, 152 seed entries, all revealed)
