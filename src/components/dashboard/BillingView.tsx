import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, CreditCard, ExternalLink, LoaderCircle } from 'lucide-react';
import { PixQr } from './PixQr';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  cancelBillingSubscription,
  createBillingSubscription,
  getBillingEntitlement,
  getBillingSubscription,
  listBillingInvoices,
  listBillingPlans,
  notifyBillingEntitlement,
  onBillingEntitlement,
  type BillingEntitlement,
  type BillingInvoice,
  type BillingPlan,
  type BillingPlanPrice,
  type BillingSubscription,
} from '../../services/billingService';
import { authService } from '../../services/authService';
import { PATHS } from '../../navigation/routes';
import {
  assertBillingVisibility,
  canSeeBillingStorefront,
} from '../../utils/roles';

const visibilityFailures = assertBillingVisibility();
if (visibilityFailures.length > 0 && import.meta.env.DEV) {
  console.warn('billing visibility:', visibilityFailures);
}

const INTERVALS = [
  { value: 'month', label: 'Mensal' },
  { value: 'quarter', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'year', label: 'Anual' },
] as const;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Não foi possível concluir a operação.';
}

function apiErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const data = (error as { data?: { error?: string } }).data;
  return (data?.error || '').trim();
}

function cpfDigitsOf(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11);
}

function formatCpfMask(digits: string): string {
  const d = cpfDigitsOf(digits);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function isValidCpf(digits: string): boolean {
  const d = cpfDigitsOf(digits);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(d[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return (rest === 10 ? 0 : rest) === Number(d[len]);
  };
  return check(9) && check(10);
}

function maskedCpfLast4(last4?: string): string {
  const tail = (last4 || '').replace(/\D/g, '').slice(-4);
  return tail.length === 4 ? `***.***.***-${tail}` : '***.***.***-****';
}

function formatMoney(cents: number, currency = 'BRL'): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: currency || 'BRL' });
}

function intervalLabel(value?: string | null): string {
  return INTERVALS.find((item) => item.value === value)?.label || value || '—';
}

function planBenefit(plan: BillingPlan): string {
  return plan.trialDays > 0 ? `${plan.trialDays} dias de avaliação` : '';
}

function entitlementLabel(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'trial':
      return 'Período de avaliação';
    case 'active':
      return 'Ativo';
    case 'grace':
      return 'Em carência';
    case 'restricted':
      return 'Restrito';
    case 'canceled':
      return 'Cancelado';
    default:
      return 'Sem assinatura';
  }
}

/** PENDING nunca é “Pago”. PAYMENT_CREATED no PSP vira invoice pending. */
function invoiceStatusLabel(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'paid':
      return 'Pago';
    case 'pending':
      return 'Aguardando pagamento';
    case 'overdue':
      return 'Vencida';
    case 'refunded':
      return 'Estornada';
    case 'canceled':
      return 'Cancelada';
    default:
      return status || '—';
  }
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const BillingEntitlementBanner: React.FC = () => {
  const { isAuthenticated, getAccessToken, user } = useAuth();
  const [entitlement, setEntitlement] = useState<BillingEntitlement | null>(null);
  const location = useLocation();
  const token = getAccessToken();
  const showStorefront = canSeeBillingStorefront(token, user?.roles);

  const fetchEntitlement = useCallback(() => {
    const access = getAccessToken();
    if (!isAuthenticated || !access || !showStorefront) {
      setEntitlement(null);
      return;
    }
    getBillingEntitlement(access)
      .then((data) => setEntitlement(data))
      .catch(() => setEntitlement(null));
  }, [isAuthenticated, getAccessToken, showStorefront]);

  useEffect(() => {
    fetchEntitlement();
  }, [fetchEntitlement, user?.id]);

  useEffect(() => {
    return onBillingEntitlement((next) => {
      setEntitlement(next);
    });
  }, []);

  useEffect(() => {
    const status = (entitlement?.status || '').toLowerCase();
    if (status !== 'active' && status !== 'trial') {
      fetchEntitlement();
    }
  }, [location.pathname, fetchEntitlement]);

  useEffect(() => {
    const handleFocus = () => {
      const status = (entitlement?.status || '').toLowerCase();
      if (status !== 'active' && status !== 'trial') {
        fetchEntitlement();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchEntitlement, entitlement?.status]);

  if (!showStorefront || !entitlement) return null;

  const status = (entitlement.status || '').toLowerCase();
  if (status === 'active' || status === 'trial' || entitlement.allowsProduct) return null;

  const grace = status === 'grace';
  const isFreemium = status === 'none' || status === '';

  let message = 'Assine um plano para continuar. O collector da organização segue rodando.';
  if (grace) {
    message = `Assinatura em carência até ${formatDate(entitlement.graceEndsAt)}. Regularize o pagamento para manter o produto.`;
  } else if (isFreemium) {
    message = 'Modo Degustação (Freemium): você pode acompanhar até 2 ativos simultaneamente. Assine um plano para liberar ativos ilimitados.';
  }

  const bannerClass = grace ? 'is-grace' : (isFreemium ? 'is-freemium' : 'is-restricted');

  return (
    <div className={`billing-banner ${bannerClass}`} role="status">
      <AlertTriangle size={16} />
      <span>{message}</span>
      <Link className="link-btn" to={PATHS.billing}>
        Ir para planos
      </Link>
    </div>
  );
};

function situationCopy(
  entitlement: BillingEntitlement | null,
  subscription: BillingSubscription | null,
  pending: BillingInvoice | null,
): { title: string; detail: string } {
  if (pending) {
    return {
      title: 'Aguardando pagamento',
      detail: 'O acesso só libera quando o pagamento for confirmado.',
    };
  }
  const status = (entitlement?.status || '').toLowerCase();
  if (status && status !== 'none') {
    return {
      title: `${entitlementLabel(entitlement?.status)}${entitlement?.planCode ? ` · ${entitlement.planCode}` : ''}${entitlement?.interval ? ` · ${intervalLabel(entitlement.interval)}` : ''}`,
      detail: `Produto ${entitlement?.allowsProduct ? 'liberado' : 'não liberado'}.`,
    };
  }
  if (subscription && subscription.status !== 'canceled') {
    return {
      title: 'Assinatura criada',
      detail: 'Pagamento ainda não confirmado. O produto libera depois do PIX ou boleto liquidado.',
    };
  }
  return {
    title: 'Sem assinatura',
    detail: 'Escolha um plano para gerar o PIX ou o boleto.',
  };
}

function maskPixCode(payload: string): string {
  if (payload.length <= 28) return payload;
  return `${payload.slice(0, 18)}…${payload.slice(-6)}`;
}

const SubscriberCheckout: React.FC<{
  invoice: BillingInvoice | null;
  waiting: boolean;
  planName?: string;
  onCopyPix: (payload: string) => Promise<void> | void;
}> = ({ invoice, waiting, planName, onCopyPix }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async (payload: string) => {
    try {
      await onCopyPix(payload);
      setCopied(true);
    } catch {
      /* erro já tratado pelo pai */
    }
  };

  if (waiting && !invoice?.pixPayload && !invoice?.bankSlipUrl) {
    return (
      <section className="hpanel-table-card billing-card billing-checkout" aria-busy="true" aria-live="polite">
        <header className="billing-checkout-head">
          <div>
            <p className="billing-kicker">Pagamento</p>
            <h2>Preparando o PIX</h2>
          </div>
          <span className="billing-status-pill is-pending">Gerando cobrança</span>
        </header>
        <div className="billing-checkout-body">
          <div className="billing-qr-frame is-loading">
            <LoaderCircle className="billing-qr-spinner" size={28} aria-hidden />
          </div>
          <div className="billing-checkout-actions">
            <p className="billing-checkout-hint">Isso costuma levar poucos segundos.</p>
          </div>
        </div>
      </section>
    );
  }
  if (!invoice || (invoice.status !== 'pending' && invoice.status !== 'overdue')) {
    return null;
  }
  const pix = invoice.paymentMethod === 'pix';
  const overdue = invoice.status === 'overdue';

  return (
    <section className="hpanel-table-card billing-card billing-checkout">
      <header className="billing-checkout-head">
        <div>
          <p className="billing-kicker">{pix ? 'PIX' : 'Boleto'}{planName ? ` · ${planName}` : ''}</p>
          <h2>{pix ? 'Pague com PIX' : 'Pague o boleto'}</h2>
        </div>
        <span className={`billing-status-pill ${overdue ? 'is-overdue' : 'is-pending'}`}>
          {invoiceStatusLabel(invoice.status)}
        </span>
      </header>

      <p className="billing-checkout-amount">{formatMoney(invoice.amountCents, invoice.currency)}</p>
      <p className="billing-checkout-due">Vencimento {formatDate(invoice.dueAt)}</p>

      <div className="billing-checkout-body">
        {pix && invoice.pixPayload ? (
          <div className="billing-qr-frame">
            <PixQr payload={invoice.pixPayload} />
          </div>
        ) : null}

        <div className="billing-checkout-actions">
          {pix && invoice.pixPayload ? (
            <>
              <p className="billing-checkout-hint">Abra o app do banco, leia o QR ou copie o código.</p>
              <p className="billing-pix-preview" title="Use o botão para copiar o código completo">
                {maskPixCode(invoice.pixPayload)}
              </p>
              <button
                type="button"
                className="btn btn-primary btn-pill billing-checkout-cta"
                onClick={() => void copy(invoice.pixPayload!)}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Código copiado' : 'Copiar código PIX'}
              </button>
              <details className="billing-pix-details">
                <summary>Ver código copia e cola</summary>
                <p className="billing-pix-full">{invoice.pixPayload}</p>
              </details>
            </>
          ) : null}
          {invoice.bankSlipUrl ? (
            <a className="btn btn-primary btn-pill billing-checkout-cta" href={invoice.bankSlipUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Abrir boleto
            </a>
          ) : null}
          <p className="billing-checkout-footnote">Esta tela atualiza sozinha quando o pagamento for confirmado.</p>
        </div>
      </div>
    </section>
  );
};

export const BillingPlansView: React.FC = () => {
  const { isAuthenticated, getAccessToken, user } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entitlement, setEntitlement] = useState<BillingEntitlement | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [planCode, setPlanCode] = useState('');
  const [interval, setInterval] = useState('month');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'boleto' | 'credit_card'>('pix');
  const [creditCardToken, setCreditCardToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [justSubscribed, setJustSubscribed] = useState(false);
  const [hasCpf, setHasCpf] = useState(false);
  const [cpfLast4, setCpfLast4] = useState('');
  const [cpfDigits, setCpfDigits] = useState('');
  const [cpfError, setCpfError] = useState('');
  const cpfInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (opts?: { silent?: boolean; pollOnly?: boolean }) => {
    const access = getAccessToken();
    if (!access) return;
    if (!opts?.silent) setLoading(true);
    try {
      if (opts?.pollOnly) {
        const [nextEntitlement, nextSubscription, nextInvoices] = await Promise.all([
          getBillingEntitlement(access),
          getBillingSubscription(access),
          listBillingInvoices(access, user?.id || user?.codeUser),
        ]);
        setEntitlement(nextEntitlement);
        notifyBillingEntitlement(nextEntitlement);
        setSubscription(nextSubscription);
        setInvoices(nextInvoices);
      } else {
        const [nextEntitlement, nextPlans, nextSubscription, nextInvoices, me] = await Promise.all([
          getBillingEntitlement(access),
          listBillingPlans(access),
          getBillingSubscription(access),
          listBillingInvoices(access, user?.id || user?.codeUser),
          authService.getMe(access).catch(() => null),
        ]);
        setEntitlement(nextEntitlement);
        notifyBillingEntitlement(nextEntitlement);
        setPlans(nextPlans);
        setSubscription(nextSubscription);
        setInvoices(nextInvoices);
        const profile = me?.personProfile;
        const nextHasCpf = Boolean(profile?.hasCpf);
        setHasCpf(nextHasCpf);
        setCpfLast4(profile?.cpfLast4 || '');
        if (nextHasCpf) {
          setCpfDigits('');
          setCpfError('');
        }
      }
    } catch (error) {
      addToast({ type: 'error', title: 'Billing', description: errorMessage(error) });
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [addToast, getAccessToken, user?.codeUser, user?.id]);

  useEffect(() => {
    if (isAuthenticated) {
      void load();
    }
  }, [isAuthenticated, load]);

  const selectedPlan = useMemo(
    () => plans.find((item) => item.code === planCode && item.enabled) || plans.find((item) => item.enabled),
    [plans, planCode],
  );

  useEffect(() => {
    if (!planCode && selectedPlan) {
      setPlanCode(selectedPlan.code);
    }
  }, [planCode, selectedPlan]);

  const pendingInvoice = useMemo(() => {
    const open = invoices.filter((item) => item.status === 'pending' || item.status === 'overdue');
    return open.sort((a, b) => Date.parse(b.issuedAt || '') - Date.parse(a.issuedAt || ''))[0] ?? null;
  }, [invoices]);

  const hasInstrument = Boolean(pendingInvoice?.pixPayload || pendingInvoice?.bankSlipUrl);

  useEffect(() => {
    if (hasInstrument) setJustSubscribed(false);
  }, [hasInstrument]);

  useEffect(() => {
    const waitingForInvoice = justSubscribed && !pendingInvoice;
    const waitingForInstrument = Boolean(pendingInvoice && !hasInstrument);
    const waitingForPaid = Boolean(pendingInvoice && hasInstrument && pendingInvoice.status === 'pending');
    if (!waitingForInvoice && !waitingForInstrument && !waitingForPaid) return;
    const ms = waitingForPaid ? 10_000 : 3_000;
    const max = waitingForPaid ? 300_000 : 45_000;
    const started = Date.now();
    const id = window.setInterval(() => {
      if (Date.now() - started > max) {
        window.clearInterval(id);
        setJustSubscribed(false);
        return;
      }
      void load({ silent: true, pollOnly: true });
    }, ms);
    return () => window.clearInterval(id);
  }, [justSubscribed, pendingInvoice?.id, pendingInvoice?.status, hasInstrument, load]);

  const selectedPrice = selectedPlan?.prices.find((price) => price.interval === interval);
  const situation = situationCopy(entitlement, subscription, pendingInvoice);
  const waitingCheckout = justSubscribed || Boolean(pendingInvoice && !hasInstrument);
  const checkoutPlanName = plans.find((plan) => plan.code === subscription?.planCode)?.name
    || subscription?.planCode
    || selectedPlan?.name;

  const cpfMissing = !hasCpf && !cpfDigits;
  const cpfIncomplete = !hasCpf && cpfDigits.length > 0 && cpfDigits.length < 11;
  const cpfMathInvalid = !hasCpf && cpfDigits.length === 11 && !isValidCpf(cpfDigits);
  const cpfIsInvalid = Boolean(cpfError) || cpfMissing || cpfIncomplete || cpfMathInvalid;

  const cpfDisplayError = useMemo(() => {
    if (hasCpf) return '';
    if (cpfError) return cpfError;
    if (cpfMissing) return 'Campo obrigatório para emitir a assinatura.';
    if (cpfIncomplete) return 'Informe o CPF completo (11 dígitos).';
    if (cpfMathInvalid) return 'CPF inválido. Verifique os dígitos.';
    return '';
  }, [hasCpf, cpfError, cpfMissing, cpfIncomplete, cpfMathInvalid]);

  const cpfAriaDescribedBy = hasCpf
    ? undefined
    : cpfDisplayError
      ? 'billing-cpf-error'
      : 'billing-cpf-hint';

  const subscribe = async (event: React.FormEvent) => {
    event.preventDefault();
    const access = getAccessToken();
    if (!access || !planCode) return;
    if (!hasCpf) {
      if (!cpfDigits) {
        setCpfError('O CPF é obrigatório para realizar a assinatura.');
        cpfInputRef.current?.focus();
        return;
      }
      if (!isValidCpf(cpfDigits)) {
        setCpfError('Informe um CPF válido.');
        cpfInputRef.current?.focus();
        return;
      }
    }
    setBusy(true);
    setCpfError('');
    try {
      const payload: {
        planCode: string;
        interval: string;
        paymentMethod: string;
        payerCpfCnpj?: string;
        creditCardToken?: string;
      } = {
        planCode,
        interval,
        paymentMethod,
      };
      if (!hasCpf) {
        payload.payerCpfCnpj = cpfDigitsOf(cpfDigits);
      }
      if (paymentMethod === 'credit_card') {
        const tokenCard = creditCardToken.trim();
        if (!tokenCard) {
          addToast({ type: 'error', title: 'Cartão', description: 'Informe o token do cartão gerado no Asaas.' });
          setBusy(false);
          return;
        }
        payload.creditCardToken = tokenCard;
      }
      const created = await createBillingSubscription(payload, access);
      setSubscription(created);
      setJustSubscribed(true);
      const pendingGateway = created.status === 'pending_gateway';
      addToast({
        type: pendingGateway ? 'info' : 'success',
        title: pendingGateway ? 'Gateway pendente' : 'Assinatura criada',
        description: pendingGateway
          ? 'A assinatura será reenviada ao Asaas. O produto só libera após o pagamento confirmado.'
          : 'Abra o QR ou copie o código PIX. Gerar a cobrança não confirma o pagamento.',
      });
      await load({ silent: true });
    } catch (error) {
      const code = apiErrorCode(error);
      if (code === 'CPF_ALREADY_EXISTS') {
        setCpfError('Este CPF já está em uso nesta organização.');
      } else if (code === 'PAYER_DOCUMENT_MISSING' || code === 'PAYER_DOCUMENT_INVALID') {
        setCpfError('Informe um CPF válido.');
      } else {
        addToast({ type: 'error', title: 'Assinatura', description: errorMessage(error) });
      }
    } finally {
      setBusy(false);
    }
  };

  const cancelMine = async () => {
    const access = getAccessToken();
    if (!access || !subscription?.id) return;
    setBusy(true);
    try {
      await cancelBillingSubscription(subscription.id, access);
      addToast({ type: 'success', title: 'Assinatura', description: 'Cancelamento solicitado.' });
      await load();
    } catch (error) {
      addToast({ type: 'error', title: 'Cancelar', description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const copyPix = async (payload: string) => {
    try {
      await navigator.clipboard.writeText(payload);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'PIX',
        description: 'Não foi possível copiar. Abra o código copia e cola e copie manualmente.',
      });
      throw error;
    }
  };

  if (loading) {
    return <p className="text-muted">Carregando billing…</p>;
  }

  return (
    <div className="billing-page">
      <SubscriberCheckout
        invoice={pendingInvoice}
        waiting={waitingCheckout}
        planName={checkoutPlanName}
        onCopyPix={copyPix}
      />

      {!pendingInvoice && (
        <section className="hpanel-table-card billing-card">
          <h2>Situação</h2>
          <p>{situation.title}</p>
          <p className="table-cell-muted">{situation.detail}</p>
        </section>
      )}

      <section className="hpanel-table-card billing-card billing-sub">
        <h2>Minha assinatura</h2>
        {subscription ? (
          <div className="billing-sub-row">
            <div>
              <p className="billing-sub-title">
                {checkoutPlanName || subscription.planCode}
                <span className="billing-sub-meta">
                  {' '}· {intervalLabel(subscription.interval)} · {subscription.paymentMethod.toUpperCase()}
                </span>
              </p>
              <p className="table-cell-muted">Vigência até {formatDate(subscription.currentPeriodEnd)}</p>
            </div>
            {subscription.status !== 'canceled' && (
              <button type="button" className="btn btn-outline btn-pill" disabled={busy} onClick={() => void cancelMine()}>
                Cancelar
              </button>
            )}
          </div>
        ) : (
          <form className="billing-form" onSubmit={subscribe}>
            {/* 1. Plano */}
            <div className="billing-form-row">
              <label htmlFor="billing-plan-select" className="billing-label-title">
                Plano
              </label>
              <div className="billing-field-content">
                <select
                  id="billing-plan-select"
                  className="form-input"
                  value={planCode}
                  disabled={busy}
                  onChange={(event) => setPlanCode(event.target.value)}
                  required
                >
                  <option value="">Selecione</option>
                  {plans.filter((plan) => plan.enabled).map((plan) => (
                    <option key={plan.id} value={plan.code}>
                      {plan.name}{planBenefit(plan) ? ` — ${planBenefit(plan)}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 2. Ciclo */}
            <div className="billing-form-row">
              <label htmlFor="billing-interval-select" className="billing-label-title">
                Ciclo
              </label>
              <div className="billing-field-content">
                <select
                  id="billing-interval-select"
                  className="form-input"
                  value={interval}
                  disabled={busy}
                  onChange={(event) => setInterval(event.target.value)}
                >
                  {(selectedPlan?.prices.length ? selectedPlan.prices : INTERVALS.map((item) => ({ interval: item.value } as BillingPlanPrice))).map((price) => (
                    <option key={price.interval} value={price.interval}>
                      {intervalLabel(price.interval)}
                      {'amountCents' in price && price.amountCents ? ` · ${formatMoney(price.amountCents, price.currency)}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 3. Pagamento */}
            <div className="billing-form-row">
              <label htmlFor="billing-payment-method" className="billing-label-title">
                Pagamento
              </label>
              <div className="billing-field-content">
                <select
                  id="billing-payment-method"
                  className="form-input"
                  value={paymentMethod}
                  disabled={busy}
                  onChange={(event) => setPaymentMethod(event.target.value as 'pix' | 'boleto' | 'credit_card')}
                >
                  <option value="pix">PIX</option>
                  <option value="boleto">Boleto</option>
                  <option value="credit_card">Cartão</option>
                </select>
              </div>
            </div>

            {/* Se cartão: Token do cartão */}
            {paymentMethod === 'credit_card' ? (
              <div className="billing-form-row">
                <label htmlFor="billing-credit-card-token" className="billing-label-title">
                  Token do cartão
                  <span className="billing-required-tag">Obrigatório</span>
                </label>
                <div className="billing-field-content">
                  <input
                    id="billing-credit-card-token"
                    className="form-input"
                    value={creditCardToken}
                    onChange={(event) => setCreditCardToken(event.target.value)}
                    required
                    disabled={busy}
                    autoComplete="off"
                    placeholder="Token Asaas (sem PAN)"
                    aria-describedby="billing-card-token-hint"
                  />
                  <span id="billing-card-token-hint" className="billing-cpf-hint">
                    Use o SDK/hosted fields Asaas no browser. O KeepGuard não aceita número do cartão.
                  </span>
                </div>
              </div>
            ) : null}

            {/* 4. CPF */}
            <div className="billing-form-row">
              <label htmlFor="billing-cpf-input" className="billing-label-title">
                CPF
                {!hasCpf && <span className="billing-required-tag">Obrigatório</span>}
              </label>
              <div className="billing-field-content">
                <input
                  id="billing-cpf-input"
                  ref={cpfInputRef}
                  className={`form-input${cpfIsInvalid ? ' form-input-error' : ''}`}
                  value={hasCpf ? maskedCpfLast4(cpfLast4) : formatCpfMask(cpfDigits)}
                  onChange={(event) => {
                    setCpfDigits(cpfDigitsOf(event.target.value));
                    if (cpfError) setCpfError('');
                  }}
                  required={!hasCpf}
                  readOnly={hasCpf}
                  disabled={busy || hasCpf}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-readonly={hasCpf || undefined}
                  aria-required={!hasCpf}
                  aria-invalid={cpfIsInvalid ? true : undefined}
                  aria-describedby={cpfAriaDescribedBy}
                  placeholder="000.000.000-00"
                />
                <div className="billing-field-feedback">
                  {hasCpf ? (
                    <span className="billing-cpf-hint">CPF cadastrado no perfil.</span>
                  ) : cpfDisplayError ? (
                    <span id="billing-cpf-error" className="billing-field-error" role="alert">
                      {cpfDisplayError}
                    </span>
                  ) : (
                    <span id="billing-cpf-hint" className="billing-cpf-hint">
                      O Asaas usa o CPF do pagador no PIX e no boleto.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 5. Valor do ciclo */}
            {selectedPrice && (
              <div className="billing-form-row billing-cycle-row">
                <span className="billing-label-title">Valor do ciclo</span>
                <div className="billing-cycle-display">
                  <strong className="billing-cycle-amount">{formatMoney(selectedPrice.amountCents, selectedPrice.currency)}</strong>
                  {selectedPlan && planBenefit(selectedPlan) ? (
                    <span className="billing-benefit-tag">{planBenefit(selectedPlan)}</span>
                  ) : null}
                </div>
              </div>
            )}

            {/* 6. Botão assinatura */}
            <div className="billing-form-row billing-action-row">
              <div className="billing-action-spacer" aria-hidden="true" />
              <div className="billing-action-btn-wrap">
                <button
                  className="btn btn-primary btn-pill billing-submit-btn"
                  type="submit"
                  disabled={
                    busy
                    || !planCode
                    || (!hasCpf && (!cpfDigits || !isValidCpf(cpfDigits)))
                    || (paymentMethod === 'credit_card' && !creditCardToken.trim())
                  }
                >
                  <CreditCard size={15} />
                  {busy ? 'Processando…' : 'Assinar'}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>

      <section className="hpanel-table-card billing-card">
        <h2>Minhas faturas</h2>
        {invoices.length === 0 ? (
          <p className="table-cell-muted">Nenhuma fatura ainda.</p>
        ) : (
          <div className="table-responsive">
            <table className="hpanel-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Meio</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{formatDate(invoice.issuedAt || invoice.dueAt)}</td>
                    <td>{formatMoney(invoice.amountCents, invoice.currency)}</td>
                    <td>{invoice.status}</td>
                    <td>{(invoice.paymentMethod || '—').toUpperCase()}</td>
                    <td>
                      {invoice.bankSlipUrl ? (
                        <a href={invoice.bankSlipUrl} target="_blank" rel="noreferrer">
                          Boleto
                        </a>
                      ) : null}
                      {invoice.pixPayload && (invoice.status === 'pending' || invoice.status === 'overdue') ? (
                        <button
                          type="button"
                          className="btn btn-outline btn-pill"
                          onClick={() => void copyPix(invoice.pixPayload || '')}
                        >
                          Copiar PIX
                        </button>
                      ) : null}
                      {invoice.nfUrl ? (
                        <a href={invoice.nfUrl} target="_blank" rel="noreferrer">
                          Nota fiscal
                        </a>
                      ) : null}
                      {!invoice.bankSlipUrl && !invoice.pixPayload && !invoice.nfUrl ? '—' : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
