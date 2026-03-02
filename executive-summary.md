# Executive Summary

**Audit Version:** 1.0\
**Platform:** Duel.com\
**Game:** Plinko\
**Date:** February 2026\
**Conducted by:** [ProvablyFair.org](https://www.provablyfair.org)

---

## What Was Tested

ProvablyFair.org collected 7,600 live Plinko bets from Duel.com across three primary structured phases (A–C), with one supplementary Phase D run post-collection:

| Phase | Bets | Stake | Config | Purpose |
|-------|------|-------|--------|---------|
| A — Configuration coverage | 5,400 | $0.01/bet | All 27 configs (9 row counts × 3 risk levels) | Verify every config behaves correctly |
| B — High-variance sampling | 2,000 | $0.01/bet | 16 rows / high risk | Deep binomial distribution test on highest-variance config |
| C — Code-path equivalence | 200 | $10.00/bet | 16 rows / high risk | Confirm bet amount is not in the RNG |
| D — Client seed verification *(supplementary)* | 500 | $0.01/bet | All 27 configs (random) | Confirm client seed is genuinely used in HMAC computation |

The primary dataset (Phases A–C) covers 152 seed entries — 149 epoch rotations + 3 pre-capture commitment records. Phase D (supplementary, `results/plinko-phase-d.json`) adds 11 further seed entries (10 rotations + 1 pre-capture commitment). Total wagered: $54.00 (Phase A) + $20.00 (Phase B) + $2,000.00 (Phase C) + $5.00 (Phase D).

The verification codebase is an independent TypeScript implementation of the published HMAC-SHA256 algorithm — written from the cryptographic specification, not derived from Duel.com's code.

---

## What This Means for Players

Duel.com Plinko uses a commit-reveal scheme: before each betting epoch, the server publishes a SHA-256 hash of its seed. The player sets their own client seed. The game then computes each row's outcome using HMAC-SHA256(key=hexDecode(serverSeed), message=clientSeed:nonce:cursor). The server cannot change its seed after the commitment is published without the mismatch becoming detectable. The player's client seed genuinely affects every outcome — substituting a wrong client seed changed 6,409 of 7,600 slots (84.3%) across all 152 epochs. Bet amount is not an input to the RNG; $10 bets produce the same slot distribution as $0.01 bets for the same config.

The platform pays out according to multiplier tables derived from the published `plinkoConfig.json`. At our test amounts ($0.01 and $10), all bets fall in bracket 0 of the progressive edge structure, where the house edge is 0.1%. The theoretical RTP across all 27 configs is 99.900%.

---

## Verdict Summary

| Check | Result |
|-------|--------|
| Commit-reveal integrity (EC-1, EC-2, EC-26) | PASS |
| Nonce sequence (EC-2, EC-3, EC-4, EC-5) | PASS |
| Slot recomputation — 7,600/7,600 bets (EC-6, EC-7) | PASS |
| Client seed influence — 6,409/7,600 slots changed (84.3%, 152 epochs) (EC-27) | PASS |
| Payout math — all 7,600 bets within 1e-8 (EC-11, EC-18) | PASS |
| Multiplier table provenance (EC-28, EC-32) | PASS |
| Multiplier symmetry and floor checks (EC-10, EC-12, EC-13, EC-14) | PASS |
| Code-path equivalence Phase C (EC-15, EC-16) | PASS |
| RTP analysis — all phases and all 27 configs (EC-19–22) | PASS |
| Serial independence (EC-29) | PASS |
| Slot symmetry — 0/27 chi-squared fails at α=0.01 (EC-9) | PASS |
| Zero Edge audit (EC-23) | PASS |
| Config completeness (EC-30) | PASS |
| Epoch size (EC-31) | PASS |
| Phase labels (EC-24) | PASS |
| Dataset hash (EC-25) | PASS |
| Scaling edge analysis (EC-17, EC-32) | PASS |
| **EC checks passed** | **19 / 19** |
| **Hard fails** | **0** |
| **Flags** | **0** |
| **Verdict** | **PROVABLY FAIR — Full Pass** |

---

## Key Findings

### Finding 1: Slot Recomputation — 7,600/7,600 Bets Verified

For every bet in the dataset where the server seed had been revealed (7,600 bets), the auditor independently computed the slot using:

```
key     = hexDecode(serverSeed)
message = clientSeed + ":" + nonce + ":" + cursor   (cursor = 0 to rows-1)
hmac    = HMAC-SHA256(key, message)
bit     = parseInt(hmac[0..7], 16) % 2
slot   += bit                                        (right = 1, left = 0)
```

Every computed slot matched `final_slot` in the dataset. Mismatch count: 0. This confirms the RNG is deterministic and uses no hidden inputs beyond (serverSeed, clientSeed, nonce). [Source: outputs/verification-results.json steps 5, 6]

### Finding 2: Commit-Reveal Chain — 152 Seeds Verified

For each of the 152 seed entries, the auditor verified:

```
SHA-256(hexDecode(revealedServerSeed)) == serverSeedHashed
```

All 152 checks passed. The 3 pre-capture commitment records were additionally verified to match the `server_seed_hashed` field in the first bet response of their respective phases. The server cannot retroactively choose seed values without this check detecting it. [Source: evidence/E01–E06-phase-*.png]

### Finding 3: Client Seed Influence — Player Randomness is Real

All 152 epochs were recomputed using a deliberately incorrect client seed and compared to the correct result. Across all 7,600 bets, 6,409 slots (84.3%) changed. Per-epoch change rates ranged from 37/50 to 50/50 — no epoch produced identical outcomes with the wrong seed. The unchanged slots are expected: for any given row, there is a 50% probability the HMAC bit coincidentally matches. The aggregate result confirms the client seed is a genuine HMAC input to every outcome. [Source: outputs/verification-results.json step 6]

### Finding 4: drand Absent from Plinko RNG

Plinko API responses contain no `drand_round` or `drand_randomness` fields — both are absent from all 7,600 captured responses. Slot recomputation using only (serverSeed, clientSeed, nonce) reproduced all 7,600 slots. drand is not part of the Plinko RNG. (drand is used in other Duel.com games.) [Source: outputs/verification-results.json step 5]

### Finding 5: Progressive House Edge Structure (Informational)

`plinkoConfig.json` contains a `scaling_edge` array with 191 bet-size brackets per config. House edge (as 1 − RTP) scales from 0.001 (0.1%) in bracket 0 up to 0.02 (2.0%) at the highest stake bracket. For the 16r/high config, bracket 0 covers bets up to $335.946312864870400000. Both test amounts ($0.01 and $10) fall in bracket 0.

This is a disclosed progressive edge structure — higher-stake bets receive lower multipliers. It does not constitute manipulation. The audit's RTP figures apply to the bracket-0 edge (0.1%). Players betting above the bracket-0 ceiling face a higher effective house edge; this is reflected in the multiplier table returned by the server for their stake amount.

All 7,600/7,600 live bets were matched against the `scaling_edge[0].multipliers` reference table with zero mismatches, confirming no amount-dependent table switching occurred within the tested stake range. [Source: outputs/verification-results.json steps 8, 19]

### Finding 6: Simulation — 27M Rounds, 27/27 Chi-Squared Pass

A 27,000,000-round Monte Carlo simulation (1,000,000 rounds per config, 27 configs) produced:

- Average simulated RTP: 99.890%
- Average theoretical RTP: 99.900%
- Chi-squared goodness-of-fit test at α=0.01: 27/27 pass; 0 flags

All 27 configs pass both the simulation chi-squared and the live-bet chi-squared. α=0.01 applied as a conservative uniform threshold; Bonferroni correction was not applied, as the 27 configurations are independent by design. [Source: outputs/simulation-results.json]

### Finding 7: Phase C Equivalence — Bet Amount Not in RNG

Phase C placed 200 bets at $10 (the same 16r/high config as Phase B's $0.01 bets). Slot recomputation passed for all 200 Phase C bets. A two-sample Kolmogorov-Smirnov test comparing Phase B and Phase C slot distributions yielded D=0.0695 — no significant difference. All Phase C payout multipliers were found in the same `scaling_edge[0].multipliers` table as Phase B.

Phase C empirical RTP was 119.0001% ($2,380.00 won on $2,000.00 wagered) due to two slot-2 hits (26.24× multiplier, third position from edge, $262.43 each on $10 bets) in the 200-bet sample. At N=200 on 16r/high, the theoretical-variance 95% CI half-width is approximately ±92% of the theoretical RTP (1.96 × √(43.91/200) = 0.918; as a fraction of theoretical RTP: 0.918/0.999 = 91.9%); this is expected variance, not an anomaly. [Source: plinkoConfig.json + rtp-analysis.md σ framework]

---

## Evidence Coverage

The complete evidence index is in `evidence.md`. Key artifacts:

| Artifact | File |
|----------|------|
| Phase start/complete screenshots | `evidence/E01–E06-phase-*.png` |
| Game and fairness page screenshots | `evidence/S01–S10-*.png` |
| Slot recomputation + all 19 verification steps | `outputs/verification-results.json` |
| Per-bet recomputation log (7,600 entries) | `outputs/determinism-log.json` |
| Chi-squared on live bets (27 configs) | `outputs/chi-squared-results.json` |
| Monte Carlo simulation (27M rounds) | `outputs/simulation-results.json` |
| Master dataset · SHA-256: `8382e45f8cdf4d439a8866669d15e6f4be543f4b926fb64c67e09d9da7d6b2db` | `results/merged/plinko-master.json` |
