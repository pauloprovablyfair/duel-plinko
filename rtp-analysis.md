# Return to Player Analysis

**Audit:** Duel.com Plinko\
**Version:** 1.0\
**Date:** February 2026\
**Auditor:** [ProvablyFair.org](https://www.provablyfair.org)

---

## Overview

This chapter presents the return-to-player (RTP) analysis for Duel.com Plinko across all 27 configurations. The primary RTP evidence is analytical, not statistical. Empirical RTP values from live bets are reported as informational context only. All figures are taken directly from `outputs/verification-results.json` and `outputs/simulation-results.json`.

---

## Analytical RTP Proof

The 99.900% theoretical RTP is established via a two-step chain verified in Step 20 (EC-33):

1. **Probability independence:** The slot probabilities in `plinkoConfig.json` exactly equal the independent binomial distribution B(rows, 0.5). Verified exhaustively across all 27 configurations and all slots: `binomProb(rows, k) = C(rows,k) × 0.5^rows`. This check is performed in `tests/verify.ts` using `binomProb()` from `stats.ts` — a function that does not reference `plinkoConfig.json` in any way.

2. **RTP cross-check:** With independently verified probabilities, the theoretical RTP is `Σ binomProb(rows, k) × scalingEdgeMultiplier(rows, risk, k)` — a mathematical identity, not a measurement. The result is 99.900% for all 27 configurations.

This proof is non-circular. The casino supplies the multiplier table (`scaling_edge`). The probabilities are independently computed. The RTP conclusion does not depend on any casino-supplied probability value.

Source: `outputs/verification-results.json` Step 20.

---

## Empirical RTP (Informational Only)

Per-config empirical RTP is not used as fairness evidence. At n = 116–285 bets per config with multipliers up to 1009×, no sample-based RTP test has meaningful statistical power. A casino returning 50% RTP would produce empirical values statistically indistinguishable from 99.9% at these sample sizes.

Observed aggregate empirical RTP by phase:

| Phase | Bets | Empirical RTP |
|-------|------|---------------|
| A (all 27 configs, $0.01) | 5,400 | 96.671% |
| B (16r/high only, $0.01) | 2,000 | 84.683% |
| C (16r/high only, $10.00) | 200 | 119.000% |

Variation across phases is expected given high-variance configurations and small per-config sample sizes. The Phase B result (84.683%) reflects that no jackpot was hit in 2,000 bets of 16r/high (jackpot probability ≈ 0.0015%). These values are not anomalies — they are expected sampling noise. RTP is proven analytically.

Source: `outputs/verification-results.json` Step 10.

---

## Slot Symmetry (All 16r/high Bets)

Step 12 of the verification tested slot distribution symmetry for the highest-variance configuration (16r/high) using n = 2,450 bets — 250 from Phase A, 2,000 from Phase B, and 200 from Phase C. Phase D bets are excluded from slot symmetry analysis: Phase D averaged 50 bets per covered config (500 bets / 10 configs — one epoch of 50 bets per config), which is below the chi-squared minimum threshold of 100.

| Metric | Value |
|--------|-------|
| Chi-squared statistic | 7.364133740301773 |
| Degrees of freedom | 12 |
| p-value | 0.8334039197729456 |
| n | 2,450 |

A p-value of 0.833 indicates no evidence of slot bias. The distribution of landing positions is consistent with the theoretical binomial distribution for 16 rows.

---

## Simulation Results

To supplement the live data, a Monte Carlo simulation was run across all 27 configurations using the auditor's independent implementation of the HMAC-SHA256 algorithm documented in `rng-algorithm-analysis.md`. Expected counts for chi-squared testing were computed from the independent binomial B(n, 0.5) — not from `plinkoConfig.json`.

| Metric | Value |
|--------|-------|
| Total rounds simulated | 27,000,000 |
| Rounds per configuration | 1,000,000 |
| Configurations tested | 27 |
| Avg theoretical RTP | 99.900% |
| Avg simulated RTP | 99.892% |
| Chi-squared fails at uncorrected α=0.01 | 1 / 27 (8r/high, p=0.0059) |
| Chi-squared fails at Bonferroni α/27 ≈ 0.00037 | 0 / 27 |

The single fail at uncorrected α=0.01 (8r/high, p=0.0059) is a false positive within the expected FWER range for 27 independent tests (FWER = 1−0.99²⁷ ≈ 23.8%). All 27 configurations pass at the Bonferroni-corrected threshold. P-values are computed via the regularized incomplete gamma function (Lanczos log-Γ, series/continued-fraction expansion for the incomplete gamma). Accuracy: 14+ significant digits.

Source: `outputs/simulation-results.json`

---

## Conclusion

RTP is proven analytically: independently verified binomial probabilities (Step 20, EC-33) × the observed `scaling_edge` multiplier table = 99.900% for all 27 configurations. This is a mathematical proof, not a statistical estimate. The simulation chi-squared (0/27 reject at Bonferroni threshold) and live-bet slot symmetry test (p=0.833) provide corroborating evidence. The RTP evidence does not support any hypothesis of payout manipulation.
