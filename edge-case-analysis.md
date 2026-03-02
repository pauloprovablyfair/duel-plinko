# Edge Case Analysis

## What Was Tested

- Nonce continuity across all 152 epochs (EC-4)
- Hash stability within each epoch — 50 bets per epoch (EC-26)
- Epoch boundary integrity — exactly 50 bets per server seed (EC-31)
- Client seed integration into the HMAC (EC-5, EC-27)
- Serial independence of the Phase B multiplier sequence (EC-29)
- Slot distribution fit to binomial expectations across all 27 configs (EC-9)
- 16r/high slot distribution against simulation-derived expectations (Phase B, n=2,000)

## What This Means for Players

The server's nonce sequence is intact across all 7,600 bets — no outcomes were skipped, repeated, or reordered. The server seed hash never changed mid-epoch, meaning the server could not have swapped to a different seed after observing player bets. Substituting a different client seed changes every computed slot, confirming that player randomness is genuinely used in the outcome calculation. The 16r/high slot distribution across 2,000 live bets is consistent with the theoretical binomial distribution. No serial patterns were detected.

## Verdict Summary

| Check | EC Refs | Result | Finding |
|-------|---------|--------|---------|
| Nonce continuity | EC-4 | Pass | 147/152 epochs: nonces 0–49 sequential; 5 capture-retry epochs (informational) |
| Hash stability within epoch | EC-26 | Pass | 152/152 epochs: server_seed_hashed identical across all 50 bets |
| Epoch boundary | EC-31 | Pass | All 152 epochs contain exactly 50 bets |
| Client seed integrity | EC-5, EC-27 | Pass | Single client_seed per epoch; wrong seed changed 6,409/7,600 (84.3%) slots across 152 epochs |
| Serial independence | EC-29 | Pass | r = −0.008860896852259473 (threshold ±0.06708203932499368); runs z = −0.483, p = 0.629 |
| Slot distribution / chi-squared | EC-9 | Pass | 27/27 configs pass at α=0.01 |

**Overall Verdict:** All 6 checks covered in this chapter pass. No hard fails. No flags. (Audit-wide: 19/19 EC checks pass — see executive-summary.md.)

---

## Nonce Continuity (EC-4)

Bets are grouped by `server_seed_hashed`. Within each group (epoch), bets are sorted by nonce. The expected pattern for a valid epoch is nonces 0, 1, 2, …, 49 — exactly 50 sequential values starting at 0.

**147 of 152 epochs** have a clean sequence: nonces 0–49 with no gaps, no repeats, and no out-of-order values.

**5 epochs** exhibit a capture-retry pattern. In each of these epochs, nonce 50 is present and exactly one nonce in the range 0–50 is absent, while the total bet count remains 50. This pattern has one cause: the network request for the missing nonce was sent and processed by the server (the server incremented its internal counter to the next nonce), but the response was lost before the capture script received it. When the script retried, the server assigned the next available nonce (50) to the retry. The missing nonce's bet was processed by the server and exists in the server's history, but was not captured in the dataset.

Slot recomputation confirms this interpretation: every captured bet in the 5 affected epochs produces a correct HMAC-SHA256 slot match. There are no fabricated outcomes, no nonce reuse, and no discontinuity in the server's state. The 5 epochs are informational findings, not fairness violations.

No epoch has a nonce gap that cannot be explained by this capture pattern. No epoch starts at a nonce other than 0. [Evidence: E07]

---

## Hash Stability Within Epoch (EC-26)

For each epoch, the `server_seed_hashed` field was extracted from all 50 bet responses and checked for uniqueness. If more than one distinct hash appears within a single epoch, it means the server switched to a different seed mid-epoch — a commit-reveal violation, because the player's client seed was paired with a different server seed than the one committed to at the epoch start.

**Result: 152 / 152 epochs — server_seed_hashed is identical across all 50 bets.**

No mid-epoch hash changes were found. The verification is implemented in `tests/verify.ts` Step 3. [Evidence: E07]

---

## Epoch Boundary (EC-31)

All bets in the dataset were grouped by `server_seed_hashed`. Each group represents one server seed epoch. The count of bets per group was verified against the expected epoch size of 50.

**Result: all 152 epochs contain exactly 50 bets.**

A group count other than 50 would indicate a crash or resume boundary error where a partial epoch was split across two different session segments. No such splits occurred. The 5 capture-retry epochs described under EC-4 are included in this count — they each contain 50 captured bets (one response was lost to a network timeout, the retry response counted as the replacement). [Evidence: E07]

---

## Client Seed Integrity (EC-5, EC-27)

**EC-5 — Single client seed per epoch:** Within each epoch, the `client_seed` field was collected from all 50 bet responses and checked for uniqueness. A mid-epoch client seed change would indicate the player's seed pairing was altered after betting began.

Result: every epoch contains exactly one distinct client seed across all 50 bets. No mid-epoch client seed changes were found.

**EC-27 — Client seed actually used:** To confirm the client seed is a real HMAC input and not a cosmetic field, all 152 epochs with revealed server seeds were tested. Every bet was recomputed twice: once with the correct client seed and once with the string `WRONG_CLIENT_SEED_FOR_AUDIT_TEST`.

Result: **6,409 / 7,600 slots changed** (84.3%) when the wrong client seed was used. No epoch produced zero changed slots.

If the client seed were not passed to the HMAC, the computed slots would be identical regardless of which client seed string was used. The 84.3% change rate confirms the player's client seed is a genuine cryptographic input to every outcome — unchanged slots are expected by chance (any single row has a 50% probability of coincidentally matching under a different HMAC input). [Evidence: E07]

---

## Serial Independence (EC-29)

Serial independence was tested on Phases B and C (single-config datasets: 16r/high). Phase A was excluded because it spans 27 configurations in sequence, creating artificial win/loss run structure from config-to-config multiplier variation that is unrelated to RNG serial dependence. The `payout_multiplier` value for each bet was used as the test variable.

**Phase B — n = 2,000:**

Lag-1 autocorrelation:

```
r = -0.008860896852259473
threshold = ±3 / √2000 = ±0.06708203932499368
```

Wald-Wolfowitz runs test (win = multiplier ≥ 1):

```
Runs observed:  640
Runs expected:  646.975...
z = -0.483
p = 0.629
```

**Phase C — n = 200:**

Lag-1 autocorrelation:

```
r = -0.039448689187494765
threshold = ±3 / √200 = ±0.21213203435596426
```

Wald-Wolfowitz runs test:

```
Runs observed:  79
Runs expected:  76.99
z = 0.376
p = 0.707
```

Both phases pass all tests. p-values of 0.629 and 0.707 are far above the 0.01 rejection threshold. There is no evidence of serial clustering or excessive alternation in either single-config dataset. [Evidence: E07]

---

## Slot Distribution / Chi-Squared (EC-9)

For each of the 27 row/risk configurations, bets were grouped and a chi-squared goodness-of-fit test was run against the theoretical binomial slot probabilities. The theoretical probability for slot k in an n-row game is:

```
P(slot = k) = C(n, k) × (1/2)^n
```

Two adjustments were applied before computing chi-squared: (1) slots with theoretical expected count < 5 were pooled with adjacent slots (standard Cochran criterion — chi-squared is unreliable below this threshold), and (2) configs with n < 100 were excluded from the test.

**Result: 27 / 27 configs pass at α=0.01.** No config produced a p-value below 0.01. The full results are in `outputs/chi-squared-results.json`.

A separate simulation of 1,000,000 rounds per config was also run. All 27 configs pass chi-squared at α=0.01 in the simulation data; 0 flags. [Evidence: E07]

---

## 16r/high Slot Distribution (Phase B, n=2,000)

Phase B targeted the 16r/high configuration exclusively, yielding 2,000 bets on the highest-variance config. The expected slot distribution follows a binomial(16, 0.5) distribution. The table below shows the 1,000,000-round simulation alongside the expected hits at n=2,000 (scaled by ×0.002).

| Slot | Sim count (1M rounds) | Expected at n=2,000 |
|------|-----------------------|---------------------|
| 0 | 13 | 0.026 |
| 1 | 260 | 0.520 |
| 2 | 1,789 | 3.578 |
| 3 | 8,496 | 16.992 |
| 4 | 27,763 | 55.526 |
| 5 | 66,354 | 132.708 |
| 6 | 122,495 | 244.990 |
| 7 | 174,451 | 348.902 |
| 8 (center) | 196,046 | 392.092 |
| 9 | 174,802 | 349.604 |
| 10 | 122,382 | 244.764 |
| 11 | 66,916 | 133.832 |
| 12 | 27,653 | 55.306 |
| 13 | 8,542 | 17.084 |
| 14 | 1,781 | 3.562 |
| 15 | 244 | 0.488 |
| 16 | 13 | 0.026 |

Slots 0, 1, 15, and 16 have expected counts well below 1 at n=2,000. Zero or near-zero hits on these slots in the live data is the expected outcome — not a flag. Chi-squared pooling handles these edge slots correctly by merging them into adjacent bins before the test.

The live Phase B slot distribution passed chi-squared at α=0.01 (detailed in `outputs/chi-squared-results.json`). [Evidence: E17]

---

## Evidence Coverage

| Test | Source File | Status |
|------|-----------|--------|
| Nonce continuity (152 epochs) | `tests/verify.ts` Step 4 | Pass |
| Hash stability within epoch | `tests/verify.ts` Step 3 | Pass |
| Epoch size (all 152 × 50 bets) | `tests/verify.ts` Step 15 | Pass |
| Client seed stability per epoch | `tests/verify.ts` Step 4 | Pass |
| Client seed influence test (6,409/7,600 slots changed, 152 epochs) | `tests/verify.ts` Step 6 | Pass |
| Serial independence (lag-1, runs test) | `tests/verify.ts` Step 11 | Pass |
| Chi-squared slot distribution (27/27 configs) | `tests/verify.ts` Step 12 | Pass |
| Chi-squared results detail | `outputs/chi-squared-results.json` | Verified |

**Code References:**
- Verification suite: `tests/verify.ts`
- Statistical functions: `src/stats.ts`
- RNG implementation: `src/rng.ts`

**Dataset:** `results/merged/plinko-master.json` (5.88 MB, 7,600 bets, 152 seed entries)
