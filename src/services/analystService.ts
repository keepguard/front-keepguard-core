/**
 * Cliente do analista financeiro (bff-invest).
 *
 * Contrato de números: a UI DEVE ler valores e vereditos de `signals[]`
 * (calculados em código no srv-analyst-finance). A `narrative` é só prosa —
 * nunca fonte de verdade numérica (principalmente quando LLM estiver ligado).
 */
import { BFF_INVEST_URL, customFetch } from './api';
import { getAccessToken } from './tokenStore';

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

export function analyzeTicker(ticker: string): Promise<AnalystAnalysis> {
  const token = getAccessToken() ?? undefined;
  return customFetch<AnalystAnalysis>(
    `${BFF_INVEST_URL}/api/v1/invest/analyst/assets/${encodeURIComponent(ticker)}/analyze`,
    { method: 'POST' },
    token,
  );
}
