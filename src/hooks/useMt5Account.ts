import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteMt5Account,
  getMt5Account,
  getMt5AccountInfo,
  listMt5HistoryDeals,
  listMt5Orders,
  listMt5Positions,
  saveMt5Account,
  type Mt5Account,
  type Mt5AccountInfo,
  type Mt5AccountInput,
  type Mt5Deal,
  type Mt5Order,
  type Mt5Position,
} from '../services/mt5AccountService';

export interface Mt5AccountState {
  account: Mt5Account | null;
  hasAccount: boolean;
  info: Mt5AccountInfo | null;
  positions: Mt5Position[];
  orders: Mt5Order[];
  deals: Mt5Deal[];
  loading: boolean;
  refreshing: boolean;
  error: { code?: string; message: string } | null;
  liveError: { code?: string; message: string } | null;
  refresh: () => void;
  save: (input: Mt5AccountInput) => Promise<void>;
  remove: () => Promise<void>;
}

function toError(err: unknown): { code?: string; message: string } {
  const e = err as { data?: { error?: string; message?: string }; message?: string };
  return { code: e?.data?.error, message: e?.data?.message || e?.message || 'Não foi possível carregar os dados do MT5.' };
}

export function useMt5Account(): Mt5AccountState {
  const [account, setAccount] = useState<Mt5Account | null>(null);
  const [hasAccount, setHasAccount] = useState(false);
  const [info, setInfo] = useState<Mt5AccountInfo | null>(null);
  const [positions, setPositions] = useState<Mt5Position[]>([]);
  const [orders, setOrders] = useState<Mt5Order[]>([]);
  const [deals, setDeals] = useState<Mt5Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Mt5AccountState['error']>(null);
  const [liveError, setLiveError] = useState<Mt5AccountState['liveError']>(null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setRefreshing(true);

    getMt5Account(ctrl.signal)
      .then((acc) => {
        if (ctrl.signal.aborted) return;
        setAccount(acc);
        setHasAccount(true);
        setError(null);
        return Promise.allSettled([
          getMt5AccountInfo(ctrl.signal),
          listMt5Positions(ctrl.signal),
          listMt5Orders(ctrl.signal),
          listMt5HistoryDeals(ctrl.signal),
        ]).then(([infoRes, posRes, ordRes, dealRes]) => {
          if (ctrl.signal.aborted) return;
          if (infoRes.status === 'fulfilled') {
            setInfo(infoRes.value);
            setLiveError(null);
          } else {
            setLiveError(toError(infoRes.reason));
          }
          setPositions(posRes.status === 'fulfilled' ? posRes.value : []);
          setOrders(ordRes.status === 'fulfilled' ? ordRes.value : []);
          setDeals(dealRes.status === 'fulfilled' ? dealRes.value : []);
        });
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        const e = err as { data?: { error?: string } };
        if (e?.data?.error === 'MT5_ACCOUNT_NOT_FOUND') {
          setHasAccount(false);
          setAccount(null);
          setError(null);
        } else {
          setError(toError(err));
        }
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

  const save = useCallback(
    async (input: Mt5AccountInput) => {
      await saveMt5Account(input);
      load();
    },
    [load],
  );

  const remove = useCallback(async () => {
    await deleteMt5Account();
    setAccount(null);
    setHasAccount(false);
    setInfo(null);
    setPositions([]);
    setOrders([]);
    setDeals([]);
  }, []);

  return { account, hasAccount, info, positions, orders, deals, loading, refreshing, error, liveError, refresh: load, save, remove };
}
