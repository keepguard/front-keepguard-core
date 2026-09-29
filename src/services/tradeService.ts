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

/** `q` filtra por substring do ticker no universo do plano, antes da paginação
 * (server-side) — buscar um ticker de qualquer página sempre encontra. */
export function getTradeSnapshot(page = 1, size = 50, q?: string, signal?: AbortSignal): Promise<TradeSnapshot> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (q) params.set('q', q);
  return customFetch<TradeSnapshot>(
    `${TRADE_BASE}/snapshot?${params.toString()}`,
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
 * Histórico de candles de um ativo do plano, para o gráfico do Trade Day.
 * `timeframe` opcional (M1-M59/H1-H24; default M10 do backend quando omitido — M1/M10 são
 * leitura direta, qualquer outro valor é agregado a partir de M1 no srv-mt5-market-data).
 * `from`/`to` opcionais (ISO 8601); ativo fora do plano responde 403 ASSET_OUTSIDE_PLAN.
 */
/** Favoritos pessoais do Trade Monitor (troca rápida de ativo no gráfico) — coleção própria,
 * diferente dos favoritos de Mercado/Dossiê: aqui o universo é o do plano/MT5, não o catálogo
 * de pesquisa. Teto de 20 aplicado pelo backend (`TOO_MANY_TRADE_FAVORITES`). */
/** Timeframe/período fixado para um favorito — reaplicado sozinho ao reabrir o chip. */
export interface TradeFavoriteFilter {
  timeframe?: string;
  range?: string;
  /** Só presentes quando range === 'CUSTOM'; ISO 8601. */
  from?: string;
  to?: string;
}

export interface TradeFavorites {
  tickers: string[];
  filters?: Record<string, TradeFavoriteFilter>;
  maxTickers: number;
  updatedAt?: string;
}

export function getTradeFavorites(signal?: AbortSignal): Promise<TradeFavorites> {
  return customFetch<TradeFavorites>(
    `${TRADE_BASE}/favorites`,
    { method: 'GET', signal },
    getAccessToken() || undefined,
  );
}

/** PUT reescreve tickers e filters por inteiro — é assim que o reorder persiste e é
 * assim que um favorito removido perde o filtro salvo (não manda mais a chave dele). */
export function saveTradeFavorites(tickers: string[], filters?: Record<string, TradeFavoriteFilter>): Promise<TradeFavorites> {
  return customFetch<TradeFavorites>(
    `${TRADE_BASE}/favorites`,
    { method: 'PUT', body: JSON.stringify({ tickers, filters }) },
    getAccessToken() || undefined,
  );
}

/** Oportunidade identificada agora pelo srv-mt5-analytics (só `turtle_soup` ativo em produção). */
export interface TradeOpportunity {
  setup: string;
  direcao: string;
  entrada: number;
  stop: number;
  /** Ausente = sem alvo fixo, saída por trailing (hoje sempre o caso do turtle_soup). */
  alvo?: number;
  confiancaEscolha: number;
}

function isHttpStatus(err: unknown, status: number): boolean {
  return (err as { status?: number }).status === status;
}

/** Devolve `null` quando nenhum setup disparou agora (404) — não é erro, é o estado normal
 * da maioria dos ativos na maior parte do tempo. */
export async function getTradeAssetOportunidade(
  ticker: string,
  timeframe?: string,
  signal?: AbortSignal,
): Promise<TradeOpportunity | null> {
  const qs = timeframe ? `?timeframe=${encodeURIComponent(timeframe)}` : '';
  try {
    return await customFetch<TradeOpportunity>(
      `${TRADE_BASE}/assets/${encodeURIComponent(ticker)}/oportunidade${qs}`,
      { method: 'GET', signal },
      getAccessToken() || undefined,
    );
  } catch (err) {
    if (isHttpStatus(err, 404)) return null;
    throw err;
  }
}

/** UM sinal do histórico do Turtle Soup — resolvido (stop/trailing/teto) ou ainda em
 * aberto na borda mais recente (`resolvido: false`, `motivoSaida` ausente). */
export interface TurtleSoupSinalHistorico {
  direcao: string;
  entrada: number;
  stop: number;
  dataEntrada: string;
  dataSaida: string;
  precoSaida: number;
  rMultiplo: number;
  resolvido: boolean;
  motivoSaida?: string;
}

export interface TurtleSoupHistorico {
  ticker: string;
  timeframe: string;
  sinais: TurtleSoupSinalHistorico[];
}

/** Histórico completo de sinais do Turtle Soup pra um ativo — usado pela aba "Setups"
 * (gráfico com a técnica aplicada no dado real). Sempre 200, `sinais` pode vir vazio. */
export function getTurtleSoupHistorico(ticker: string, signal?: AbortSignal): Promise<TurtleSoupHistorico> {
  return customFetch<TurtleSoupHistorico>(
    `${TRADE_BASE}/assets/${encodeURIComponent(ticker)}/turtle-soup/historico`,
    { method: 'GET', signal },
    getAccessToken() || undefined,
  );
}

/** Oportunidade de vários ativos numa chamada só — usado pela grade (`TradeView`), pra não
 * virar 1 request por card. Ticker sem sinal agora simplesmente não vem no mapa devolvido. */
export async function getTradeOportunidades(
  tickers: string[],
  timeframe?: string,
  signal?: AbortSignal,
): Promise<Record<string, TradeOpportunity>> {
  if (tickers.length === 0) return {};
  const params = new URLSearchParams({ tickers: tickers.join(',') });
  if (timeframe) params.set('timeframe', timeframe);
  const resp = await customFetch<{ oportunidades: Record<string, TradeOpportunity> }>(
    `${TRADE_BASE}/oportunidades?${params.toString()}`,
    { method: 'GET', signal },
    getAccessToken() || undefined,
  );
  return resp.oportunidades;
}

export function getTradeCandleHistory(
  ticker: string,
  opts: { timeframe?: string; from?: Date; to?: Date; limit?: number } = {},
  signal?: AbortSignal,
): Promise<TradeCandleHistory> {
  const params = new URLSearchParams();
  if (opts.timeframe) params.set('timeframe', opts.timeframe);
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
