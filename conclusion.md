# Conclusion

**Audit:** Duel.com Plinko\
**Version:** 1.0\
**Date:** February 2026\
**Auditor:** [ProvablyFair.org](https://www.provablyfair.org)

---

## Verdict: PROVABLY FAIR — Full Pass

The Duel.com Plinko implementation passes all 19 applied evidence criteria (drawn from EC-1 through EC-32). Zero hard fails. Zero flags requiring remediation.

---

## Hard-Fail Criteria

Six criteria carry automatic-fail weight. All six passed.

| Criterion | Description | Result |
|-----------|-------------|--------|
| EC-1 | Seed hash integrity | 152/152 seeds verified: SHA-256(hexDecode(serverSeed)) = serverSeedHashed |
| EC-4 | Nonce monotonic | 152/152 epochs: nonces sequential 0–49; 5 epochs produced a nonce-50 artifact (capture-retry, informational only) |
| EC-5 | Client seed stable | 152/152 epochs: single client_seed throughout each epoch |
| EC-7 | Slot recomputation | 7,600/7,600 bets: HMAC-SHA256 recompute matches recorded slot exactly |
| EC-26 | Hash stable within epoch | 152/152 epochs: serverSeedHashed unchanged across all 50 bets |
| EC-27 | Client seed actually used | 6,409/7,600 slots (84.3%) changed outcome when an incorrect client seed was substituted across all 152 epochs; additionally confirmed by Phase D: 500/500 bets recomputed correctly across 10 distinct client seeds [Evidence: E16] |

No hard-fail criterion was triggered.

---

## Full EC Check Summary

19/19 checks: PASS. 0 hard fails. 0 flags.

---

## RNG Algorithm

**Algorithm:** HMAC-SHA256, applied once per row per bet.\
**Key:** `hexDecode(serverSeed)` — the raw bytes of the hex-encoded server seed.\
**Message:** `clientSeed:nonce:cursor` — where `cursor` is the zero-indexed row number.\
**Direction logic:** `slot += readUInt32BE(HMAC_output, 0) % 2` — odd uint32 → right; even uint32 → left.\
**Epoch structure:** Commit-reveal. Server commits SHA-256(hexDecode(serverSeed)) before the epoch begins. Each epoch covers exactly 50 bets (nonces 0–49). After 50 bets, the seed rotates and the prior serverSeed is revealed for independent verification.

---

## Dataset

| Metric | Value |
|--------|-------|
| Primary bets captured | 7,600 (Phase A: 5,400 · Phase B: 2,000 · Phase C: 200) |
| Supplementary bets (Phase D) | 500 (client seed verification — 10 configs, 10 client seeds) |
| Bets verified (recomputed) | 7,600 / 7,600 (primary) · 500 / 500 (Phase D) — 0 mismatches |
| Seed entries (primary) | 152 (149 rotations + 3 pre-capture commitments — all 152 revealed) |
| Seed entries (Phase D) | 11 (10 rotations + 1 pre-capture commitment — all 10 revealed) |
| Dataset SHA-256 | `8382e45f8cdf4d439a8866669d15e6f4be543f4b926fb64c67e09d9da7d6b2db` |
| Phase D dataset | `results/plinko-phase-d.json` [Evidence: E16] |

---

## Simulation

27,000,000 rounds across 27 game configurations (9 row counts × 3 risk levels).

| Metric | Value |
|--------|-------|
| Total rounds | 27,000,000 |
| Configurations tested | 27 |
| Avg simulated RTP | 99.890% |
| Avg theoretical RTP | 99.900% |
| Chi-squared flags at α=0.01 (simulation) | 0/27 |
| Chi-squared fails at α=0.01 (live bets) | 0/27 |

Simulated RTP tracks theoretical RTP within expected Monte Carlo error across all 27 configs. All 27 configs pass the simulation chi-squared. The distribution of outcomes is statistically consistent with the declared multiplier table.

---

## Informational Finding

One finding was logged as informational. It does not affect the verdict.

**Progressive house edge (not manipulation).** `plinkoConfig.json` defines 191 bet-size brackets per configuration. House edge scales from 0.001 (0.1%) at low stakes to 0.02 (2%) at high stakes. All test bets in this audit ($0.01 and $10) fell within bracket 0 — the base 0.1% house edge. The RNG itself is not affected. The finding is informational because the scaling is not disclosed in the game UI.

---

## Evidence Coverage

All quantitative claims in this chapter are derived from:

- `outputs/verification-results.json` — EC checks, per-bet recomputation results, seed hash verification, nonce sequence analysis, client seed stability, wrong-seed delta test
- `outputs/simulation-results.json` — 27,000,000-round simulation across 27 configs, RTP figures, chi-squared results
