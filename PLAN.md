# Plinko — Audit Plan

## Overview

7,600 rounds across 3 phases, 152 seed entries (149 rotations + 3 pre-capture), 50 bets/seed.
Goal: full configuration coverage + deep high-variance sampling + code-path equivalence.

*Note: the dataset contains 152 seed entries total — 149 rotations + 3 pre-capture commitment records (one per phase start). All 3 pre-capture seeds were retrieved post-collection via the transactions API. EC-1 hash verification applies to all 152 entries.*

---

## Algorithm Specification

Duel.com Plinko uses HMAC-SHA256 with a commit-reveal scheme. The algorithm is independently verified — our implementation is coded from the cryptographic spec, not copied from the casino.

### RNG Per Bet

```
key    = hexDecode(serverSeed)        // 32 bytes
for cursor = 0 to (rows - 1):
    message = clientSeed + ":" + nonce + ":" + cursor
    hmac    = HMAC-SHA256(key, message)
    hex4    = hmac[0..7]              // first 8 hex chars = 4 bytes
    int     = parseInt(hex4, 16)
    if int % 2 == 1:
        slot++                        // odd uint32 = right (+1)
    // else: even uint32 = left (no change)
final_slot = slot                     // range: 0 to rows
```

### Commit-Reveal

1. Server generates `serverSeed` (random hex string) and publishes `SHA-256(hexDecode(serverSeed))` as `serverSeedHashed`
2. Player sets `clientSeed` (random string)
3. Bets are placed using `(serverSeed, clientSeed, nonce)` — nonce increments per bet
4. After epoch (50 bets), seed rotates: server reveals plaintext `serverSeed`
5. Auditor verifies: `SHA-256(hexDecode(revealedSeed)) == committedHash`

### Payout

```
multiplier = plinkoConfig.payout_tables[rows][risk][final_slot]
win_amount = bet_amount × multiplier
```

Multiplier tables are symmetric: `payout_tables[rows][risk][k] == payout_tables[rows][risk][rows-k]` for all k.

Theoretical RTP = `sum(P(slot) × multiplier(slot))` for each config, using `plinkoConfig.probabilities` for slot probabilities. All 27 configs yield RTP ≈ 99.9% (house edge 0.1%) at our bet amounts ($0.01 and $10), which fall in the lowest `scaling_edge` bracket (house_edge=0.001, bets ≤ ~$336). Note: `scaling_edge` contains 191 bet-size brackets per config with house_edge ranging from 0.001 to 0.02 — higher-stake bets receive lower multipliers. This does not affect our audit (all test bets are in the 0.001 bracket) but is reported as a finding. Source: `plinkoConfig.json` supplied by Duel.com.

---

## Phase Table

| Phase | Label | Rounds | Bet | Rows | Risk | Seeds | Purpose |
|-------|-------|--------|-----|------|------|-------|---------|
| A | collection | 5,400 | $0.01 | random 8–16 | random low/med/high | 108 | All 27 configs (4 epochs each), RTP baseline |
| B | high-variance | 2,000 | $0.01 | 16 | high | 40 | Deep 16r/high coverage |
| C | equivalence | 200 | $10 | 16 | high | 4 | Code-path: amount-agnostic RNG |

**Total:** 7,600 bets · 152 seed entries (149 rotations + 3 pre-capture) · ~$2,074 wagered

---

## Configuration Coverage (Phase A)

108 seed epochs, 27 configs. Each config gets exactly **4 epochs = 200 bets**. Zero imbalance.

| Rows | Low | Medium | High |
|------|-----|--------|------|
| 8    | 4 ep (200) | 4 ep (200) | 4 ep (200) |
| 9    | 4 ep (200) | 4 ep (200) | 4 ep (200) |
| 10   | 4 ep (200) | 4 ep (200) | 4 ep (200) |
| 11   | 4 ep (200) | 4 ep (200) | 4 ep (200) |
| 12   | 4 ep (200) | 4 ep (200) | 4 ep (200) |
| 13   | 4 ep (200) | 4 ep (200) | 4 ep (200) |
| 14   | 4 ep (200) | 4 ep (200) | 4 ep (200) |
| 15   | 4 ep (200) | 4 ep (200) | 4 ep (200) |
| 16   | 4 ep (200) | 4 ep (200) | 4 ep (200) |

*Queue built as 4 shuffled passes of all 27 configs, then fully shuffled. Recorded in export for audit.*

---

## Slot Distribution Expectations (Phase B — 16r/high, 2,000 bets)

| Slot | Probability | Expected hits |
|------|------------|---------------|
| 0, 16 | 0.00153% | ~0 |
| 1, 15 | 0.0244% | ~0.5 |
| 2, 14 | 0.183% | ~3.7 |
| 3, 13 | 0.854% | ~17 |
| 4, 12 | 2.78% | ~56 |
| 5, 11 | 6.67% | ~133 |
| 6, 10 | 12.2% | ~244 |
| 7, 9 | 17.5% | ~350 |
| 8 (center) | 19.6% | ~393 |

Slots 2–14 will be observed; 0/1/15/16 may not appear — this is expected, not a flag.

---

## Sample Methodology

### Design Rationale

The sample is split into 3 phases to answer distinct audit questions:

| Phase | Question Answered | Why This Size |
|-------|-------------------|---------------|
| A (5,400) | Does every configuration behave correctly? | 200 bets per config × 27 configs = enough for slot recomputation + per-config RTP with meaningful CI |
| B (2,000) | Does the highest-variance config follow binomial distribution? | 2,000 bets on 16r/high gives expected hits on slots 2–14 (see Slot Distribution table), enough for chi-squared symmetry test |
| C (200) | Does bet amount affect RNG output? | Same config as Phase B at 1000× the stake. If server uses amount in RNG or applies post-processing multiplier adjustments, slot/multiplier distributions will diverge from Phase B |

### Randomization

Phase A assigns configs to 50-bet seed epochs using a **balanced shuffle queue**:

1. All 27 configs are listed (9 row counts × 3 risk levels)
2. This list is shuffled and added to the queue — repeat 4 times (4 × 27 = 108 entries)
3. The entire 108-entry queue is shuffled again to break pass clustering
4. Each entry maps to one seed epoch (50 bets)
5. Result: every config gets exactly 4 epochs = 200 bets. Zero imbalance.

The queue is persisted in state and exported in the dataset JSON for audit reproducibility. The shuffling uses `Math.random()` (Fisher-Yates) — the order is not security-critical since it only determines *which* config runs when, not the RNG output.

Phases B and C use fixed config (16r/high), no randomization needed.

### Collection Controls

The capture script enforces these data integrity checks during collection:

| Control | Mechanism | Failure Mode |
|---------|-----------|--------------|
| **Nonce sync** | On resume, fetches server's active seed nonce and compares to local `epochBets`. Server value wins on mismatch. | Prevents nonce drift after crash/disconnect |
| **Config echo validation** | After each bet, verifies response `rows`/`risk_level` match the request | Detects server-side config overrides |
| **$0 bet guard** | If effective bet amount is 0, auto-pauses and warns | Prevents silent nonce desync (CLAUDE.md gotcha: "$0 bets may not increment server-side nonce") |
| **Duplicate bet detection** | Checks last 100 bet IDs before recording | Prevents double-counting on network retries |
| **Null reveal tracking** | Counts consecutive null seed reveals; warns at 3+ | Detects API response structure changes early |

### Seed Management

Each seed epoch is exactly 50 bets (nonce 0–49). Seed lifecycle:

1. **Commitment capture** — before first bet of each phase, the script fetches and records `serverSeedHashed` + `clientSeed`
2. **Betting** — 50 bets placed under one seed pair. Each response includes nonce for cross-check.
3. **Rotation** — at epoch boundary, script calls `POST /api/v2/client-seed/rotate`:
   - Pre-rotation: saves seed hash to `rotationPending` checkpoint
   - Rotation: API call rotates seed, returns transaction ID
   - Reveal: fetches `GET /api/v2/user/transactions/{txId}` to get plaintext `serverSeed`
   - Post-rotation: clears checkpoint, stores complete seed entry
4. **Final rotation** — at phase end, one extra rotation reveals the last epoch's seed

If the page crashes mid-rotation, the checkpoint is recovered on next resume. The seed hash is preserved; the plaintext may need manual reveal later.

### Resilience

| Scenario | Recovery |
|----------|----------|
| Tab closed mid-bet | State persisted after every bet in `localStorage`. Re-paste script, `plinko.go()` resumes. |
| Page crash mid-rotation | `rotationPending` checkpoint recovered on resume. Seed hash preserved. |
| localStorage corrupted | Auto-recovers from `pv3_backup` key (snapshot every 100 bets) |
| Script re-pasted while running | Instance guard kills old loop. New instance takes over. |
| Consecutive API errors (8) | Auto-pause. Token refresh on 401. Exponential backoff on 429/500/502. |
| localStorage quota (~5MB) | Warns at 4MB usage. Auto-pauses on write failure with "run plinko.save() immediately" alert. |

### Evidence Chain

Automatic PNG evidence screenshots fire at:
- Phase start (pre-capture seed commitment visible)
- Phase end (final bet count, last seed hash)

Each screenshot is a Canvas-rendered card showing: phase progress, seed hash, client seed, nonce, last bet details. Screenshot metadata (timestamp, label, bet count, seed hash) is stored in state and exported in the dataset JSON.

Manual screenshots available via `plinko.snap('label')` at any time.

---

## Edge Case Checklist

### RNG & Commit-Reveal

- [ ] **EC-1: Seed hash integrity** — SHA-256(hexDecode(serverSeed)) = serverSeedHashed for all 152 seed entries
- [ ] **EC-2: Nonce 0** — first bet in every seed epoch uses nonce=0
- [ ] **EC-3: Nonce 49** — last bet before rotation uses nonce=49; rotation immediately follows
- [ ] **EC-4: Nonce monotonic** — nonces increment +1 per bet, no gaps, no repeats within an epoch
- [ ] **EC-5: Client seed stable** — all 50 bets in an epoch share the same client_seed; rotation changes it
- [ ] **EC-6: drand not in RNG** — drand_round and drand_randomness fields are absent from all Plinko API responses (Plinko uses HMAC-SHA256 only); verify by recomputing slot without referencing drand fields
- [ ] **EC-26: Hash stable within epoch** — `server_seed_hashed` in every bet response must be identical across all 50 bets in each epoch. Any mid-epoch change = commit-reveal violation (hard fail)
- [ ] **EC-27: Client seed actually used** — for at least one seed epoch, recompute all slots with a deliberately wrong client seed. All results must differ. If any match, client seed is not in the HMAC (hard fail)

### Slot Verification (all phases)

- [ ] **EC-7: Slot recomputation** — for every verifiable bet, independently compute the slot using HMAC-SHA256 per row (key=hexDecode(serverSeed), message=`clientSeed:nonce:cursor` for cursor 0..rows-1). Result must match `final_slot`.
- *(EC-8 is not defined — the numbering gap is intentional; EC-8 was reserved in the framework template for a server-side code review step that is not applicable to a black-box audit)*
- [ ] **EC-9: Slot symmetry** — for any config, bets hitting slot k and slot (rows−k) should appear (empirically) with equal frequency over large N
- [ ] **EC-10: Edge slot multiplier** — verify slot 0 and slot N multipliers match published table (even if no live hit occurs, check via plinkoConfig.json)

### Payout & Multiplier

- [ ] **EC-11: Payout math** — win_amount = amount_currency × payout_multiplier ± 1e-10 for every bet
- [ ] **EC-12: Multiplier in table** — payout_multiplier matches the server's active multiplier table for the bet's amount bracket (determined by EC-32). Try both `payout_tables[rows][risk][slot]` and `scaling_edge[rows][risk][0].multipliers[slot]`; float diff ≤ 1e-5 is rounding only (max observed diff between the two tables is 1.49e-6 at 15r/high)
- [ ] **EC-13: 0.2× floor** — on 16r/high, center slot multiplier is 0.2× (not 0); verify no zero-payout bets exist
- [ ] **EC-14: Symmetric multipliers** — both `payout_tables` and `scaling_edge[0].multipliers` satisfy `table[k] == table[rows−k]` for all k, across all 27 configs
- [ ] **EC-28: Multiplier table provenance** — plinkoConfig.json supplied by Duel.com, loaded via `plinko.loadConfig()` before capture begins. Verify config load timestamp predates first bet. Cross-check at least 3 configs against live game display. Compute theoretical RTP from the payout_tables/probabilities to confirm advertised house edge (0.1%).
- [ ] **EC-32: Multiplier table source** — plinkoConfig.json contains two multiplier sources: `payout_tables` and `scaling_edge[rows][risk][0].multipliers`. They differ by < 1e-6 (rounding). Determine which one the server actually uses for payouts by matching live `payout_multiplier` values against both tables. Record which table matches and use that as the reference for EC-12.

### Code-Path Equivalence (Phase C vs Phase B)

- [ ] **EC-15: Amount-agnostic slot** — recompute slot for Phase C bets using HMAC; result must match final_slot regardless of $10 stake
- [ ] **EC-16: Multiplier table identical** — for every slot observed in Phase C, the payout_multiplier must match the plinkoConfig table (same lookup as Phase B). Both phases use the same multiplier source — no amount-dependent table switching.
- [ ] **EC-17: No bet-size post-processing at test amounts** — payout_multiplier is NOT adjusted based on amount_currency at our test amounts ($0.01 and $10). Verify by checking that all Phase C multipliers appear in the same table as Phase B. Note: `scaling_edge` reveals the server *does* use bet-size-dependent multiplier tables at higher amounts (≥ ~$336), with house_edge scaling from 0.1% to 2%. This is a progressive edge structure, not manipulation — but it means EC-16/EC-17 only hold within the same scaling bracket.
- [ ] **EC-18: Payout scales linearly** — Phase C win_amount = $10 × multiplier; verify the math

### RTP & Statistical

- [ ] **EC-19: Phase A RTP** — sum(win_amount) / sum(amount_currency) should be within 3σ of 99.9% for N=5,400
- [ ] **EC-20: Phase B RTP** — same check for N=2,000 on 16r/high
- [ ] **EC-21: Phase C RTP** — same check for N=200 on $10 bets. At N=200, σ ≈ 40–60% of mean for 16r/high — this can only detect gross manipulation (RTP below ~80%). Fine-grained RTP testing relies on Phase B's larger N.
- [ ] **EC-22: Per-config RTP** — for each of the 27 configs (Phase A), empirical RTP within 5σ of 99.9%
- [ ] **EC-23: Zero Edge bets** — bets with effective_edge=0 should still apply the standard multiplier table (no separate payout table for Zero Edge users)
- [ ] **EC-29: Serial independence** — on Phases B and C (single-config datasets, 16r/high), compute lag-1 autocorrelation of `payout_multiplier` sequence. Expected: r ≈ 0. Flag if |r| > 3/√N (≈ 0.067 at N=2000 for Phase B; ≈ 0.212 at N=200 for Phase C). Also run a Wald-Wolfowitz runs test on win/loss (multiplier ≥ 1 vs < 1) — number of runs should be within 2σ of expected. Phase A excluded: spans 27 configs in sequence, creating artificial run structure unrelated to RNG serial dependence.

### Dataset Integrity

- [ ] **EC-24: Phase labels** — every bet is labeled 'A', 'B', or 'C'; seed rotation events are labeled to match
- [ ] **EC-25: SHA-256 dataset hash** — record and publish SHA-256 of final dataset JSON
- [ ] **EC-30: Phase A config completeness** — verify all 27 configs received at least 100 bets (minimum viable sample for chi-squared with expected counts ≥ 5). Target was 200 bets per config (4 epochs × 50); a localStorage quota event at ~bet 4,934 caused 10 configs to fall short, minimum 116 bets (11r/high). All configs exceed the 100-bet floor. See findings.md §9 "Plan deviation — Phase A config distribution".
- [ ] **EC-31: Epoch size** — every seed epoch must contain exactly 50 bets (nonce 0–49). Group bets by their seed hash, count per group. Any group ≠ 50 indicates a crash/resume boundary error.

---

## Verdict Criteria

### Hard Fails (any one = NOT PROVABLY FAIR)

| EC | Test | Why it's fatal |
|----|------|----------------|
| EC-1 | Seed hash mismatch | Commit-reveal is broken — server could choose outcomes after the fact |
| EC-4 | Nonce gap or repeat | Server could replay or skip outcomes — determinism broken |
| EC-5 | Client seed changed mid-epoch | Commit-reveal scope violated — outcomes not bound to agreed seed pair |
| EC-7 | Slot recomputation mismatch | RNG is not deterministic or uses hidden inputs |
| EC-26 | Hash changed mid-epoch | Server swapped seeds between bets — commit-reveal violation |
| EC-27 | Client seed not used | Player has zero influence on RNG — "provably fair" claim is false |

### Flags (investigate, may or may not fail)

| EC | Test | Threshold |
|----|------|-----------|
| EC-9 | Slot symmetry | Chi-squared p < 0.01 for any config |
| EC-11 | Payout math | Any difference > 1e-8 (float precision excluded) |
| EC-12 | Multiplier in table | Any difference > 1e-5 |
| EC-19–22 | RTP deviation | Outside 3σ of 99.9% for the given N |
| EC-29 | Serial independence | \|r\| > 0.067 or runs test p < 0.01 |

### Informational (note in report, not a fail)

| EC | Test | Note |
|----|------|------|
| EC-6 | drand not in RNG | Expected for Plinko — drand is used in other games |
| EC-21 | Phase C RTP | Wide CI at N=200, can only detect gross manipulation |
| EC-13 | 0.2× floor | If no center-slot hits occur, verify from table only |

**Verdict rule:** If zero hard fails and zero unresolved flags → **PROVABLY FAIR**. If any hard fail → **NOT PROVABLY FAIR**. If flags exist but have innocent explanations (float rounding, small-N variance) → **PROVABLY FAIR** with notes.

---

## Verification Plan

**Step 1 — Hash check:** Verify all 152 seed hashes: SHA-256(hexDecode(serverSeed)) = serverSeedHashed (EC-1)

**Step 2 — Commitment linkage:** For each of the 3 pre-capture commitment records, verify that `serverSeedHashed` matches `server_seed_hashed` in the first bet response of that phase. Confirms the commitment was captured for the correct active seed.

**Step 3 — Hash consistency:** For each epoch, verify `server_seed_hashed` is identical across all 50 bet responses (EC-26)

**Step 4 — Nonce audit:** For each of the 152 epochs, extract bets, confirm nonce 0–49 in sequence (EC-2, EC-3, EC-4, EC-5)

**Step 5 — Slot recompute:** HMAC-SHA256 recompute for all 7,600 bets using only (serverSeed, clientSeed, nonce) — drand fields are ignored. If all slots match, drand is confirmed not in the RNG. (EC-6, EC-7)

**Step 6 — Client seed influence:** Pick one epoch, recompute all 50 slots with a wrong client seed. All must change. (EC-27)

**Step 7 — Payout check:** Multiply betAmount × payout_multiplier, compare to win_amount (EC-11, EC-18)

**Step 8 — Multiplier table provenance:** Verify plinkoConfig.json load timestamp predates first bet. Cross-check 3+ configs against live game display. Compute theoretical RTP from payout_tables × probabilities for all 27 configs. Determine which multiplier source the server uses by comparing live payouts against both `payout_tables` and `scaling_edge[0].multipliers` — record the match. (EC-28, EC-32)

**Step 9 — Equivalence check:** Verify all Phase C payout_multipliers appear in the same plinkoConfig table as Phase B. Run two-sample KS test comparing Phase B and Phase C slot distributions (both 16r/high). Confirm no amount-dependent adjustments. (EC-15, EC-16, EC-17)

**Step 10 — RTP analysis:** Per-phase and per-config RTP with 99.9% target, CI bounds (EC-19, EC-20, EC-21, EC-22)

**Step 11 — Serial independence:** Lag-1 autocorrelation + Wald-Wolfowitz runs test on Phase B and Phase C multiplier sequences (EC-29). Phase A excluded — multi-config ordering creates artificial run patterns unrelated to RNG.

**Step 12 — Symmetry check:** For each config, histogram slot counts; run chi-squared test for uniform binomial fit (EC-9)

**Step 13 — Zero Edge audit:** Separate bets by effective_edge value; verify multiplier table is identical (EC-23)

**Step 14 — Config completeness:** Verify all 27 Phase A configs received at least 100 bets (EC-30). Target was 200; plan deviation documented in findings.md §9.

**Step 15 — Epoch size:** Group all bets by `server_seed_hashed`, verify each group has exactly 50 bets (EC-31)

**Step 16 — Multiplier table + symmetry:** For each of the 27 configs: (a) verify every observed payout_multiplier matches the reference table within 1e-5 (EC-12), (b) verify slot 0 and slot N multipliers match the table even if no live hits (EC-10), (c) verify 0.2× floor on 16r/high center slot — no zero-payout entries (EC-13), (d) verify `table[k] == table[rows-k]` for all k (EC-14)

**Step 17 — Phase labels:** Verify every bet has phase label 'A', 'B', or 'C'. Verify every seed entry has a phase label matching the bets it covers. (EC-24)

**Step 18 — Dataset hash:** Compute SHA-256 of the final exported JSON file and record in the report. (EC-25)

**Step 19 — Scaling edge analysis:** For each of the 27 configs, verify `scaling_edge` bracket 0 has house_edge=0.001 and both test amounts ($0.01, $10) fall in this bracket. Document the progressive edge structure (up to 2% at high stakes) as an informational finding. Verify symmetry holds across all scaling brackets. (EC-17, EC-32)

---

## Capture Instructions

1. Navigate to `duel.com/plinko` and open DevTools console
2. Paste contents of `capture/plinko-capture.js` into the console
3. A floating panel appears (bottom-right, draggable)
4. Load the multiplier config (required before first bet):
   ```js
   plinko.loadConfig(JSON.parse('<paste plinkoConfig.json contents>'))
   ```
   Or fetch it programmatically if you have the file locally:
   ```js
   fetch('/path/to/plinkoConfig.json').then(r=>r.json()).then(d=>plinko.loadConfig(d))
   ```

**Console commands:**
```
plinko.go()         → smart resume (finds first incomplete phase)
plinko.a()          → start/resume Phase A (5.4K random @ $0.01)
plinko.b()          → start/resume Phase B (2K 16r/high @ $0.01)
plinko.c()          → start/resume Phase C (200 16r/high @ $10)
plinko.pause()      → stop after current bet
plinko.save()       → download JSON (clears token from localStorage)
plinko.snap(lbl)    → manual evidence PNG screenshot
plinko.status()     → print progress, config distribution, seed health
plinko.sync()       → check server nonce vs local state
plinko.loadConfig() → load plinkoConfig.json (multiplier tables)
plinko.clear()      → wipe all data + localStorage
plinko.state()      → raw state object for debugging
```

5. Run `plinko.go()` — phases auto-advance A → B → C (3s pause between phases)
6. After Phase C: `plinko.save()` → move JSON to `data/`
7. Seed commitments and evidence screenshots are captured automatically

**Pause/resume:** State persists in localStorage. Safe to close tab, refresh, re-paste script. On resume, script syncs nonce with server and recovers any interrupted rotations.

---

## Budget

| Phase | Bets | Stake/bet | Total staked | Expected loss (0.1% edge) |
|-------|------|-----------|--------------|--------------------------|
| A | 5,400 | $0.01 | $54 | ~$0.05 |
| B | 2,000 | $0.01 | $20 | ~$0.02 |
| C | 200 | $10 | $2,000 | ~$2.00 |

**Total staked: ~$2,074 · Expected loss: ~$2.07**

RTP is ~99.9% across all phases. You break even in practice. The variance on 16r/high means temporary swings of ±$100–300 during Phase C, but the math pulls it back. Balance of $1,000 is enough — worst realistic drawdown ~$300.
