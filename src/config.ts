import type { PlinkoConfigData, RiskLevel, ScalingEdgeBracket } from './types';

export class PlinkoConfig {
  private cfg: PlinkoConfigData;

  constructor(data: PlinkoConfigData) {
    this.cfg = data;
  }

  /** Multiplier from payout_tables for (rows, risk, slot). Returns as number. */
  payoutTableMultiplier(rows: number, risk: RiskLevel, slot: number): number {
    return parseFloat(this.cfg.payout_tables[String(rows)][risk][slot]);
  }

  /** Multiplier from scaling_edge bracket 0 for (rows, risk, slot). Returns as number. */
  scalingEdgeMultiplier(rows: number, risk: RiskLevel, slot: number): number {
    return parseFloat(this.cfg.scaling_edge[String(rows)][risk][0].multipliers[slot]);
  }

  /** Slot probabilities for (rows, risk). */
  probabilities(rows: number, risk: RiskLevel): number[] {
    return this.cfg.probabilities[String(rows)][risk];
  }

  /** Scaling edge bracket 0 for (rows, risk). */
  bracket0(rows: number, risk: RiskLevel): ScalingEdgeBracket {
    return this.cfg.scaling_edge[String(rows)][risk][0];
  }

  /** All (rows, risk) config pairs. */
  allConfigs(): Array<{ rows: number; risk: RiskLevel }> {
    const risks: RiskLevel[] = ['low', 'medium', 'high'];
    const rowMin = (this.cfg.rows as unknown as { min: number; max: number }).min;
    const rowMax = (this.cfg.rows as unknown as { min: number; max: number }).max;
    const rowList: number[] = [];
    for (let r = rowMin; r <= rowMax; r++) rowList.push(r);
    return rowList.flatMap(r => risks.map(risk => ({ rows: r, risk })));
  }

  /** Number of slots for rows. */
  slotCount(rows: number): number {
    return rows + 1;
  }

  /** Theoretical RTP from payout_tables × probabilities. */
  theoreticalRTP(rows: number, risk: RiskLevel): number {
    const probs = this.probabilities(rows, risk);
    let rtp = 0;
    for (let slot = 0; slot < probs.length; slot++) {
      rtp += probs[slot] * this.payoutTableMultiplier(rows, risk, slot);
    }
    return rtp;
  }
}
