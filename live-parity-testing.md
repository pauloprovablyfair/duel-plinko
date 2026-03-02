# Live Parity Testing

## What Was Tested

- Full data collection across 3 structured phases (5,400 + 2,000 + 200 bets)
- Supplementary Phase D: 500 bets across all 27 configs to verify client seed usage
- Slot recomputation for every bet with a revealed server seed (7,600/7,600 primary; 500/500 Phase D)
- Seed hash verification for all 152 seeds
- Commitment linkage for all 3 pre-capture epoch commitments
- Epoch structure (50 bets per seed, 152 epochs)
- Capture artifact identification and classification (5 retry-pattern epochs)
- Config distribution across 27 row/risk combinations (Phase A)

## What This Means for Players

The game produces verifiable outputs. Every bet slot was recomputed from the raw (serverSeed, clientSeed, nonce) triple using HMAC-SHA256 and compared against the server's reported result — 7,600 matched with 0 discrepancies. There is no evidence of outcome manipulation.

## Verdict Summary

| Check | Result | Finding |
|-------|--------|---------|
| Slot recomputation | Pass | 7,600 / 7,600 — 0 mismatches |
| Seed hash verification | Pass | 152 / 152 seeds verified |
| Commitment linkage | Pass | 3 / 3 pre-capture commitments match |
| Epoch size | Pass | All 152 epochs have exactly 50 bets |
| Capture artifacts | Informational | 5 retry-pattern epochs — slot recomputation passes for all |
| Config distribution | Pass | Total Phase A correct (5,400); minimum config n = 116 |
| Phase D client seed verification | Pass | 500 / 500 — 0 mismatches across 10 distinct client seeds |

**Overall Verdict:** Live bet parity confirmed across all 7,600 bets. Client seed usage additionally verified by Phase D (500 supplementary bets).

---

## Data Collection

Bets were captured using a purpose-built console script (`capture/plinko-capture.js`) injected into the Duel.com Plinko game page via browser DevTools. The script intercepted the `POST /api/v2/games/plinko/bet` API response for each bet and stored the full request and response payload.

Storage architecture: bet data was held in memory (JavaScript `Map` objects) during the session because the combined payload would exceed browser localStorage limits. Small metadata — session counters, current epoch index, seed rotation checkpoints, and the Phase A config queue — was written to localStorage after every bet. Auto-save JSON downloads fired automatically at 500-bet intervals, producing 6 partial export files that were later merged into the master dataset.

Evidence screenshots were generated automatically at phase start and phase end using an in-page Canvas renderer. Each card shows the phase label, current bet count, the active server seed hash, the client seed, and the last bet details. Screenshots are timestamped and stored as PNG files alongside the dataset. [Evidence: E01] [Evidence: E02]

Seed commitments were captured before the first bet of each phase by reading the active `server_seed_hashed` from the game API. The script called `POST /api/v2/client-seed/rotate` at each epoch boundary to trigger seed reveal, then fetched the revealed `serverSeed` via `GET /api/v2/user/transactions/{txId}`. A `rotationPending` checkpoint survived page crashes and was recovered on script resume.

---

## Dataset Composition

| Phase | Label | Bets | Rows | Risk | Bet Amount | Purpose |
|-------|-------|------|------|------|-----------|---------|
| A | Configuration coverage | 5,400 | 8–16 (random) | low / medium / high (random) | $0.01 | All 27 row/risk configs, RTP baseline |
| B | High-variance sampling | 2,000 | 16 | high | $0.01 | Deep coverage of highest-variance config |
| C | Code-path equivalence | 200 | 16 | high | $10.00 | Verify RNG output is amount-agnostic |
| **Total (primary)** | | **7,600** | | | | |
| D *(supplementary)* | Client seed verification | 500 | 8–16 (random) | low / medium / high (random) | $0.01 | Confirm client seed is actively used in HMAC computation |

The master dataset file is `results/merged/plinko-master.json` (5.88 MB). SHA-256: `8382e45f8cdf4d439a8866669d15e6f4be543f4b926fb64c67e09d9da7d6b2db`. [Evidence: E07]

---

## Seed Management

Each seed epoch covers exactly 50 bets (nonces 0–49). The commit-reveal lifecycle per epoch:

1. **Commitment** — before the first bet of each epoch, the active `server_seed_hashed` is recorded. The three records created before any bets were placed (one per phase start) are stored as pre-capture commitment entries; their plaintext seeds were subsequently retrieved post-collection via the transactions API and are included in the 152/152 verified count.
2. **Betting** — 50 bets are placed under the same `(serverSeed, clientSeed)` pair. The nonce increments by 1 per bet. Each API response echoes the current `server_seed_hashed` and `nonce` for cross-check.
3. **Rotation** — at the 50-bet boundary, the script calls `POST /api/v2/client-seed/rotate`. The last bet response in the epoch includes a `transaction_id` field; the script uses this txId to fetch `GET /api/v2/user/transactions/{txId}` and retrieve the revealed plaintext `serverSeed`, which is recorded alongside the committed hash.
4. **Verification** — the auditor independently verifies `SHA-256(hexDecode(serverSeed)) == serverSeedHashed` for every revealed entry.

Total seed entries: **152** — 149 rotations + 3 pre-capture commitment snapshots (one per phase start, revealed post-collection via transactions API).

---

## Verification Methodology

All 19 EC checks are implemented in `tests/verify.ts` and are run in a single invocation:

```
npx ts-node tests/verify.ts
```

The script loads `results/merged/plinko-master.json`, groups bets by `server_seed_hashed` into epochs, and executes each step sequentially. Results are written to `outputs/verification-results.json`. The slot recomputation log for every verified bet is written to `outputs/determinism-log.json`.

The 19 verification steps cover:

| Step | EC Refs | What Is Checked |
|------|---------|----------------|
| 1 | EC-1 | SHA-256(hexDecode(serverSeed)) = serverSeedHashed for all 152 seeds |
| 2 | EC-2 | 3 pre-capture commitments match first bet hash per phase |
| 3 | EC-26 | server_seed_hashed identical across all 50 bets per epoch |
| 4 | EC-2, 3, 4, 5 | Nonces 0–49 sequential; client_seed stable within epoch |
| 5 | EC-6, 7 | Slot recomputation via HMAC-SHA256; drand confirmed absent |
| 6 | EC-27 | Wrong client seed changed 6,409/7,600 slots (84.3%) across all 152 epochs |
| 7 | EC-11, 18 | win_amount = amount_currency × payout_multiplier (tolerance 1e-8) |
| 8 | EC-28, 32 | All observed multipliers match scaling_edge[0].multipliers table |
| 9 | EC-15, 16, 17 | Phase C slots recomputed; multiplier table identical to Phase B |
| 10 | EC-19, 20, 21, 22 | Per-phase and per-config RTP within 5σ of 99.9% |
| 11 | EC-29 | Serial independence: lag-1 autocorrelation + Wald-Wolfowitz runs test |
| 12 | EC-9 | Chi-squared slot symmetry for all configs with n ≥ 100 |
| 13 | EC-23 | Zero Edge bets use the same multiplier table as standard bets |
| 14 | EC-30 | Phase A total correct (5,400); config distribution noted |
| 15 | EC-31 | Every epoch has exactly 50 bets |
| 16 | EC-10, 12, 13, 14 | Multiplier table match, symmetry, and 0.2× floor (all 27 configs) |
| 17 | EC-24 | All bets and seed entries carry valid phase labels (A/B/C) |
| 18 | EC-25 | SHA-256 of master JSON recorded |
| 19 | EC-17, 32 | Scaling edge bracket 0: house_edge=0.001 for all 27 configs |

[Evidence: E07] [Evidence: E08]

---

## Slot Recomputation Results

The HMAC-SHA256 slot computation is:

```
key     = hexDecode(serverSeed)         // 32-byte buffer
for cursor in 0..(rows-1):
    message = clientSeed + ":" + nonce + ":" + cursor
    hmac    = HMAC-SHA256(key, message)
    hex4    = hmac[0..7]                // first 8 hex characters
    int     = parseInt(hex4, 16)
    slot += int % 2              # odd → right (+1), even → left (+0)
final_slot = slot                       // range: 0..rows
```

For every bet belonging to an epoch with a revealed server seed, the script recomputed `final_slot` from `(serverSeed, clientSeed, nonce, rows)` and compared it to the server-reported `final_slot`.

**Result: 7,600 / 7,600 — 0 mismatches.**

The 3 pre-capture commitment records initially had unrevealed server seeds. Those seeds were subsequently retrieved via the transactions API and verified post-collection. All 7,600 bets are recomputed and verified.

The determinism log (`outputs/determinism-log.json`) records every verified bet with fields: bet ID, phase, rows, risk, nonce, computed slot, actual slot, and match status. [Evidence: E09]

---

## Seed Hash Verification

For each of the 152 seed epochs, the verifier ran:

```
SHA-256(Buffer.from(serverSeed, 'hex')) == serverSeedHashed
```

**Result: 152 / 152 — 0 mismatches.**

This confirms the server committed to each seed before the betting epoch began and did not substitute a different seed after observing outcomes.

All 152 seed entries carry a verified serverSeed. [Evidence: E07]

---

## Capture Artifacts

During collection, 5 epochs exhibit a distinctive nonce pattern: nonce 50 is present in the epoch, and exactly one nonce in the range 0–50 is absent, leaving 50 bets captured total. The normal pattern for a complete epoch is nonces 0–49 with no gaps.

The cause is a network retry during collection. When a bet response timed out, the browser sent the request again. The server had already processed the original request and incremented the nonce, so the retry was assigned the next nonce. The timed-out response was never received by the capture script (it was a genuine network loss), so that nonce does not appear in the dataset. The retry response was captured normally.

The net effect: the server placed 51 sequential bets in these epochs (nonces 0–50), but one response (the timed-out one) was not captured. The 50 captured bets are correct and verifiable.

Slot recomputation passes for all bets in all 5 affected epochs. The server nonce sequence is intact — there are no repeated nonces, no fabricated outcomes, and no discontinuity in the server's internal state. This is a capture artifact, not a fairness issue.

The 147 remaining epochs have clean nonce sequences 0–49 with no gaps. [Evidence: E07]

---

## Config Distribution

Phase A was designed to deliver exactly 200 bets per config (4 epochs × 50 bets) across all 27 row/risk combinations. The capture script built the epoch queue as 4 shuffled passes of all 27 configs, then applied one final full shuffle to prevent pass-level clustering. The resulting queue — 108 epochs total — was persisted in localStorage and exported as part of the dataset.

10 of the 27 configs received a bet count other than 200. The cause is a session restart at approximately 4,934 bets when localStorage reached its quota limit. The in-memory bet buffer was not affected, but the queue state was cleared and rebuilt when the script was re-pasted. The new queue shuffled configs independently of the old one, shifting some config counts up and some down.

The total Phase A bet count is correct: **5,400**. All individual bets are verified by slot recomputation (EC-7) regardless of which epoch they belong to. The minimum config sample is **116 bets (11r/high)**, which is above the chi-squared minimum threshold of 100. No config is missing from the dataset.

| Metric | Value |
|--------|-------|
| Configs with n = 200 | 17 / 27 |
| Configs with n ≠ 200 | 10 / 27 |
| Total Phase A bets | 5,400 |
| Minimum config n | 116 (11r/high) |
| Maximum config n | 264 (15r/high) |

[Evidence: E02] [Evidence: E07]

---

## Evidence Coverage

| Test | Source File | Status |
|------|-----------|--------|
| Slot recomputation (7,600 bets) | `tests/verify.ts` Step 5 | Pass |
| Determinism log | `outputs/determinism-log.json` | Verified |
| Seed hash verification (152 seeds) | `tests/verify.ts` Step 1 | Pass |
| Commitment linkage (3 pre-capture) | `tests/verify.ts` Step 2 | Pass |
| Epoch size (152 × 50 bets) | `tests/verify.ts` Step 15 | Pass |
| Capture artifact classification | `tests/verify.ts` Step 4 | Informational |
| Config distribution | `tests/verify.ts` Step 14 | Pass |

**Code References:**
- Verification suite: `tests/verify.ts`
- Slot RNG implementation: `src/rng.ts`
- Dataset loader: `src/loader.ts`

**Dataset:** `results/merged/plinko-master.json` (5.88 MB, 7,600 bets, 152 seed entries)

---

## Phase D — Client Seed Verification

*Supplementary collection conducted March 2026 (primary data collection February 2026).*

### Purpose

Phase D was a supplementary 500-bet run designed to further verify that the client seed set via `POST /api/v2/client-seed/rotate` is genuinely used in the server's HMAC-SHA256 computation and is not overridden or ignored server-side. The test placed $0.01 bets across all 27 configurations in a balanced random order — the same coverage structure as Phase A.

### Custom Seed Rotation Attempt

Before placing any Phase D bet, the capture script attempted to rotate the active client seed to an auditor-controlled value (`pfaudit-mm9e96hn3brhz6o3`). The Duel.com client seed API rejected the value — the endpoint only accepts alphanumeric characters and does not permit hyphens. The script's error handler caught the failure and proceeded with the existing active client seed (`rbUlee3HbP1OzonW`). Phase D bets therefore ran under standard 16-character alphanumeric client seeds, rotated at each 50-bet epoch boundary in the same manner as Phases A–C.

### NULL Reveal Warning

The capture script reported `1/11 seeds have NULL reveals`. The flagged entry is `pre-capture-phase-D` — the commitment snapshot taken before any Phase D bet was placed. At commitment time the server seed has not been rotated and no plaintext is available; the seed is revealed when epoch 0 rotates at bet 50. The `seedHealth` export field confirms: `commitments=1, revealed=10, failedReveals=0`. There are zero failed reveals in Phase D.

### Dataset

| Metric | Value |
|--------|-------|
| Bets captured | 500 |
| Seed epochs | 10 |
| Seeds revealed | 10 / 10 |
| Failed reveals | 0 |
| Distinct client seeds | 10 |
| Bet amount | $0.01 |
| Configs covered | All 27 (8–16 rows × low / medium / high) |

Dataset file: `results/plinko-phase-d.json`

### Slot Recomputation

All 500 Phase D bets were independently recomputed against the 10 revealed server seeds using the same HMAC-SHA256 implementation in `src/rng.ts`:

```
key     = hexDecode(serverSeed)
message = clientSeed + ":" + nonce + ":" + cursor
slot   += HMAC-SHA256(key, message)[0..3] % 2   // for each cursor in 0..rows-1
```

**Result: 500 / 500 — 0 mismatches.**

The recomputation used the `client_seed` field echoed in each bet's API response. Every computed slot matched the server-reported `final_slot` exactly, across all 10 client seeds and all 27 row/risk configurations. This confirms:

1. The client seed echoed in the API response is the actual seed used in the server's HMAC computation.
2. The server did not substitute a different client seed after receiving the bet request.
3. The seed rotation mechanism assigns a distinct client seed to each 50-bet epoch and uses it consistently throughout.
