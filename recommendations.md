# Recommendations

**Audit:** Duel.com Plinko\
**Version:** 1.0\
**Date:** February 2026\
**Auditor:** [ProvablyFair.org](https://www.provablyfair.org)

---

All recommendations below are grounded in findings from this audit. Nothing is speculative.

---

## For Players

### 1. Verify your server seed hash before and after each epoch

Before placing any bet, record the `serverSeedHashed` value shown in the game interface. After the epoch ends and the server seed is revealed, confirm the hash matches. Run this check in your browser console:

```javascript
const check = async (seed, hash) => {
  const key = Array.from(new Uint8Array(
    await crypto.subtle.digest('SHA-256', new Uint8Array(seed.match(/../g).map(b=>parseInt(b,16))))
  )).map(b=>b.toString(16).padStart(2,'0')).join('');
  console.log(key === hash ? 'PASS' : 'FAIL: expected ' + hash + ', got ' + key);
};
```

Call it as `check(revealedServerSeed, committedHash)`. This audit confirmed 152/152 seeds pass this check.

### 2. Understand the 50-bet epoch boundary

Each server seed covers exactly 50 bets (nonces 0–49). The game rotates the seed automatically after bet 49. You can rotate the seed early at any time, but doing so reveals fewer bets under that commitment — reducing your ability to retroactively verify the full epoch. The `nonce` field in the API response tells you your current position within the epoch.

### 3. Know the progressive house edge threshold

`plinkoConfig.json` defines 191 bet-size brackets per configuration. The base house edge is 0.1%. The bracket-0 ceiling varies by configuration — approximately $335.95 for the 16r/high configuration (the most restrictive) and higher for lower-risk configurations. Above this ceiling, the house edge begins scaling upward, reaching 2.0% at the highest bracket. All test bets in this audit ($0.01 and $10) were in bracket 0 at 0.1%. Players staking above the bracket-0 ceiling for their chosen configuration face a higher effective house edge than the base RTP implies.

### 4. The 0.2× floor is real

For 16-row high-risk configurations, the center slots carry a 0.2× multiplier. This is not a rounding artifact. The minimum payout across any outcome is 20% of your bet amount — you cannot lose your full stake in a single bet.

---

## For the Operator (Duel.com)

### REC-1: Disclose the progressive house edge in the game UI [Priority: High]

`plinkoConfig.json` contains 191 bet-size brackets per configuration, with `house_edge` scaling from `0.001` to `0.02`. This scaling is not surfaced anywhere in the game interface based on our review. Players staking above the bracket-0 ceiling (which varies by configuration) face a higher house edge than the headline RTP figure suggests, and have no mechanism to discover this without API access.

**Required action:** Display the effective house edge or effective RTP for the player's current bet size, updated in real time as the bet amount changes.

### REC-2: Publish the payout configuration [Priority: High]

The multiplier tables and bracket thresholds in `plinkoConfig.json` are necessary for any player to independently compute theoretical RTP. Publishing this file, or an equivalent human-readable payout table per configuration, enables genuine independent verification and removes a transparency gap.

### REC-3: Display epoch progress in the UI [Priority: Medium]

The commit-reveal structure guarantees pre-commitment only when players can track their position within the epoch. Currently, the only way to determine epoch position (e.g., "this is bet 23 of 50") is to read the `nonce` field from the raw API response. Adding a visible epoch counter to the game UI — for example, "Bet 23 of 50 in current epoch" — would make the provably fair guarantee legible without technical knowledge.

### REC-4: No action required on the capture-retry nonce pattern [Priority: Informational]

Five epochs in the captured dataset show a nonce-50 value alongside a missing intermediate nonce. This is a client-side data capture artifact from request retries during recording — not a server-side anomaly. All 7,600 bets pass HMAC-SHA256 recomputation with zero mismatches, and all 152 epoch nonce sequences are intact in the server records. No code change is needed.

---

## Evidence Coverage

All findings referenced above are derived from:

- `outputs/verification-results.json` — EC-4 nonce sequence analysis, EC-1 seed hash checks, EC-7 per-bet recomputation, progressive house edge bracket data, wrong-seed delta test (EC-27)
- `outputs/simulation-results.json` — RTP figures across 27 configurations, chi-squared results, bracket-0 RTP baseline
