import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMt5Account, listMt5Positions } from '../services/mt5AccountService';
import { aggregatePositions, type CustodyPosition } from '../utils/mt5Custody';

/**
 * Custódia real do usuário lida do MT5 vinculado (SPEC-003 R1/R3/R4) — usada onde só
 * as posições importam (sub-aba Carteira do Trade). A tela Carteira completa usa
 * useMt5Account, que também traz saldo, ordens e histórico.
 */
export interface Mt5CustodyState {
  data: CustodyPosition[] | null;
  /** Usuário sem conta MT5 vinculada (não é erro). */
  noAccount: boolean;
  loading: boolean;
  refreshing: boolean;
  /** Gateway/BFF fora do ar. */
  error: { code?: string; message: string } | null;
  /** Momento da última leitura bem-sucedida (ms epoch). */
  lastOkAt: number | null;
  refresh: () => void;
}

function toError(err: unknown): { code?: string; message: string } {
  const e = err as { data?: { error?: string; message?: string }; message?: string };
  return { code: e?.data?.error, message: e?.data?.message || e?.message || 'Corretora indisponível no momento.' };
}

export function useMt5Custody(): Mt5CustodyState {
  const [positions, setPositions] = useState<CustodyPosition[] | null>(null);
  const [noAccount, setNoAccount] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Mt5CustodyState['error']>(null);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setRefreshing(true);
    getMt5Account(ctrl.signal)
      .then(() => listMt5Positions(undefined, ctrl.signal))
      .then((raw) => {
        if (ctrl.signal.aborted) return;
        setPositions(aggregatePositions(raw));
        setNoAccount(false);
        setError(null);
        setLastOkAt(Date.now());
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        const e = err as { data?: { error?: string } };
        if (e?.data?.error === 'MT5_ACCOUNT_NOT_FOUND') {
          setNoAccount(true);
          setPositions([]);
          setError(null);
          return;
        }
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

  return useMemo(
    () => ({ data: positions, noAccount, loading, refreshing, error, lastOkAt, refresh: load }),
    [positions, noAccount, loading, refreshing, error, lastOkAt, load],
  );
}
