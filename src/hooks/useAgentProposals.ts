import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getProposals,
  toAgentError,
  type AgentApiError,
  type ProposalsResponse,
} from '../services/agentOrdersService';

export interface AgentProposalsState {
  data: ProposalsResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: AgentApiError | null;
  refresh: () => void;
}

/**
 * Tabela viva do Agent Ordens (GET /proposals). Fica no TradeDayView (não no painel) porque
 * o título da sub-aba mostra os contadores por família mesmo com outra sub-aba aberta.
 */
export function useAgentProposals(): AgentProposalsState {
  const [data, setData] = useState<ProposalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<AgentApiError | null>(null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setRefreshing(true);
    getProposals(ctrl.signal)
      .then((resp) => {
        if (ctrl.signal.aborted) return;
        setData(resp);
        setError(null);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setError(toAgentError(err));
      })
      .finally(() => {
        if (ctrl.signal.aborted) return;
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    setData(null);
    setLoading(true);
    load();
    return () => controller.current?.abort();
  }, [load]);

  return { data, loading, refreshing, error, refresh: load };
}
