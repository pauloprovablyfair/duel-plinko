import fs from 'fs';
import path from 'path';
import type { Dataset, Bet, SeedEntry } from './types';

const MERGED_DIR = path.join(__dirname, '..', 'results', 'merged');
const MASTER_FILE = path.join(MERGED_DIR, 'plinko-master.json');

export function loadDataset(): Dataset {
  const raw = fs.readFileSync(MASTER_FILE, 'utf8');
  return JSON.parse(raw) as Dataset;
}

export function loadMasterBuffer(): Buffer {
  return fs.readFileSync(MASTER_FILE);
}

/** Group bets by server_seed_hashed. */
export function groupByHash(bets: Bet[]): Map<string, Bet[]> {
  const map = new Map<string, Bet[]>();
  for (const bet of bets) {
    const h = bet.response.server_seed_hashed;
    if (!map.has(h)) map.set(h, []);
    map.get(h)!.push(bet);
  }
  return map;
}

/** Find seed entry by serverSeedHashed. Only returns entries with revealed serverSeed. */
export function findRevealedSeed(seeds: SeedEntry[], hash: string): SeedEntry | undefined {
  return seeds.find(s => s.seed.serverSeedHashed === hash && s.seed.serverSeed !== null);
}

/** Pre-capture commitment entries (no serverSeed). */
export function preCaptureSeeds(seeds: SeedEntry[]): SeedEntry[] {
  return seeds.filter(s => s.context.startsWith('pre-capture'));
}

/** Revealed seed entries only. */
export function revealedSeeds(seeds: SeedEntry[]): SeedEntry[] {
  return seeds.filter(s => s.seed.serverSeed !== null);
}
