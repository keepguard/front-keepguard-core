/**
 * Cliente do menu Trade (bff-invest): última cotação e último candle fechado por ativo do plano.
 * O dado vem do ciclo do coletor (a cada ~10 min); não é tick ao vivo.
 */
import { BFF_INVEST_URL, customFetch } from './api';
import { getAccessToken } from './tokenStore';

const TRADE_BASE = `${BFF_INVEST_URL}/api/v1/invest/trade`;

/** OPEN: pregão com dado recente. CLOSED: fora do horário. NO_UPDATES: no horário, mas sem coleta recente. */
export type TradeMarketState = 'OPEN' | 'CLOSED' | 'NO_UPDATES';

export interface TradeQuote {
  last: number;
  bid: number;
  ask: number;
  volume: number;
  ts: string;
  collectedAt: string;
}

export interface TradeCandle {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Variação do próprio candle (fechamento contra abertura), não a do dia. */
  changePct?: number;
  tickVolume: number;
  realVolume: number;
}

export interface TradeItem {
  ticker: string;
  /** Nulo quando o ativo do plano não tem dado coletado. */
  quote: TradeQuote | null;
  candle: TradeCandle | null;
  ageSeconds?: number;
  stale: boolean;
}

export interface TradeSnapshot {
  asOf: string;
  market: { state: TradeMarketState; timeframe: string; intervalSeconds: number };
  items: TradeItem[];
  /** Ativos sem cotação, só na página atual. */
  missing: number;
  total: number;
  page: number;
  size: number;
}

export function getTradeSnapshot(page = 1, size = 50, signal?: AbortSignal): Promise<TradeSnapshot> {
  const qs = `?page=${page}&size=${size}`;
  return customFetch<TradeSnapshot>(
    `${TRADE_BASE}/snapshot${qs}`,
    { method: 'GET', signal },
    getAccessToken() || undefined,
  );
}

export interface TradeCandleHistory {
  ticker: string;
  timeframe: string;
  candles: TradeCandle[];
}

/**
 * Histórico de candles M10 de um ativo do plano, para o gráfico do Trade Day.
 * `from`/`to` opcionais (ISO 8601); ativo fora do plano responde 403 ASSET_OUTSIDE_PLAN.
 */
export function getTradeCandleHistory(
  ticker: string,
  opts: { from?: Date; to?: Date; limit?: number } = {},
  signal?: AbortSignal,
): Promise<TradeCandleHistory> {
  const params = new URLSearchParams();
  if (opts.from) params.set('from', opts.from.toISOString());
  if (opts.to) params.set('to', opts.to.toISOString());
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return customFetch<TradeCandleHistory>(
    `${TRADE_BASE}/assets/${encodeURIComponent(ticker)}/candles${qs ? `?${qs}` : ''}`,
    { method: 'GET', signal },
    getAccessToken() || undefined,
  );
}
