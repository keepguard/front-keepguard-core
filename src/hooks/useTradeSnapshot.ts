import { useCallback, useEffect, useRef, useState } from 'react';
import { getTradeSnapshot, type TradeSnapshot } from '../services/tradeService';

export const TRADE_POLL_MS = 60_000;

export interface TradeSnapshotState {
  data: TradeSnapshot | null;
  /** Primeira carga sem nada para mostrar. */
  loading: boolean;
  /** Recarga em andamento (mantém o dado antigo na tela). */
  refreshing: boolean;
  /** Última tentativa falhou; `data` continua sendo o último dado bom. */
  error: { code?: string; message: string } | null;
  refresh: () => void;
}

function toError(err: unknown): { code?: string; message: string } {
  const e = err as { data?: { error?: string; message?: string }; message?: string };
  return { code: e?.data?.error, message: e?.data?.message || e?.message || 'Não foi possível carregar as cotações.' };
}

/**
 * Lê o snapshot do Trade e o atualiza a cada 60 s enquanto a aba está visível. O dado só muda a cada ciclo
 * do coletor (~10 min), então não há ganho em consultar mais rápido. Em falha, mantém o último dado bom.
 */
export function useTradeSnapshot(page: number, size: number, q?: string): TradeSnapshotState {
  const [data, setData] = useState<TradeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<TradeSnapshotState['error']>(null);
  const controller = useRef<AbortController | null>(null);
  const lastLoad = useRef(0);

  const load = useCallback(() => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setRefreshing(true);
    getTradeSnapshot(page, size, q, ctrl.signal)
      .then((snap) => {
        if (ctrl.signal.aborted) return;
        lastLoad.current = Date.now();
        setData(snap);
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
  }, [page, size, q]);

  useEffect(() => {
    load();
    const id = window.setInterval(() => {
      if (!document.hidden) load();
    }, TRADE_POLL_MS);
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastLoad.current >= TRADE_POLL_MS) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      controller.current?.abort();
    };
  }, [load]);

  return { data, loading, refreshing, error, refresh: load };
}
