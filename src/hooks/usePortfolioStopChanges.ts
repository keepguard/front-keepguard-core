import { useCallback, useEffect, useRef, useState } from 'react';
import { getPortfolioStopChanges, type PortfolioStopChange } from '../services/portfolioService';

export interface PortfolioStopChangesState {
  data: PortfolioStopChange[] | null;
  loading: boolean;
  refreshing: boolean;
  error: { code?: string; message: string } | null;
  refresh: () => void;
  /** Tira 1 ticker da lista na hora (sem novo fetch) — usado depois de
   * confirmPortfolioStopChange, que já tirou o ticker do cache no backend. */
  removeLocal: (ticker: string) => void;
}

function toError(err: unknown): { code?: string; message: string } {
  const e = err as { data?: { error?: string; message?: string }; message?: string };
  return { code: e?.data?.error, message: e?.data?.message || e?.message || 'Não foi possível verificar os ajustes de stop.' };
}

/** Lista de tickers da carteira cujo Stop/Limite mudou desde a última vez que o sistema
 * mostrou pro usuário — aba "Precisa ajustar" do Trade Day. */
export function usePortfolioStopChanges(): PortfolioStopChangesState {
  const [data, setData] = useState<PortfolioStopChange[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<PortfolioStopChangesState['error']>(null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setRefreshing(true);
    getPortfolioStopChanges(ctrl.signal)
      .then((items) => {
        if (ctrl.signal.aborted) return;
        setData(items);
        setError(null);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setError(toError(err));
      })
      .finally(() => {
        if (ctrl.signal.aborted) return;
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    load();
    return () => controller.current?.abort();
  }, [load]);

  const removeLocal = useCallback((ticker: string) => {
    setData((prev) => (prev ? prev.filter((item) => item.ticker !== ticker) : prev));
  }, []);

  return { data, loading, refreshing, error, refresh: load, removeLocal };
}
