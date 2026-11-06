import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { getBillingSettings, type BillingSettings } from '../../../services/billingService';
import { generateUUID } from '../../../services/api';
import {
  classifyMoneyError,
  isCoreWriteEnabled,
  isCreditActive,
  isFinancialActive,
  type MoneyError,
} from '../../../utils/billingMoney';

export interface BillingFeatures {
  loading: boolean;
  settings: BillingSettings | null;
  /** Extrato e Lançar crédito: pela chave `credit_enabled` da company. */
  creditOn: boolean;
  /** Conta linha a linha e Estornar: pelo modo financeiro da company. */
  financialOn: boolean;
  /** Pode gravar. Nasce falso: a consulta nunca depende disto. */
  writeOpen: boolean;
  markWriteDisabled: () => void;
}

const OFF: BillingFeatures = {
  loading: false,
  settings: null,
  creditOn: false,
  financialOn: false,
  writeOpen: false,
  markWriteDisabled: () => {},
};

export const BillingFeaturesContext = createContext<BillingFeatures>(OFF);

export function useBillingFeatures(): BillingFeatures {
  return useContext(BillingFeaturesContext);
}

/**
 * Lê `GET /billing-settings` uma vez por montagem. Qualquer falha (rota ausente, 403 de quem
 * não é operador, billing fora) deixa a tela como é hoje: nada novo aparece por dedução.
 */
export function useLoadBillingFeatures(): BillingFeatures {
  const { isAuthenticated, getAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [disabledByServer, setDisabledByServer] = useState(false);

  useEffect(() => {
    const access = getAccessToken();
    if (!isAuthenticated || !access) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getBillingSettings(access)
      .then((data) => { if (active) setSettings(data); })
      .catch(() => { if (active) setSettings(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [getAccessToken, isAuthenticated]);

  const markWriteDisabled = useCallback(() => setDisabledByServer(true), []);

  return useMemo(() => ({
    loading,
    settings,
    creditOn: isCreditActive(settings),
    financialOn: isFinancialActive(settings),
    writeOpen: isCoreWriteEnabled(settings) && !disabledByServer,
    markWriteDisabled,
  }), [disabledByServer, loading, markWriteDisabled, settings]);
}

/**
 * Escrita de dinheiro com `Idempotency-Key`. O billing guarda 2xx e 4xx por 7 dias e apaga em 5xx (§3):
 * - resposta definitiva: a próxima tentativa precisa de chave nova, senão repetiria a mesma recusa;
 * - sem resposta certa: mesma chave e mesmo corpo, com o formulário congelado para não virar outro pedido.
 */
export function useMoneyWrite() {
  const { markWriteDisabled } = useBillingFeatures();
  const key = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MoneyError | null>(null);

  const run = useCallback(async <T,>(call: (idempotencyKey: string) => Promise<T>): Promise<T | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    key.current ??= generateUUID();
    try {
      const result = await call(key.current);
      key.current = null;
      return result;
    } catch (failure) {
      const classified = classifyMoneyError(failure);
      if (classified.kind === 'write_disabled') markWriteDisabled();
      if (classified.kind === 'definitive' || classified.kind === 'write_disabled') key.current = null;
      setError(classified);
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [markWriteDisabled]);

  const kind = error?.kind;
  return {
    run,
    busy,
    error,
    clearError: useCallback(() => setError(null), []),
    /** Os campos não mudam: o próximo envio tem de ser o mesmo pedido. */
    frozen: kind === 'uncertain' || kind === 'in_progress' || kind === 'registered',
    /** Não há o que reenviar agora. */
    blocked: kind === 'registered' || kind === 'write_disabled',
    canRetrySame: kind === 'uncertain' || kind === 'in_progress',
  };
}
