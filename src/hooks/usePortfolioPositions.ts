import { useCallback, useEffect, useRef, useState } from 'react';
import { listPortfolioPositions, type PortfolioPosition } from '../services/portfolioService';

export interface PortfolioPositionsState {
  data: PortfolioPosition[] | null;
  loading: boolean;
  refreshing: boolean;
  error: { code?: string; message: string } | null;
  refresh: () => void;
}

function toError(err: unknown): { code?: string; message: string } {
  const e = err as { data?: { error?: string; message?: string }; message?: string };
  return { code: e?.data?.error, message: e?.data?.message || e?.message || 'Não foi possível carregar a carteira.' };
}

export function usePortfolioPositions(): PortfolioPositionsState {
  const [data, setData] = useState<PortfolioPosition[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<PortfolioPositionsState['error']>(null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setRefreshing(true);
    listPortfolioPositions(ctrl.signal)
      .then((positions) => {
        if (ctrl.signal.aborted) return;
        setData(positions);
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

  return { data, loading, refreshing, error, refresh: load };
}
