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
  [key: string]: unknown;
}

export interface Mt5Order {
  symbol: string;
  volume: number;
  type: number;
  priceOpen: number;
  sl: number;
  tp: number;
  [key: string]: unknown;
}

export interface Mt5Deal {
  symbol: string;
  volume: number;
  type: number;
  price: number;
  profit: number;
  time: string;
  [key: string]: unknown;
}

function token(): string | undefined {
  return getAccessToken() || undefined;
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

export function listMt5Positions(signal?: AbortSignal): Promise<Mt5Position[]> {
  return customFetch<Mt5Position[]>(`${MT5_BASE}/positions`, { signal }, token());
}

export function listMt5Orders(signal?: AbortSignal): Promise<Mt5Order[]> {
  return customFetch<Mt5Order[]>(`${MT5_BASE}/orders`, { signal }, token());
}

export function listMt5HistoryDeals(signal?: AbortSignal): Promise<Mt5Deal[]> {
  return customFetch<Mt5Deal[]>(`${MT5_BASE}/history/deals`, { signal }, token());
}
