// ── Dataset Types ─────────────────────────────────────────────────────────────

export interface BetRequest {
  rows: number;
  risk_level: 'low' | 'medium' | 'high';
  risk_int: number;
  amount: string;
  currency: number;
}

export interface BetResponse {
  id: number;
  rows: number;
  risk_level: 'low' | 'medium' | 'high';
  final_slot: number;
  payout_multiplier: string;
  amount_currency: string;
  win_amount: string;
  nonce: number;
  server_seed_hashed: string;
  client_seed: string;
  transaction_id: number;
  effective_edge: number;
  created_at: string;
}

export interface Bet {
  at: string;
  phase: 'A' | 'B' | 'C';
  request: BetRequest;
  response: BetResponse;
}

export interface SeedEntry {
  at: string;
  context: string;
  phase: 'A' | 'B' | 'C';
  seed: {
    clientSeed: string;
    serverSeedHashed: string;
    serverSeed: string | null;
  };
  nonce?: number;
  revealedFrom?: { transactionId: number };
}

export interface EvidenceEntry {
  at: string;
  label: string;
  bets: number;
  seeds: number;
  phase: string;
  phaseA: number;
  phaseB: number;
  phaseC: number;
  epochIdx: number;
  epochBets: number;
  seedHash: string | null;
  clientSeed: string | null;
  nonce: number;
}

export interface Dataset {
  audit: string;
  capturedAt: string;
  totals: { phaseA: number; phaseB: number; phaseC: number; seeds: number };
  bets: Bet[];
  seeds: SeedEntry[];
  evidence: EvidenceEntry[];
}

// ── Config Types ──────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high';

export interface ScalingEdgeBracket {
  id: number;
  config_id: number;
  min_bet: string;
  max_bet: string;
  house_edge: string;
  probabilities: number[];
  multipliers: string[];
}

export interface PlinkoConfigData {
  rows: number[];
  risk_levels: Record<RiskLevel, { id: number; name: string; description: string }>;
  payout_tables: Record<string, Record<RiskLevel, string[]>>;
  probabilities: Record<string, Record<RiskLevel, number[]>>;
  scaling_edge: Record<string, Record<RiskLevel, ScalingEdgeBracket[]>>;
}

export interface PlinkoConfigFile {
  success: boolean;
  data: PlinkoConfigData;
}

// ── Verification Result Types ─────────────────────────────────────────────────

export type Severity = 'HARD_FAIL' | 'FLAG' | 'INFO' | 'PASS';

export interface StepResult {
  step: number;
  name: string;
  ecRefs: string[];
  severity: Severity;
  pass: boolean;
  summary: string;
  failures: string[];
  details?: Record<string, unknown>;
}
