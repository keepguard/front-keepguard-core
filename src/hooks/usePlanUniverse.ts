import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getUserWatchlist, WATCHLIST_MAX_TICKERS } from '../services/analystService';

export interface PlanUniverse {
  /** A carteira já foi consultada (ou a consulta falhou). */
  ready: boolean;
  /** VIP, admin ou ops: leem o universo inteiro. */
  fullAccess: boolean;
  /** Ativos do plano (fixos + picks). */
  tickers: string[];
  /** O usuário pode ler este ativo em detalhe? */
  has: (ticker: string) => boolean;
}

/**
 * Ativos que o usuário pode ler em detalhe. Espelha a regra do BFF: plano com universo limitado enxerga só
 * a própria carteira. Serve para desenhar a interface; quem barra de verdade é o BFF.
 */
export function usePlanUniverse(): PlanUniverse {
  const { user } = useAuth();
  const isOps = Boolean(user?.roles?.some((r) => r === 'ROLE_ADMIN' || r === 'ROLE_OPS'));
  const [state, setState] = useState<{ ready: boolean; vip: boolean; tickers: string[] }>({ ready: false, vip: false, tickers: [] });

  useEffect(() => {
    let cancelled = false;
    getUserWatchlist()
      .then((uw) => {
        if (cancelled) return;
        setState({
          ready: true,
          vip: uw.planCode?.toUpperCase() === 'VIP' || (uw.maxTickers ?? 0) >= WATCHLIST_MAX_TICKERS,
          tickers: (uw.tickers ?? []).map((t) => t.toUpperCase()),
        });
      })
      .catch(() => {
        if (!cancelled) setState((prev) => ({ ...prev, ready: true }));
      });
    return () => { cancelled = true; };
  }, []);

  const fullAccess = isOps || state.vip;
  const allowed = useMemo(() => new Set(state.tickers), [state.tickers]);
  const has = useMemo(
    () => (ticker: string) => fullAccess || allowed.has(ticker.trim().toUpperCase()),
    [fullAccess, allowed],
  );
  return { ready: state.ready, fullAccess, tickers: state.tickers, has };
}
