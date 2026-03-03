/**
 * Monte Carlo simulation for Plinko v3 RTP and chi-squared verification.
 * Runs 1,000,000 rounds per config using the verified sync HMAC path.
 * Writes outputs/simulation-results.json
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PlinkoConfig } from './config';
import { chiSquaredTest } from './stats';

const CONFIG_FILE = path.join(__dirname, '..', 'plinkoConfig.json');
const OUTPUTS_DIR = path.join(__dirname, '..', 'outputs');
fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

const rawCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const cfg = new PlinkoConfig(rawCfg.data);

const ROUNDS_PER_CONFIG = 1_000_000;
type RiskLevel = 'low' | 'medium' | 'high';

function computeSlotSync(key: Buffer, clientSeed: string, nonce: number, rows: number): number {
  let slot = 0;
  for (let cursor = 0; cursor < rows; cursor++) {
    const msg = `${clientSeed}:${nonce}:${cursor}`;
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(msg);
    const hash = hmac.digest();
    slot += hash.readUInt32BE(0) % 2;
  }
  return slot;
}

const configs = cfg.allConfigs();
const results: Array<{
  rows: number;
  risk: RiskLevel;
  rounds: number;
  theoreticalRTP: number;
  simulatedRTP: number;
  rtpDiff: number;
  slotCounts: number[];
  expectedCounts: number[];
  chi2: number;
  df: number;
  pValue: number;
}> = [];

console.log(`\nSimulating ${ROUNDS_PER_CONFIG.toLocaleString()} rounds × ${configs.length} configs…\n`);
const startMs = Date.now();

for (const { rows, risk } of configs) {
  process.stdout.write(`  ${rows}r/${risk}… `);
  const t0 = Date.now();

  const slotCount = rows + 1;
  const slotCounts = new Array(slotCount).fill(0);
  let totalPayout = 0;

  // Use fresh random server/client seeds per config
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const clientSeed = crypto.randomBytes(8).toString('hex');
  const key = Buffer.from(serverSeed, 'hex');

  for (let nonce = 0; nonce < ROUNDS_PER_CONFIG; nonce++) {
    const slot = computeSlotSync(key, clientSeed, nonce, rows);
    slotCounts[slot]++;
    totalPayout += cfg.scalingEdgeMultiplier(rows, risk, slot);
  }

  const simulatedRTP = totalPayout / ROUNDS_PER_CONFIG;
  const theoreticalRTP = cfg.theoreticalRTP(rows, risk);

  // Independent binomial expected counts — not from casino config
  const expectedCounts: number[] = [];
  for (let k = 0; k < slotCount; k++) {
    let coeff = 1;
    for (let i = 0; i < Math.min(k, rows - k); i++) {
      coeff = coeff * (rows - i) / (i + 1);
    }
    expectedCounts.push(coeff * Math.pow(0.5, rows) * ROUNDS_PER_CONFIG);
  }
  // chiSquaredTest handles pooling of bins with expected < 5 internally
  const { chi2, df, pValue } = chiSquaredTest([...slotCounts], expectedCounts);

  results.push({ rows, risk, rounds: ROUNDS_PER_CONFIG, theoreticalRTP, simulatedRTP, rtpDiff: simulatedRTP - theoreticalRTP, slotCounts, expectedCounts, chi2, df, pValue });

  process.stdout.write(`RTP=${(simulatedRTP*100).toFixed(3)}% χ²=${chi2.toFixed(1)} p=${pValue.toFixed(3)} (${Date.now()-t0}ms)\n`);
}

function normalCDF(z: number): number {
  if (z < -8) return 0; if (z > 8) return 1;
  const t = 1/(1+0.2316419*Math.abs(z));
  const poly = t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  const phi = (1/Math.sqrt(2*Math.PI))*Math.exp(-0.5*z*z);
  const p = 1-phi*poly;
  return z >= 0 ? p : 1-p;
}

const elapsedMs = Date.now() - startMs;
const totalRounds = ROUNDS_PER_CONFIG * configs.length;

const allRTPs = results.map(r => r.simulatedRTP);
const avgSimRTP = allRTPs.reduce((a, b) => a+b, 0) / allRTPs.length;
const chi2Fails = results.filter(r => r.pValue < 0.01).length;

const summary = {
  generatedAt: new Date().toISOString(),
  roundsPerConfig: ROUNDS_PER_CONFIG,
  totalRounds,
  configs: configs.length,
  executionTimeMs: elapsedMs,
  avgTheoreticalRTP: cfg.allConfigs().reduce((a, {rows, risk}) => a + cfg.theoreticalRTP(rows, risk as RiskLevel), 0) / configs.length,
  avgSimulatedRTP: avgSimRTP,
  chi2FailsAtAlpha01: chi2Fails,
  results,
};

fs.writeFileSync(path.join(OUTPUTS_DIR, 'simulation-results.json'), JSON.stringify(summary, null, 2));

console.log(`\n  Total rounds: ${totalRounds.toLocaleString()}`);
console.log(`  Avg simulated RTP: ${(avgSimRTP*100).toFixed(4)}%`);
console.log(`  Chi-squared fails (p<0.01): ${chi2Fails}/${configs.length}`);
console.log(`  Time: ${(elapsedMs/1000).toFixed(1)}s`);
console.log(`  Written: outputs/simulation-results.json\n`);
