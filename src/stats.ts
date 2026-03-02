/**
 * Statistical test utilities for the Plinko v3 audit.
 */

/** Binomial coefficient C(n, k). */
function binomCoeff(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < Math.min(k, n - k); i++) {
    result = result * (n - i) / (i + 1);
  }
  return result;
}

/** Binomial probability P(slot=k | rows, p=0.5). */
export function binomProb(rows: number, k: number): number {
  return binomCoeff(rows, k) * Math.pow(0.5, rows);
}

/**
 * Chi-squared statistic and p-value approximation for observed vs expected slot counts.
 * Uses Wilson-Hilferty normal approximation for p-value.
 * Returns chi2 stat, degrees of freedom, and approximate p-value.
 */
export function chiSquaredTest(
  observed: number[],
  expected: number[]
): { chi2: number; df: number; pValue: number } {
  // Pool bins with expected < 5 (standard chi-squared validity requirement)
  const obsPooled: number[] = [];
  const expPooled: number[] = [];
  let poolObs = 0, poolExp = 0;
  for (let i = 0; i < observed.length; i++) {
    if (expected[i] >= 5) {
      if (poolExp > 0) {
        obsPooled.push(poolObs); expPooled.push(poolExp);
        poolObs = 0; poolExp = 0;
      }
      obsPooled.push(observed[i]); expPooled.push(expected[i]);
    } else {
      poolObs += observed[i]; poolExp += expected[i];
    }
  }
  if (poolExp > 0) { obsPooled.push(poolObs); expPooled.push(poolExp); }

  let chi2 = 0;
  let df = 0;
  for (let i = 0; i < obsPooled.length; i++) {
    if (expPooled[i] > 0) {
      chi2 += Math.pow(obsPooled[i] - expPooled[i], 2) / expPooled[i];
      df++;
    }
  }
  df -= 1; // subtract 1 for constraint sum(O) = sum(E)
  const pValue = chiSquaredPValue(chi2, df);
  return { chi2, df, pValue };
}

/** Chi-squared p-value using Wilson-Hilferty approximation (upper tail). */
function chiSquaredPValue(x: number, k: number): number {
  if (k <= 0) return 1;
  // Wilson-Hilferty: chi2(k) approx N(k, 2k) under H0
  // More accurate: use regularized incomplete gamma approximation
  // We use the Wilson-Hilferty cube root transformation:
  // z = ((x/k)^(1/3) - (1 - 2/(9k))) / sqrt(2/(9k))
  const cbrt = Math.pow(x / k, 1 / 3);
  const mu = 1 - 2 / (9 * k);
  const sigma = Math.sqrt(2 / (9 * k));
  const z = (cbrt - mu) / sigma;
  return 1 - normalCDF(z);
}

/** Standard normal CDF using rational approximation (Abramowitz & Stegun 26.2.17). */
function normalCDF(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t * (0.319381530 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 +
            t * 1.330274429))));
  const phi = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
  const p = 1 - phi * poly;
  return z >= 0 ? p : 1 - p;
}

/**
 * Lag-1 autocorrelation of a sequence.
 * r = Σ(x_i - μ)(x_{i+1} - μ) / ((N-1) * σ²)
 */
export function lag1Autocorrelation(values: number[]): number {
  const N = values.length;
  if (N < 3) return 0;
  const mu = values.reduce((a, b) => a + b, 0) / N;
  const variance = values.reduce((acc, x) => acc + Math.pow(x - mu, 2), 0) / N;
  if (variance === 0) return 0;
  let cov = 0;
  for (let i = 0; i < N - 1; i++) {
    cov += (values[i] - mu) * (values[i + 1] - mu);
  }
  return cov / ((N - 1) * variance);
}

/**
 * Wald-Wolfowitz runs test.
 * sequence: boolean[] (true = win/above threshold, false = loss)
 * Returns: { runs, n1, n2, expectedRuns, stdDev, z, pValue }
 */
export function runsTest(sequence: boolean[]): {
  runs: number;
  n1: number;
  n2: number;
  expectedRuns: number;
  stdDev: number;
  z: number;
  pValue: number;
} {
  const N = sequence.length;
  const n1 = sequence.filter(x => x).length;  // wins
  const n2 = N - n1;                           // losses

  let runs = 1;
  for (let i = 1; i < N; i++) {
    if (sequence[i] !== sequence[i - 1]) runs++;
  }

  if (n1 === 0 || n2 === 0) {
    return { runs, n1, n2, expectedRuns: 1, stdDev: 0, z: 0, pValue: 1 };
  }

  const expectedRuns = 1 + (2 * n1 * n2) / N;
  const varianceRuns = (2 * n1 * n2 * (2 * n1 * n2 - N)) / (N * N * (N - 1));
  const stdDev = Math.sqrt(Math.max(varianceRuns, 0));
  const z = stdDev > 0 ? (runs - expectedRuns) / stdDev : 0;
  const pValue = 2 * (1 - normalCDF(Math.abs(z))); // two-tailed

  return { runs, n1, n2, expectedRuns, stdDev, z, pValue };
}

/**
 * Two-sample Kolmogorov-Smirnov statistic.
 * Returns D statistic (max |F1(x) - F2(x)|).
 */
export function ksStat(sample1: number[], sample2: number[]): number {
  const all = [...new Set([...sample1, ...sample2])].sort((a, b) => a - b);
  const n1 = sample1.length;
  const n2 = sample2.length;
  const counts1 = new Map<number, number>();
  const counts2 = new Map<number, number>();
  for (const v of sample1) counts1.set(v, (counts1.get(v) ?? 0) + 1);
  for (const v of sample2) counts2.set(v, (counts2.get(v) ?? 0) + 1);

  let d = 0;
  let cum1 = 0;
  let cum2 = 0;
  for (const x of all) {
    cum1 += (counts1.get(x) ?? 0) / n1;
    cum2 += (counts2.get(x) ?? 0) / n2;
    d = Math.max(d, Math.abs(cum1 - cum2));
  }
  return d;
}

/**
 * Empirical RTP with 95% confidence interval.
 * Returns { rtp, lower, upper, n, totalWagered, totalWon }
 */
export function rtpCI(amounts: number[], wins: number[]): {
  rtp: number;
  lower95: number;
  upper95: number;
  n: number;
  totalWagered: number;
  totalWon: number;
} {
  const n = amounts.length;
  const totalWagered = amounts.reduce((a, b) => a + b, 0);
  const totalWon = wins.reduce((a, b) => a + b, 0);
  const rtp = totalWon / totalWagered;

  // Per-bet return ratios
  const returns = amounts.map((a, i) => wins[i] / a);
  const mu = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((acc, r) => acc + Math.pow(r - mu, 2), 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  const z95 = 1.96;

  return {
    rtp,
    lower95: mu - z95 * se,
    upper95: mu + z95 * se,
    n,
    totalWagered,
    totalWon,
  };
}
