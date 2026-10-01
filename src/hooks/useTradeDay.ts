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
  missing: number;
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
 * Junta snapshot (OHLC/cotação, paginado) e oportunidades em lote (setup/entrada/stop) do
 * universo inteiro do plano — sem paginação, porque as 3 tabelas (Geral/Compra/Venda)
 * precisam enxergar o conjunto completo pra contar e filtrar por direção. `pageSize` grande
 * o bastante pra cobrir planos reais (VIP/ops veem todo o habilitado); ver aviso de `missing`
 * se algum dia um plano ultrapassar isso.
 */
const TRADE_DAY_PAGE_SIZE = 500;

export function useTradeDay(query?: string): TradeDayState {
  const [rows, setRows] = useState<TradeDayRow[]>([]);
  const [market, setMarket] = useState<TradeDayState['market']>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [missing, setMissing] = useState(0);
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

    getTradeSnapshot(1, TRADE_DAY_PAGE_SIZE, query, ctrl.signal)
      .then(async (snap) => {
        if (ctrl.signal.aborted) return;
        setMarket(snap.market);
        setAsOf(snap.asOf);
        setTotal(snap.total);
        setMissing(snap.missing);
        setSnapshotError(null);

        const tickers = snap.items.map((it) => it.ticker);
        let opportunities: Record<string, TradeOpportunity> = {};
        try {
          opportunities = await getTradeOportunidades(tickers, undefined, ctrl.signal);
          setOpportunityError(null);
        } catch (err) {
          if (ctrl.signal.aborted) return;
          setOpportunityError(toError(err).message);
        }
        if (ctrl.signal.aborted) return;

        setRows(
          snap.items.map((item) => ({
            ticker: item.ticker,
            item,
            opportunity: opportunities[item.ticker],
          })),
        );
      })
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

  return { rows, market, asOf, total, missing, loading, refreshing, snapshotError, opportunityError, refresh: load };
}
