# Technical Security Audit of Duel.com Plinko

**Audit Conducted By:** [ProvablyFair.org](https://www.provablyfair.org)\
**Date:** February 2026\
**Game:** Plinko\
**Platform:** [Duel.com](https://duel.com)\
**Audit Version:** 1.0\
**Dataset SHA-256:** `8382e45f8cdf4d439a8866669d15e6f4be543f4b926fb64c67e09d9da7d6b2db`

---

> **Verdict:** Duel.com Plinko is PROVABLY FAIR — all 19 edge-case checks passed, 0 hard fails, 0 flags; every verified bet's slot was independently reproduced from (serverSeed, clientSeed, nonce) using HMAC-SHA256.

| Metric | Value |
|--------|-------|
| Primary bets collected | 7,600 (Phase A: 5,400 · Phase B: 2,000 · Phase C: 200) |
| Supplementary bets (Phase D) | 500 (client seed verification — all 27 configs, 10 client seeds) |
| Seed entries (primary) | 152 (149 rotations + 3 pre-capture commitments — all 152 revealed) |
| Seed entries (Phase D) | 11 (10 rotations + 1 pre-capture commitment — all 10 revealed) |
| Bets verified by slot recomputation | 7,600 / 7,600 (primary) · 500 / 500 (Phase D) — 0 mismatches |
| Simulation | 27,000,000 rounds × 27 configs |
| Avg simulated RTP | 99.890% |
| Avg theoretical RTP | 99.900% |
| Chi-squared flags at α=0.01 (simulation) | 0 / 27 configs |
| Chi-squared fails at α=0.01 (live bets) | 0 / 27 configs |
| Phase A empirical RTP | 96.6714% (high-variance sample, expected at N=5,400) |
| Phase B empirical RTP | 84.6829% (16r/high, high-paying slots undersampled, z=−1.03, expected variance) |
| Phase C empirical RTP | 119.0001% (200 bets at $10, two slot-2 hits (26.24×, third position from edge)) |
| Total wagered | Phase A: $54.00 · Phase B: $20.00 · Phase C: $2,000.00 · Phase D: $5.00 |
| EC checks | 19 / 19 PASS |
| Hard fails | 0 |
| Flags | 0 |

---

## Audit Verdict

The 19 checks below cover 31 EC criteria (EC-1 through EC-32; EC-8 is not defined — see PLAN.md). Related criteria are grouped into a single check row; each row may map to one or more EC references.

| # | Check | EC Refs | Result | Finding |
|---|-------|---------|--------|---------|
| **Commit-Reveal Integrity** | | | | |
| 1 | Seed hash integrity | EC-1 | ✅ PASS | SHA-256(hexDecode(serverSeed)) = serverSeedHashed for all 152 seeds |
| 2 | Commitment linkage | EC-2 | ✅ PASS | All 3 pre-capture commitments match first bet response hash for each phase |
| 3 | Hash consistency within epoch | EC-26 | ✅ PASS | server_seed_hashed identical across all 50 bets in each of 152 epochs |
| 4 | Nonce audit | EC-2, EC-3, EC-4, EC-5 | ✅ PASS | Nonces sequential 0–49 in all 152 epochs; 5 capture-retry artifacts (informational — slot recomputation passes for all) |
| **RNG Determinism** | | | | |
| 5 | Slot recomputation + drand absent | EC-6, EC-7 | ✅ PASS | 7,600/7,600 bets: HMAC-SHA256(hexDecode(serverSeed), clientSeed:nonce:cursor) matches final_slot; drand fields not used |
| 6 | Client seed influence | EC-27 | ✅ PASS | Wrong client seed changed 6,409/7,600 slots (84.3%) across 152 epochs — player randomness is real |
| **Payout & Multiplier Tables** | | | | |
| 7 | Payout math | EC-11, EC-18 | ✅ PASS | All 7,600 bets: win_amount = amount_currency × payout_multiplier within 1e-8 |
| 8 | Multiplier table provenance | EC-28, EC-32 | ✅ PASS | 7,600/7,600 bets match scaling_edge[0].multipliers; theoretical RTP = 99.900% (computed from payout_tables via config.theoreticalRTP()) |
| 16 | Multiplier table + symmetry | EC-10, EC-12, EC-13, EC-14 | ✅ PASS | All 27 configs: multipliers match table (tolerance 1e-5), slot symmetry verified, 16r/high 0.2× floor holds |
| **Code-Path Equivalence (Phase C)** | | | | |
| 9 | Phase C equivalence | EC-15, EC-16, EC-17 | ✅ PASS | $10 bets produce identical RNG outputs; KS D=0.0695, no significant distribution difference from Phase B |
| **RTP & Statistical** | | | | |
| 10 | RTP analysis | EC-19, EC-20, EC-21, EC-22 | ✅ PASS | All phases within 5σ of 99.9%; all 27 per-config z-scores pass |
| 11 | Serial independence | EC-29 | ✅ PASS | Lag-1 r=−0.0089 (threshold ±0.06708203932499368); runs z=−0.483, p=0.629 |
| 12 | Slot symmetry | EC-9 | ✅ PASS | All configs with n≥100 pass chi-squared symmetry test (p>0.01) |
| **Dataset Integrity** | | | | |
| 13 | Zero Edge audit | EC-23 | ✅ PASS | edge_0.1 (6,983 bets) and edge_0 (617 bets) groups use identical multiplier table |
| 14 | Config completeness | EC-30 | ✅ PASS | Total Phase A bets correct (5,400/5,400); 10 configs off 200-bet target due to session restart (collection artifact — all bets individually verified) |
| 15 | Epoch size | EC-31 | ✅ PASS | All 152 epochs contain exactly 50 bets |
| 17 | Phase labels | EC-24 | ✅ PASS | All 7,600 bets and 152 seed entries carry valid phase labels (A/B/C) |
| 18 | Dataset hash | EC-25 | ✅ PASS | SHA-256: `8382e45f8cdf4d439a8866669d15e6f4be543f4b926fb64c67e09d9da7d6b2db` |
| 19 | Scaling edge analysis | EC-17, EC-32 | ✅ PASS | All 27 configs: bracket[0] house_edge=0.001; both test amounts ($0.01, $10) fall in bracket 0 |
| **Informational Finding** | | | | |
| — | Progressive house edge structure | EC-17, EC-32 | ℹ️ INFO | plinkoConfig reveals 191 bet-size brackets per config; house edge scales from 0.001 to 0.02 at high stakes. All test amounts fall in bracket 0. Not manipulation — disclosed progressive edge structure. |

---

## Table of Contents

* [Executive Summary](executive-summary.md)
* [Game Rules](game-rules.md)
* [System Architecture](system-architecture.md)
* [RNG Algorithm Analysis](rng-algorithm-analysis.md)
* [Game Logic Verifiability](game-logic-verifiability.md)
* [Live Parity Testing](live-parity-testing.md)
* [Edge Case Analysis](edge-case-analysis.md)
* [Adversarial Testing](exploit-testing.md)
* [Audit Findings](findings.md)
* [Payout Verification](payout-verification.md)
* [RTP Analysis](rtp-analysis.md)
* [Operator Trust Analysis](operator-trust-analysis.md)
* [Conclusion](conclusion.md)
* [Recommendations](recommendations.md)
* [Reproducibility Guide](reproducibility.md)
* [Glossary](glossary.md)
* [Evidence Appendix](evidence.md)
