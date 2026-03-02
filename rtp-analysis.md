# Return to Player Analysis

**Audit:** Duel.com Plinko\
**Version:** 1.0\
**Date:** February 2026\
**Auditor:** [ProvablyFair.org](https://www.provablyfair.org)

---

## Overview

This chapter presents the return-to-player (RTP) analysis for Duel.com Plinko across all 27 configurations using a 27-million-round simulation and per-config z-tests against the live dataset. All figures are taken directly from `outputs/verification-results.json` and `outputs/simulation-results.json`. No values have been rounded or approximated.

---

## Per-Config Z-Test: Theoretical Variance Method

Each of the 27 configurations was tested independently using a one-sample z-test against the theoretical RTP of 1.0 (representing 100% of the expected payout ratio per config). The standard error formula is:

```
SE = √(variance / n)
```

where `variance` is the theoretical payout variance for the configuration:

```
variance = Σ P(s) × (m(s) − RTP_theoretical)²
```

summed over all slots `s`, with `P(s)` the theoretical probability of landing in slot `s` and `m(s)` the multiplier for that slot.

**Why theoretical variance is required here:** At N = 116–285 bets per config, the jackpot slot (probability 0.00153% for the highest-variance configs) is expected to appear 0 or 1 times. Sample variance computed from a run with 0 jackpot hits would measure near-zero dispersion and produce a wildly inflated z-score, falsely flagging the config as suspicious. Using the theoretical variance treats the jackpot slot as having its proper weight regardless of whether it appeared in the sample. This is the methodologically correct approach for high-variance distributions at small n, as documented in `PLAN.md`.

---

## Per-Config RTP Results

All 27 configurations were tested. The `configsFailed = 0` result from `outputs/verification-results.json` confirms no configuration exceeded the 5σ threshold. The table below shows all 27 configs with exact values.

| Config | n | RTP (exact) | z-Score (exact) | Theoretical SE (exact) |
|--------|---|-------------|-----------------|------------------------|
| 10r/low | 200 | 1.0246913843000005 | 0.6830997804823482 | 0.03761000227793865 |
| 9r/medium | 200 | 1.0716459597000019 | 0.7960275202991316 | 0.09126061329224264 |
| 14r/medium | 200 | 0.8804839321999979 | −1.2191374929744616 | 0.0972130448640749 |
| 16r/low | 200 | 1.006581213049999 | 0.3200996898810772 | 0.023683912511178885 |
| 11r/medium | 200 | 1.0179317412500015 | 0.23786122753049432 | 0.07959153934650585 |
| 12r/low | 200 | 1.0128325361499984 | 0.49962886194838013 | 0.027685622676112496 |
| 16r/medium | 200 | 0.9360420395499983 | −0.601288422503916 | 0.10470509341894348 |
| 14r/low | 200 | 1.0368383517999984 | 1.6625429330539763 | 0.022759323111429045 |
| 13r/medium | 150 | 1.010496170533334 | 0.10291926645928953 | 0.11170085960417678 |
| 10r/high | 200 | 1.184429527149998 | 0.7135558129680926 | 0.25986688606556096 |
| 14r/high | 200 | 0.7302375462500011 | −0.675172593836299 | 0.39806481513549474 |
| 8r/medium | 200 | 0.9353038881000004 | −0.7204483988276571 | 0.08841176134702843 |
| 11r/high | 116 | 1.1533692587931035 | 0.39999103538238184 | 0.38593179631021024 |
| 8r/high | 150 | 1.0259341331333338 | 0.12249059884695511 | 0.21988734961600157 |
| 15r/high | 264 | 0.828073888977276 | −0.45843329036269587 | 0.3728483829948158 |
| 16r/high | 250 | 0.7961603750000046 | −0.48398759509546235 | 0.41910087583956995 |
| 13r/high | 150 | 0.6197104918666663 | −0.9506140754069412 | 0.3989942058989254 |
| 12r/high | 250 | 1.0187931838400084 | 0.070878894908471 | 0.27925356152304837 |
| 10r/medium | 200 | 0.9757057840999984 | −0.27054594943779803 | 0.0861007749271708 |
| 9r/low | 200 | 1.017324201149999 | 0.556836486952499 | 0.032907687587581065 |
| 15r/low | 200 | 0.9677098297999973 | −1.0694531203695135 | 0.029258103608310968 |
| 8r/low | 250 | 1.0136908998400052 | 0.41245193813099057 | 0.03561845267736256 |
| 13r/low | 200 | 1.0746924192499991 | 2.254821688168754 | 0.03356913748309406 |
| 9r/high | 200 | 1.0165218928999968 | 0.08347826187962509 | 0.20989767282485172 |
| 11r/low | 200 | 0.9419491969000017 | −1.810887802840081 | 0.03150432788299942 |
| 12r/medium | 186 | 0.8404577651075266 | −1.6638544960954194 | 0.09528611742464606 |
| 15r/medium | 234 | 1.0246318096153875 | 0.24924445245476132 | 0.10283803455982526 |

### Five Most Extreme Z-Scores

The five configurations with the highest absolute z-scores are shown below. All pass the 5σ threshold.

| Rank | Config | z-Score (exact) | |z-Score| | Pass 5σ? |
|------|--------|-----------------|-----------|----------|
| 1 | 13r/low | 2.254821688168754 | 2.254821688168754 | Yes |
| 2 | 11r/low | −1.810887802840081 | 1.810887802840081 | Yes |
| 3 | 12r/medium | −1.6638544960954194 | 1.6638544960954194 | Yes |
| 4 | 14r/low | 1.6625429330539763 | 1.6625429330539763 | Yes |
| 5 | 14r/medium | −1.2191374929744616 | 1.2191374929744616 | Yes |

The most extreme result, 13r/low at z = 2.254821688168754, reflects a slightly above-average return for that config over 200 bets. It is well within the 5σ acceptance threshold and does not indicate a structural anomaly.

---

## Slot Symmetry (All 16r/high bets)

Step 12 of the verification tested slot distribution symmetry for the highest-variance configuration (16r/high) using n = 2,450 bets — 250 from Phase A, 2,000 from Phase B, and 200 from Phase C.

| Metric | Value |
|--------|-------|
| Chi-squared statistic | 7.364133740301773 |
| Degrees of freedom | 12 |
| p-value | 0.8334039197729456 |
| n | 2,450 |

A p-value of 0.833 indicates no evidence of slot bias. The distribution of landing positions is consistent with the theoretical binomial distribution for 16 rows.

---

## Simulation Results

To supplement the live data, a Monte Carlo simulation was run across all 27 configurations using the auditor's independent implementation of the HMAC-SHA256 algorithm documented in `rng-algorithm-analysis.md`.

| Metric | Value |
|--------|-------|
| Total rounds simulated | 27,000,000 |
| Rounds per configuration | 1,000,000 |
| Configurations tested | 27 |
| Avg theoretical RTP | 99.900% |
| Avg simulated RTP | 99.890% |
| Chi-squared flags at α = 0.01 | 0 / 27 |

All 27 configurations pass the chi-squared uniformity test at α=0.01. The 0.010 percentage point difference between theoretical (99.900%) and simulated (99.890%) RTP is within expected Monte Carlo sampling error at 1,000,000 rounds per config.

Source: `outputs/simulation-results.json`

---

## Conclusion

No configuration exceeds the 5σ threshold in per-config z-testing. The slot symmetry test passes cleanly. The live-bet chi-squared passes all 27 configurations at α=0.01 (primary evidence). The 27-million-round simulation passes all 27 configurations. The RTP evidence does not support any hypothesis of payout manipulation.
