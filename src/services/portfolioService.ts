/**
 * Cliente do menu Carteira (bff-invest): registro de compra/venda e posição calculada.
 * Carteira é pessoal — isolada por usuário (JWT), mesmo dentro da mesma organização.
 */
import { BFF_INVEST_URL, customFetch } from './api';
import { getAccessToken } from './tokenStore';

const PORTFOLIO_BASE = `${BFF_INVEST_URL}/api/v1/invest/trade/portfolio`;

export type TransactionSide = 'BUY' | 'SELL';

export interface PortfolioPosition {
  ticker: string;
  quantity: number;
  averagePrice: number;
  totalCost: number;
  realizedPl: number;
  lastUpdatedAt: string;
}

export interface PortfolioTransaction {
  id: string;
  ticker: string;
  side: TransactionSide;
  quantity: number;
  price: number;
  fees: number;
  broker?: string;
  notes?: string;
  tradedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioTransactionList {
  items: PortfolioTransaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface PortfolioTransactionInput {
  side: TransactionSide;
  quantity: number;
  price: number;
  fees: number;
  broker?: string;
  notes?: string;
  /** ISO 8601. */
  tradedAt: string;
}

export interface PortfolioTransactionWriteResponse {
  transaction: PortfolioTransaction;
  position: PortfolioPosition;
}

export function listPortfolioPositions(signal?: AbortSignal): Promise<PortfolioPosition[]> {
  return customFetch<PortfolioPosition[]>(
    `${PORTFOLIO_BASE}/positions`,
    { method: 'GET', signal },
    getAccessToken() || undefined,
  );
}

export function listPortfolioTransactions(
  opts: { ticker?: string; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<PortfolioTransactionList> {
  const params = new URLSearchParams();
  if (opts.ticker) params.set('ticker', opts.ticker);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  const qs = params.toString();
  return customFetch<PortfolioTransactionList>(
    `${PORTFOLIO_BASE}/transactions${qs ? `?${qs}` : ''}`,
    { method: 'GET', signal },
    getAccessToken() || undefined,
  );
}

export function addPortfolioTransaction(
  ticker: string,
  input: PortfolioTransactionInput,
): Promise<PortfolioTransactionWriteResponse> {
  return customFetch<PortfolioTransactionWriteResponse>(
    `${PORTFOLIO_BASE}/assets/${encodeURIComponent(ticker)}/transactions`,
    { method: 'POST', body: JSON.stringify(input) },
    getAccessToken() || undefined,
  );
}

export function updatePortfolioTransaction(
  id: string,
  input: PortfolioTransactionInput,
): Promise<PortfolioTransactionWriteResponse> {
  return customFetch<PortfolioTransactionWriteResponse>(
    `${PORTFOLIO_BASE}/transactions/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(input) },
    getAccessToken() || undefined,
  );
}

export function deletePortfolioTransaction(id: string): Promise<PortfolioPosition> {
  return customFetch<PortfolioPosition>(
    `${PORTFOLIO_BASE}/transactions/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    getAccessToken() || undefined,
  );
}
