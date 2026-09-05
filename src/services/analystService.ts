/**
 * Cliente do analista financeiro (bff-invest).
 *
 * Contrato de números: a UI DEVE ler valores e vereditos de `signals[]`
 * (calculados em código no ms-analyst-finance). A `narrative` é só prosa —
 * nunca fonte de verdade numérica (principalmente quando LLM estiver ligado).
 */
import { BFF_INVEST_URL, customFetch } from './api';
import { getAccessToken } from './tokenStore';

const ANALYST_BASE = `${BFF_INVEST_URL}/api/v1/invest/analyst`;

export const WATCHLIST_MAX_TICKERS = 50;
export const TICKER_PATTERN = /^[A-Z0-9]{4,6}$/;

export interface AnalystSignal {
  metric: string;
  verdict: string;
  explanation: string;
  grounding?: {
    dataSource?: string;
    valueNum?: number;
    observedAt?: string;
  };
}

export interface AnalystAnalysis {
  runId?: string;
  ticker: string;
  displayName: string;
  analysisDate: string;
  /** Números oficiais — use este array; não parseie a narrativa. */
  signals: AnalystSignal[];
  gaps: { metric: string; reason: string }[];
  /** Prosa; não use como fonte de números. */
  narrative: string;
  narrativeStatus: string;
  sources: { dataSource: string; collectedAt: string }[];
  disclaimer: string;
}

export interface AnalystWatchlist {
  companyId: string;
  tickers: string[];
  maxTickers: number;
  enabled: boolean;
  updatedAt?: string;
}

export interface AnalystWatchlistWrite {
  tickers: string[];
  enabled?: boolean;
}

export interface AnalystVerdictDelta {
  metric: string;
  kind: string;
  fromVerdict?: string;
  toVerdict?: string;
  fromValue?: number;
  toValue?: number;
}

export interface AnalystVerdictChange {
  id: string;
  companyId: string;
  ticker: string;
  runId: string;
  previousRunId: string;
  detectedAt: string;
  isMaterial: boolean;
  changes: AnalystVerdictDelta[];
}

function token(): string | undefined {
  return getAccessToken() ?? undefined;
}

export function isValidTicker(raw: string): boolean {
  return TICKER_PATTERN.test(raw.trim().toUpperCase());
}

export function analyzeTicker(ticker: string): Promise<AnalystAnalysis> {
  return customFetch<AnalystAnalysis>(
    `${ANALYST_BASE}/assets/${encodeURIComponent(ticker)}/analyze`,
    { method: 'POST' },
    token(),
  );
}

export function getWatchlist(): Promise<AnalystWatchlist> {
  return customFetch<AnalystWatchlist>(`${ANALYST_BASE}/watchlist`, { method: 'GET' }, token());
}

export function saveWatchlist(write: AnalystWatchlistWrite): Promise<AnalystWatchlist> {
  return customFetch<AnalystWatchlist>(
    `${ANALYST_BASE}/watchlist`,
    { method: 'PUT', body: JSON.stringify(write) },
    token(),
  );
}

export function listChanges(limit = 20, ticker?: string): Promise<AnalystVerdictChange[]> {
  const query = `?limit=${Math.max(1, limit)}`;
  const path = ticker
    ? `${ANALYST_BASE}/assets/${encodeURIComponent(ticker)}/changes${query}`
    : `${ANALYST_BASE}/changes${query}`;
  return customFetch<AnalystVerdictChange[]>(path, { method: 'GET' }, token());
}

export interface AnalystRun {
  id: string;
  companyId: string;
  ticker: string;
  displayName: string;
  analyzedAt: string;
  trigger: string;
  signals: AnalystSignal[];
  gaps: { metric: string; reason: string }[];
  narrative: string;
  narrativeStatus: string;
  sources: { dataSource: string; collectedAt: string }[];
  disclaimer: string;
  newsCount?: number;
  outcome: string;
  staleFacts?: boolean;
}

export interface AnalystMemory {
  id: string;
  ticker: string;
  derivedAt: string;
  revision: number;
  isDerived: boolean;
  summary: string;
}

export interface AnalystFavorites {
  companyId: string;
  userId: string;
  tickers: string[];
  maxTickers: number;
  updatedAt?: string;
}

export interface AnalystTickers {
  tickers: string[];
}

export function listRuns(ticker: string, limit = 20): Promise<AnalystRun[]> {
  return customFetch<AnalystRun[]>(
    `${ANALYST_BASE}/assets/${encodeURIComponent(ticker)}/runs?limit=${Math.max(1, limit)}`,
    { method: 'GET' },
    token(),
  );
}

export function getMemory(ticker: string): Promise<AnalystMemory> {
  return customFetch<AnalystMemory>(
    `${ANALYST_BASE}/assets/${encodeURIComponent(ticker)}/memory`,
    { method: 'GET' },
    token(),
  );
}

export function listKnownTickers(): Promise<AnalystTickers> {
  return customFetch<AnalystTickers>(`${ANALYST_BASE}/tickers`, { method: 'GET' }, token());
}

export function getFavorites(): Promise<AnalystFavorites> {
  return customFetch<AnalystFavorites>(`${ANALYST_BASE}/favorites`, { method: 'GET' }, token());
}

export function saveFavorites(tickers: string[]): Promise<AnalystFavorites> {
  return customFetch<AnalystFavorites>(
    `${ANALYST_BASE}/favorites`,
    { method: 'PUT', body: JSON.stringify({ tickers }) },
    token(),
  );
}
