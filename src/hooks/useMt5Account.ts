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

type SectionError = { code?: string; message: string } | null;

export interface Mt5AccountState {
  account: Mt5Account | null;
  hasAccount: boolean;
  info: Mt5AccountInfo | null;
  positions: Mt5Position[];
  orders: Mt5Order[];
  deals: Mt5Deal[];
  loading: boolean;
  refreshing: boolean;
  infoLoading: boolean;
  positionsLoading: boolean;
  ordersLoading: boolean;
  dealsLoading: boolean;
  error: SectionError;
  liveError: SectionError;
  refresh: () => void;
  refreshInfo: () => void;
  refreshPositions: () => void;
  refreshOrders: () => void;
  refreshDeals: () => void;
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
  const [infoLoading, setInfoLoading] = useState(false);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [error, setError] = useState<SectionError>(null);
  const [liveError, setLiveError] = useState<SectionError>(null);

  // Um AbortController por seção: cada tabela tem seu próprio ciclo de
  // carregamento, então cancelar uma (nova chamada sobrepondo a anterior) não
  // pode derrubar as outras em andamento.
  const infoCtrl = useRef<AbortController | null>(null);
  const positionsCtrl = useRef<AbortController | null>(null);
  const ordersCtrl = useRef<AbortController | null>(null);
  const dealsCtrl = useRef<AbortController | null>(null);

  const loadInfo = useCallback(() => {
    infoCtrl.current?.abort();
    const ctrl = new AbortController();
    infoCtrl.current = ctrl;
    setInfoLoading(true);
    getMt5AccountInfo(ctrl.signal)
      .then((v) => {
        if (ctrl.signal.aborted) return;
        setInfo(v);
        setLiveError(null);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setLiveError(toError(err));
      })
      .finally(() => {
        if (ctrl.signal.aborted) return;
        setInfoLoading(false);
      });
  }, []);

  const loadPositions = useCallback(() => {
    positionsCtrl.current?.abort();
    const ctrl = new AbortController();
    positionsCtrl.current = ctrl;
    setPositionsLoading(true);
    listMt5Positions(ctrl.signal)
      .then((v) => {
        if (ctrl.signal.aborted) return;
        setPositions(v);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setPositions([]);
      })
      .finally(() => {
        if (ctrl.signal.aborted) return;
        setPositionsLoading(false);
      });
  }, []);

  const loadOrders = useCallback(() => {
    ordersCtrl.current?.abort();
    const ctrl = new AbortController();
    ordersCtrl.current = ctrl;
    setOrdersLoading(true);
    listMt5Orders(ctrl.signal)
      .then((v) => {
        if (ctrl.signal.aborted) return;
        setOrders(v);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setOrders([]);
      })
      .finally(() => {
        if (ctrl.signal.aborted) return;
        setOrdersLoading(false);
      });
  }, []);

  const loadDeals = useCallback(() => {
    dealsCtrl.current?.abort();
    const ctrl = new AbortController();
    dealsCtrl.current = ctrl;
    setDealsLoading(true);
    listMt5HistoryDeals(ctrl.signal)
      .then((v) => {
        if (ctrl.signal.aborted) return;
        setDeals(v);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setDeals([]);
      })
      .finally(() => {
        if (ctrl.signal.aborted) return;
        setDealsLoading(false);
      });
  }, []);

  // "Atualizar tudo": dispara as 4 seções em paralelo, sem esperar umas pelas
  // outras — cada tabela atualiza assim que a sua própria chamada volta, em
  // vez de todas ficarem presas na mais lenta (Promise.allSettled coletivo).
  const load = useCallback(() => {
    getMt5Account()
      .then((acc) => {
        setAccount(acc);
        setHasAccount(true);
        setError(null);
        loadInfo();
        loadPositions();
        loadOrders();
        loadDeals();
      })
      .catch((err) => {
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
        setLoading(false);
      });
  }, [loadInfo, loadPositions, loadOrders, loadDeals]);

  useEffect(() => {
    load();
    return () => {
      infoCtrl.current?.abort();
      positionsCtrl.current?.abort();
      ordersCtrl.current?.abort();
      dealsCtrl.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const refreshing = infoLoading || positionsLoading || ordersLoading || dealsLoading;

  return {
    account,
    hasAccount,
    info,
    positions,
    orders,
    deals,
    loading,
    refreshing,
    infoLoading,
    positionsLoading,
    ordersLoading,
    dealsLoading,
    error,
    liveError,
    refresh: load,
    refreshInfo: loadInfo,
    refreshPositions: loadPositions,
    refreshOrders: loadOrders,
    refreshDeals: loadDeals,
    save,
    remove,
  };
}
