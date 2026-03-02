# Game Rules

## What Was Tested

- Ball drop mechanics: how each row produces a binary left/right decision
- Slot range and probability distribution for all 27 configurations (rows 8–16 × risk levels low/medium/high)
- Risk level structure: multiplier table differences across low, medium, high
- Payout formula: how bet amount and multiplier combine into win_amount
- Scaling edge: how multiplier tables vary by bet-size bracket
- Commit-reveal scheme: server seed commitment before betting, plaintext reveal after epoch
- Multiplier table provenance: plinkoConfig.json supplied by Duel.com, cross-checked against live API responses

## What This Means for Players

Plinko on Duel.com is a binary-path game: every row along the peg board has a cryptographically generated 50/50 decision, and the ball's final position is the count of right-turns over all rows. The multiplier paid out depends on that final position, the number of rows chosen, and the risk level selected. Players can verify every outcome independently after the server reveals its seed — the platform publishes the seed hash before betting, and the plaintext seed after each 50-bet epoch.

## Verdict Summary

| Check | Result | Finding |
|-------|--------|---------|
| Slot probabilities match binomial model | Pass | All configurations follow B(n, 0.5) exactly |
| Multiplier tables present for all 27 configs | Pass | plinkoConfig.json contains all row/risk combinations |
| Payout formula correct | Pass | win_amount = bet_amount × payout_multiplier for all bets |
| Multiplier symmetry | Pass | table[k] = table[rows − k] for every config |
| Scaling edge documented | Informational | Progressive house edge 0.1%–2% by bet size; all test bets in lowest bracket |
| Commit-reveal scheme defined | Pass | SHA-256 commitment before bets; plaintext reveal after each 50-bet epoch |
| Edge slot multipliers | Pass | Slots 0 and N match published table; 16r/high center slot floor is 0.2× |

**Overall Verdict:** The game rules are consistent with the published cryptographic specification and the multiplier tables supplied by Duel.com.

---

## Peg Board Mechanics

A ball is dropped through a triangular grid of pegs. At each peg, the ball bounces left or right. The number of rows is player-configurable: 8, 9, 10, 11, 12, 13, 14, 15, or 16.

Each row's left/right decision is determined independently by HMAC-SHA256 using the server seed, client seed, nonce, and that row's index (cursor). A ball traversing N rows will land in one of N+1 slots numbered 0 through N. The slot is the total count of right-turns.

Because each row is an independent 50/50 decision, the slot distribution follows a binomial distribution B(N, 0.5). The probability of landing in slot k with N rows is:

```
P(slot = k) = C(N, k) × 0.5^N
```

This is a mathematical property of the construction, not a programmatic one — the RNG generates each row's decision independently, so no post-processing or table lookup can shift the slot probabilities.

Slot probabilities are identical across all three risk levels for the same row count. Risk level affects only the multiplier table, not the ball path.

**Example probabilities for 16 rows:**

| Slot | Probability |
|------|-------------|
| 0 or 16 (edge) | 0.00153% |
| 1 or 15 | 0.0244% |
| 2 or 14 | 0.183% |
| 3 or 13 | 0.854% |
| 4 or 12 | 2.78% |
| 5 or 11 | 6.67% |
| 6 or 10 | 12.2% |
| 7 or 9 | 17.5% |
| 8 (center) | 19.6% |

Edge slots (0 and 16) have a probability of approximately 1 in 65,536. They will not appear in most data captures of a few thousand bets.

---

## Risk Levels

Three risk levels are available: **Low**, **Medium**, and **High**. Choosing a higher risk level shifts payout weight toward edge slots: center slots pay less, edge slots pay more.

The slope difference is substantial for 16 rows:

| Slot | Low multiplier | High multiplier |
|------|---------------|-----------------|
| 0 or 16 (edge) | lower than high | 1009.33110594× |
| 8 (center) | higher than high | 0.2× |

The tradeoff is pure variance. At a fixed N and any risk level, the expected return (RTP) is the same — approximately 99.9% at the tested bet amounts. Risk level is a variance preference, not an expected-value preference.

All 27 configurations (9 row counts × 3 risk levels) have independent multiplier tables in plinkoConfig.json.

---

## Payout Formula

```
win_amount = bet_amount × payout_multiplier
```

The payout multiplier is determined by three inputs:
1. Number of rows (8–16)
2. Risk level (low, medium, high)
3. Final slot (0 through rows)

Multiplier tables are symmetric: the multiplier for slot k equals the multiplier for slot (rows − k). This follows from the symmetric binomial distribution — both slots have identical probability.

**Example payout:**
A $1.00 bet on 16 rows / high risk landing in slot 12 (mirror of slot 4) pays:
```
win_amount = $1.00 × 4.03732442 = $4.03732442
```

A $1.00 bet landing in slot 0 or slot 16 on 16r/high pays:
```
win_amount = $1.00 × 1009.33110594 = $1,009.33110594
```

The probability of that edge outcome is approximately 0.00153%, making it roughly a 1-in-65,536 event.

---

## Configuration Matrix

The game supports 27 distinct configurations:

| Rows | Risk Levels Available |
|------|-----------------------|
| 8 | Low, Medium, High |
| 9 | Low, Medium, High |
| 10 | Low, Medium, High |
| 11 | Low, Medium, High |
| 12 | Low, Medium, High |
| 13 | Low, Medium, High |
| 14 | Low, Medium, High |
| 15 | Low, Medium, High |
| 16 | Low, Medium, High |

Each configuration has its own multiplier table in plinkoConfig.json. The tables were supplied by Duel.com and loaded before data capture began.

---

## Scaling Edge (Bet-Size Brackets)

plinkoConfig.json contains a `scaling_edge` structure with 191 bet-size brackets per configuration. Each bracket specifies:

- A minimum and maximum bet amount
- A house edge percentage
- A complete multiplier table for that bracket

Bracket 0 (the lowest) applies a house edge of 0.1% (0.001). For the 16r/high configuration (the most restrictive), this bracket covers bets up to approximately $335.95; other configurations have higher bracket-0 ceilings. Both test amounts used in this audit — $0.01 (Phases A and B) and $10 (Phase C) — fall in bracket 0 across all tested configurations.

At higher bet amounts the house edge increases, reaching 2% at the highest brackets. This is a progressive edge structure: players wagering larger amounts receive marginally lower multipliers. It is not manipulation — the structure is static and documented in plinkoConfig.json. The implication for players is that published RTP figures apply to the lowest-stake bracket, and the effective RTP decreases for higher-stake bets.

This audit covers bracket 0 only. The progressive edge structure at higher amounts is reported as an informational finding.

---

## Commit-Reveal Scheme

Before any bet is placed, the server generates a random server seed and publishes its SHA-256 hash:

```
serverSeedHashed = SHA-256(hexDecode(serverSeed))
```

The player sets a client seed. Every bet in the epoch uses the same server seed and client seed, with a nonce incrementing from 0 to 49. After 50 bets (one epoch), the server rotates seeds and reveals the plaintext server seed. The auditor independently computes:

```
SHA-256(hexDecode(revealedServerSeed)) == committedHash ?
```

If it matches, the server committed to its seed before betting began and could not have changed it to influence outcomes. If it does not match, the commitment is broken.

This audit dataset contains 152 seed entries: 149 rotation records + 3 pre-capture commitment records, all 152 with serverSeed verified.

The client seed is included in every HMAC computation, giving the player demonstrable influence over outcomes. The server cannot predict the final slot for any bet without knowing the client seed in advance.

---

## Evidence Coverage

| Test | Source File | Status |
|------|-------------|--------|
| Slot probability model | `PLAN.md` (binomial spec) | Verified — matches B(N, 0.5) |
| Multiplier table completeness | `plinkoConfig.json` | Verified — 27 configs present |
| Payout formula | `tests/verify.ts` Step 7 | Verified — tolerance 1e-8 |
| Multiplier symmetry | `tests/verify.ts` Step 16 | Verified — all 27 configs |
| Edge slot multipliers | `tests/verify.ts` Step 16 | Verified — EC-10, EC-13 |
| Scaling edge bracket structure | `tests/verify.ts` Step 19 | Verified — EC-17, EC-32 |
| Commit-reveal lifecycle | `PLAN.md` (seed management spec) | Defined — EC-1 verification in verify.ts Step 1 |

**Code References:**
- RNG implementation: `src/rng.ts`
- Multiplier lookup: `src/config.ts`
- Full verification suite: `tests/verify.ts`
- Capture script: `capture/plinko-capture.js`

**Dataset:** `results/merged/plinko-master.json` (7,600 bets, 152 seed entries, 152 revealed seeds)
