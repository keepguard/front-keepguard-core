/**
 * Cliente da integração MT5 (bff-invest): vínculo da conta do usuário logado
 * com o gateway MT5 (ambiente + URL, nunca credencial de corretora) e dados
 * ao vivo lidos do terminal (saldo, posições, ordens, histórico).
 */
import { BFF_INVEST_URL, customFetch } from './api';
import { getAccessToken } from './tokenStore';

const MT5_BASE = `${BFF_INVEST_URL}/api/v1/invest/trade/mt5`;

export type Mt5Ambiente = 'demo' | 'real';

export interface Mt5Account {
  ambiente: Mt5Ambiente;
  gatewayUrl: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Mt5AccountInput {
  ambiente: Mt5Ambiente;
  gatewayUrl: string;
}

export interface Mt5AccountInfo {
  login: number;
  tradeMode: number;
  leverage: number;
  balance: number;
  credit: number;
  profit: number;
  equity: number;
  margin: number;
  marginFree: number;
  marginLevel: number;
  currency: string;
  server: string;
  company: string;
  name: string;
}

export interface Mt5Position {
  symbol: string;
  volume: number;
  type: number;
  priceOpen: number;
  priceCurrent: number;
  profit: number;
  sl: number;
  tp: number;
}

export interface Mt5Order {
  symbol: string;
  volume: number;
  type: number;
  priceOpen: number;
  sl: number;
  tp: number;
}

export interface Mt5Deal {
  symbol: string;
  volume: number;
  type: number;
  price: number;
  profit: number;
  time: string;
}

function token(): string | undefined {
  return getAccessToken() || undefined;
}

// O gateway (srv-mt5-order-gateway, Python) devolve o dict cru do MT5 em
// snake_case (price_open, price_current, time_msc...), não camelCase — não
// há Pydantic model nessas 3 rotas (ver schemas.py). Mapeamos aqui pra não
// espalhar esse detalhe de transporte pelos componentes.
function toCamel<T>(raw: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = value;
  }
  return out as T;
}

function mapPosition(raw: Record<string, unknown>): Mt5Position {
  return toCamel<Mt5Position>(raw);
}

function mapOrder(raw: Record<string, unknown>): Mt5Order {
  return toCamel<Mt5Order>(raw);
}

function mapDeal(raw: Record<string, unknown>): Mt5Deal {
  const mapped = toCamel<Mt5Deal & { time?: number }>(raw);
  return {
    ...mapped,
    // `time` do MT5 é epoch em segundos (int), não ISO string.
    time: mapped.time ? new Date(mapped.time * 1000).toISOString() : '',
  };
}

export function getMt5Account(signal?: AbortSignal): Promise<Mt5Account> {
  return customFetch<Mt5Account>(`${MT5_BASE}/account`, { signal }, token());
}

export function saveMt5Account(input: Mt5AccountInput): Promise<Mt5Account> {
  return customFetch<Mt5Account>(`${MT5_BASE}/account`, { method: 'PUT', body: JSON.stringify(input) }, token());
}

export function deleteMt5Account(): Promise<void> {
  return customFetch<void>(`${MT5_BASE}/account`, { method: 'DELETE' }, token());
}

export function getMt5AccountInfo(signal?: AbortSignal): Promise<Mt5AccountInfo> {
  return customFetch<Mt5AccountInfo>(`${MT5_BASE}/account/info`, { signal }, token());
}

// O bff-invest envelopa as 3 listas em {"items": [...]} (trade_mt5_handlers.go),
// diferente de /account/info, que devolve o objeto cru.
export async function listMt5Positions(signal?: AbortSignal): Promise<Mt5Position[]> {
  const { items } = await customFetch<{ items: Record<string, unknown>[] }>(`${MT5_BASE}/positions`, { signal }, token());
  return items.map(mapPosition);
}

export async function listMt5Orders(signal?: AbortSignal): Promise<Mt5Order[]> {
  const { items } = await customFetch<{ items: Record<string, unknown>[] }>(`${MT5_BASE}/orders`, { signal }, token());
  return items.map(mapOrder);
}

export async function listMt5HistoryDeals(signal?: AbortSignal): Promise<Mt5Deal[]> {
  const { items } = await customFetch<{ items: Record<string, unknown>[] }>(`${MT5_BASE}/history/deals`, { signal }, token());
  return items.map(mapDeal);
}
