# Operator Trust and Configuration Analysis

**Audit:** Duel.com Plinko\
**Version:** 1.0\
**Date:** February 2026\
**Auditor:** [ProvablyFair.org](https://www.provablyfair.org)

---

## Overview

This chapter covers the structural integrity of Duel.com Plinko's commit-reveal scheme, the Zero Edge audit, dataset integrity verification, config collection completeness, and a progressive house edge informational finding. All data is sourced from `outputs/verification-results.json`, `results/merged/plinko-master.json`, and `plinkoConfig.json`.

---

## 1. Commit-Reveal Integrity

### How the Scheme Works

Before each epoch, the server generates a server seed and publishes a SHA-256 commitment hash. The player supplies a client seed. Game outcomes are derived from HMAC-SHA256(key=hexDecode(serverSeed), message=clientSeed:nonce:cursor), where cursor is the zero-based row index (one HMAC call per row). After the epoch ends, the server reveals the raw server seed. The player — or any auditor — can independently verify that SHA-256(hexDecode(serverSeed)) equals the commitment hash published before the epoch began.

This mechanism means the server cannot alter outcomes retroactively: any change to the server seed after publication would produce a different hash, which the player can detect immediately. The commitment is binding before any bet is placed.

### Verification Results (Step 1 — Seed Hash Integrity)

- Seeds checked: **152 of 152 total**
- Pre-capture commitment entries: **3** (one per phase start; plaintext seeds retrieved post-collection via the transactions API and hash-verified)
- SHA-256(hexDecode(serverSeed)) = serverSeedHashed: **152 / 152**

Every revealed server seed in the dataset hashes to its published commitment. Zero mismatches.

### Verification Results (Step 2 — Commitment Linkage)

The first bet of each phase was cross-referenced against the commitment hash recorded at session start.

| Phase | Commitment Hash (prefix) | Match |
|-------|--------------------------|-------|
| A | 19935b7406293bd6cdff… | Yes |
| B | 9dcb3d30d0f1c98acf83… | Yes |
| C | 6e5aed8c0b9049765464… | Yes |

All three phases confirm that the commitment hash present at session start matches the server_seed_hashed field on the first bet of that session. No mid-session seed substitution was detected.

### What a Failure Would Mean

If any seed failed its hash check, it would indicate the server altered the server seed after publishing the commitment — a direct breach of provable fairness. No such failure was found.

---

## 2. Zero Edge Audit

### Background

Duel.com offers a "Zero Edge" mode in which the stated house edge is 0%. This audit tested whether Zero Edge users receive a distinct payout table that differs from the standard multiplier table, or whether "Zero Edge" is implemented via the standard table with the same house edge structure.

### Method (Step 13 — EC-23)

All 7,600 bets in the dataset were classified by their `edge` field:

- `edge_0.1` group: standard bets (0.1% stated house edge)
- `edge_0` group: Zero Edge bets

For each bet, the slot outcome was recomputed from first principles using the HMAC-SHA256 algorithm. The resulting multiplier was compared to the multiplier recorded in the dataset.

### Results

| Group | Bets | Multiplier Mismatches |
|-------|------|----------------------|
| edge_0.1 | 6,983 | 0 |
| edge_0 | 617 | 0 |

Both groups use **identical multiplier tables**. Zero Edge users receive the same slot probabilities and the same payouts as standard users. The "Zero Edge" designation does not correspond to a separate, more favorable payout table.

This means the 0.1% house edge embedded in the standard multiplier table applies equally to both groups at standard bet sizes (bracket 0). The Zero Edge label, as implemented, reflects a promotional classification rather than a structural payout difference. No payout manipulation was found in either group.

---

## 3. Dataset Integrity

### SHA-256 Hash Verification (Step 18 — EC-25)

The master dataset used throughout this audit was locked before analysis began.

| Field | Value |
|-------|-------|
| File | results/merged/plinko-master.json |
| Size | 5,883,191 bytes |
| SHA-256 | 8382e45f8cdf4d439a8866669d15e6f4be543f4b926fb64c67e09d9da7d6b2db |

Any post-collection alteration to the dataset would change this hash. All analysis was run against this file.

### Phase Label Verification (Step 17 — EC-24)

| Phase | Bets | Seeds |
|-------|------|-------|
| A | 5,400 | 108 |
| B | 2,000 | 40 |
| C | 200 | 4 |
| **Total** | **7,600** | **152** |

Each phase label was verified against the seed rotation events recorded in the dataset. The per-phase bet totals are exact multiples of 50 (the epoch size), consistent with the epoch structure verified in Step 15.

### Epoch Size Verification (Step 15 — EC-31)

All 152 epochs in the dataset contain exactly **50 bets each**. No epoch was truncated, padded, or anomalous in length. This confirms the server applies a uniform epoch boundary for seed rotation across all phases and configurations.

---

## 4. Config Completeness (Step 14 — EC-30)

### Summary

| Metric | Value |
|--------|-------|
| Total Phase A bets | 5,400 |
| totalCorrect | true |
| Configurations with imbalanced sample | 10 |
| Minimum config sample | 116 bets (11r/high) |
| Bets individually slot-verified | all |

### Collection Artifact

Ten configurations in Phase A show fewer bets than the target 200. This is a collection artifact: the console capture script stores data in localStorage, which hit its browser quota at approximately 4,934 bets, triggering a session restart. After the restart, collection resumed from a new seed epoch. The 10 affected configs had their remaining bets collected in subsequent epochs.

All bets — including those from restarted sessions — were individually verified by recomputing the slot outcome from the raw HMAC-SHA256 derivation and comparing it to the recorded slot. The `totalCorrect = true` result confirms every single bet in the dataset is cryptographically consistent with its server seed, client seed, and nonce. The collection artifact does not affect verification integrity.

The minimum per-config sample is 116 bets (11r/high). The per-config z-test for high-variance configurations uses theoretical variance (not sample variance) precisely because samples of this size cannot be expected to capture the jackpot distribution accurately. See `rtp-analysis.md` for the full methodology.

---

## 5. Progressive House Edge (Informational Finding)

### Structure (Step 19 — EC-17, EC-32)

The multiplier tables in `plinkoConfig.json` are organized into **191 bet-size brackets** per configuration. Each bracket defines a range of bet amounts and a corresponding house edge. The house edge is not flat.

| Bracket | Structure |
|---------|-----------|
| 0 (lowest) | house_edge = 0.001 (0.1%) |
| 190 (highest) | house_edge = 0.02 (2.0%) |

The bracket 0 ceiling for the highest-variance configuration (16r/high) is **$335.946312864870400000**. All bets in this audit ($0.01 for Phases A/B and $10 for Phase C) fall within bracket 0 and therefore face the 0.1% house edge that Duel.com publicly states.

Players betting above bracket 0 thresholds — which vary by configuration — face a progressively increasing house edge, reaching 2.0% at the highest bracket.

### Classification

This finding is **informational**. The bracket structure is present in the configuration data and is a disclosed technical feature of the platform. The audit bets are unaffected. However, the game UI does not prominently surface the bracket thresholds or the progressive house edge schedule to players. A player betting $500 per round on a 16r/high configuration would be subject to a house edge higher than 0.1%, with no in-game indication of the exact rate.

This is not evidence of manipulation. The multiplier tables are consistent with the declared algorithm, and every bet in this dataset was verified against the correct bracket. The finding is noted because it materially affects the effective RTP for higher-stakes players.

---

## 6. What This Means for Players

**Commit-reveal scheme:** The server publishes a SHA-256 hash of its seed before any bet is placed. Once published, the server cannot change the seed without producing a detectable hash mismatch. Players can verify every outcome independently using the published seed, their client seed, and their nonce. This audit confirmed 152/152 hash matches with zero failures.

**Zero Edge bets:** Players using Zero Edge mode receive payouts from the same multiplier table as standard users. The payout structure is identical for both groups at bracket 0 bet sizes.

**Progressive house edge:** Players betting above approximately $336 per round (on the 16r/high configuration; thresholds differ by config) face a house edge above 0.1%, rising to a maximum of 2.0% at the highest bracket. This is not disclosed in the game UI based on this audit's review of the interface. Players at $0.01 to $335 on the 16r/high configuration (the most restrictive) are in bracket 0 and face the standard 0.1% house edge; all other configurations have higher bracket-0 ceilings.

---

## Evidence Sources

| Source | Steps Covered |
|--------|---------------|
| `outputs/verification-results.json` | Steps 1, 2, 13, 14, 15, 17, 18, 19 |
| `results/merged/plinko-master.json` | Master dataset (all phases) |
| `plinkoConfig.json` | Progressive house edge brackets, multiplier tables |
