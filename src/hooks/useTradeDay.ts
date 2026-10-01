import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getTradeOportunidades,
  getTradeSnapshot,
  type TradeItem,
  type TradeMarketState,
  type TradeOpportunity,
} from '../services/tradeService';

export interface TradeDayRow {
  ticker: string;
  item: TradeItem;
  opportunity?: TradeOpportunity;
}

export interface TradeDayState {
  rows: TradeDayRow[];
  market: { state: TradeMarketState; timeframe: string; intervalSeconds: number } | null;
  asOf: string | null;
  total: number;
  /** Primeira carga, sem nada pra mostrar ainda. */
  loading: boolean;
  /** Recarga em andamento (snapshot e/ou oportunidades); mantém o dado antigo na tela. */
  refreshing: boolean;
  snapshotError: { code?: string; message: string } | null;
  /** Falha só na busca de oportunidades — snapshot pode ter vindo bem mesmo assim (R6 da spec). */
  opportunityError: string | null;
  refresh: () => void;
}

function toError(err: unknown): { code?: string; message: string } {
  const e = err as { data?: { error?: string; message?: string }; message?: string };
  return { code: e?.data?.error, message: e?.data?.message || e?.message || 'Não foi possível carregar o Trade Day.' };
}

/**
 * Junta snapshot (OHLC/cotação) e oportunidades em lote (setup/entrada/stop) do universo
 * inteiro do plano — as 3 tabelas (Geral/Compra/Venda) precisam do conjunto completo pra
 * contar e filtrar por direção, não só de 1 página. `GET /trade/snapshot` aceita no máximo
 * `size=100` por chamada (400 INVALID_PAGE acima disso), então pede página a página até
 * juntar `total` itens ou esgotar um teto de segurança.
 */
const TRADE_DAY_PAGE_SIZE = 100;
const TRADE_DAY_MAX_PAGES = 20; // teto de segurança: 2000 ativos, bem acima de qualquer plano real.

export function useTradeDay(query?: string): TradeDayState {
  const [rows, setRows] = useState<TradeDayRow[]>([]);
  const [market, setMarket] = useState<TradeDayState['market']>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshotError, setSnapshotError] = useState<TradeDayState['snapshotError']>(null);
  const [opportunityError, setOpportunityError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setRefreshing(true);

    (async () => {
      const items: TradeItem[] = [];
      let snapMarket: TradeDayState['market'] = null;
      let snapAsOf: string | null = null;
      let snapTotal = 0;

      for (let page = 1; page <= TRADE_DAY_MAX_PAGES; page++) {
        const snap = await getTradeSnapshot(page, TRADE_DAY_PAGE_SIZE, query, ctrl.signal);
        if (ctrl.signal.aborted) return;
        snapMarket = snap.market;
        snapAsOf = snap.asOf;
        snapTotal = snap.total;
        items.push(...snap.items);
        if (items.length >= snap.total || snap.items.length === 0) break;
      }

      setMarket(snapMarket);
      setAsOf(snapAsOf);
      setTotal(snapTotal);
      setSnapshotError(null);

      const tickers = items.map((it) => it.ticker);
      let opportunities: Record<string, TradeOpportunity> = {};
      try {
        // /trade/oportunidades aceita até 100 tickers por chamada — junta em lotes.
        const batches: string[][] = [];
        for (let i = 0; i < tickers.length; i += 100) batches.push(tickers.slice(i, i + 100));
        const results = await Promise.all(batches.map((batch) => getTradeOportunidades(batch, undefined, ctrl.signal)));
        if (ctrl.signal.aborted) return;
        opportunities = Object.assign({}, ...results);
        setOpportunityError(null);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setOpportunityError(toError(err).message);
      }
      if (ctrl.signal.aborted) return;

      setRows(
        items.map((item) => ({
          ticker: item.ticker,
          item,
          opportunity: opportunities[item.ticker],
        })),
      );
    })()
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setSnapshotError(toError(err));
      })
      .finally(() => {
        if (ctrl.signal.aborted) return;
        setLoading(false);
        setRefreshing(false);
      });
  }, [query]);

  useEffect(() => {
    load();
    return () => controller.current?.abort();
  }, [load]);

  return { rows, market, asOf, total, loading, refreshing, snapshotError, opportunityError, refresh: load };
}
