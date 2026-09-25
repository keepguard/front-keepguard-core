import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  FileText,
  LoaderCircle,
  Sparkles,
} from 'lucide-react';
import { PixQr } from './PixQr';
import { InvoiceDetailModal } from './InvoiceDetailModal';
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
import { getPlanQuotas, type PlanQuotaDTO } from '../../services/analystService';
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

const INTERVAL_MONTHS: Record<string, number> = {
  month: 1,
  quarter: 3,
  semiannual: 6,
  year: 12,
};

function monthsOf(interval: string): number {
  return INTERVAL_MONTHS[interval] ?? 1;
}

function monthlyEquivalentCents(price: BillingPlanPrice): number {
  return Math.round(price.amountCents / monthsOf(price.interval));
}

/** Quanto o ciclo longo economiza contra 12x o mensal do mesmo plano. */
function savingsPercent(plan: BillingPlan, interval: string): number {
  if (interval === 'month') return 0;
  const monthly = plan.prices.find((price) => price.interval === 'month');
  const target = plan.prices.find((price) => price.interval === interval);
  if (!monthly || !target || monthly.amountCents <= 0) return 0;
  const full = monthly.amountCents * monthsOf(interval);
  if (target.amountCents >= full) return 0;
  return Math.round(((full - target.amountCents) / full) * 100);
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

function invoiceStatusBadgeClass(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'paid':
      return 'billing-status-badge is-paid';
    case 'pending':
      return 'billing-status-badge is-pending';
    case 'overdue':
      return 'billing-status-badge is-overdue';
    case 'refunded':
      return 'billing-status-badge is-refunded';
    case 'canceled':
      return 'billing-status-badge is-canceled';
    default:
      return 'billing-status-badge';
  }
}

function paymentMethodLabel(method?: string | null): string {
  switch ((method || '').toLowerCase()) {
    case 'pix':
      return 'PIX';
    case 'boleto':
      return 'Boleto';
    case 'credit_card':
    case 'creditcard':
      return 'Cartão';
    case 'manual':
      return 'Manual';
    default:
      return method ? method.toUpperCase() : '—';
  }
}

/**
 * Vitrine só vende plano contratável. Vitalício/VIP (nível 999) é concedido pelo
 * admin em /admin/billing via grant-lifetime — nunca escolhido pelo usuário.
 */
function isSellablePlan(plan: BillingPlan): boolean {
  if (!plan.enabled) return false;
  if (plan.isLifetime) return false;
  if ((plan.code || '').toUpperCase() === 'VIP') return false;
  if ((plan.level ?? 0) >= 999) return false;
  return plan.prices.length > 0;
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
    message = 'Modo Degustação (Freemium): faça o upgrade para expandir sua capacidade de acompanhamento e desbloquear recursos avançados.';
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
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'boleto'>('pix');
  const [detailInvoice, setDetailInvoice] = useState<BillingInvoice | null>(null);
  const [quotas, setQuotas] = useState<Record<string, PlanQuotaDTO>>({});
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

  /**
   * Cotas de carteira por plano vivem no bff-invest e são o que diferencia um
   * plano do outro na vitrine. Falha aqui não pode derrubar a contratação: sem
   * cota, o card apenas não mostra a linha de capacidade.
   */
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    getPlanQuotas()
      .then((list) => {
        if (!active) return;
        const map: Record<string, PlanQuotaDTO> = {};
        list.forEach((quota) => {
          if (quota.planCode) map[quota.planCode] = quota;
        });
        setQuotas(map);
      })
      .catch(() => {
        if (active) setQuotas({});
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  const sellablePlans = useMemo(
    () => plans.filter(isSellablePlan).sort((a, b) => (a.level ?? 0) - (b.level ?? 0)),
    [plans],
  );

  const selectedPlan = useMemo(
    () => sellablePlans.find((item) => item.code === planCode) || sellablePlans[0],
    [sellablePlans, planCode],
  );

  useEffect(() => {
    if (!planCode && selectedPlan) {
      setPlanCode(selectedPlan.code);
    }
  }, [planCode, selectedPlan]);

  /**
   * Cada plano tem seu próprio conjunto de ciclos. Ao trocar de plano, um ciclo
   * que o plano novo não oferece deixaria o preço sem correspondência — daí o
   * valor sumir da tela. Cai para o primeiro ciclo disponível do plano novo.
   */
  useEffect(() => {
    const available = selectedPlan?.prices ?? [];
    if (available.length === 0) return;
    if (available.some((price) => price.interval === interval)) return;
    setInterval(available[0].interval);
  }, [selectedPlan, interval]);

  /** Só os ciclos que ao menos um plano vendável oferece, na ordem canônica. */
  const cycleOptions = useMemo(
    () => INTERVALS.filter((item) => sellablePlans.some(
      (plan) => plan.prices.some((price) => price.interval === item.value),
    )),
    [sellablePlans],
  );

  const topLevel = useMemo(
    () => sellablePlans.reduce((max, plan) => Math.max(max, plan.level ?? 0), 0),
    [sellablePlans],
  );

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
  /**
   * A assinatura nasce com currentPeriodEnd preenchido no ms-billing antes de
   * qualquer liquidação. Quem confirma o pagamento é o entitlement (webhook do
   * PSP) ou uma fatura paga — só aí a vigência é real.
   */
  const paymentConfirmed = Boolean(entitlement?.allowsProduct)
    || invoices.some((item) => item.status === 'paid' && item.subscriptionId === subscription?.id);
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
      } = {
        planCode,
        interval,
        paymentMethod,
      };
      if (!hasCpf) {
        payload.payerCpfCnpj = cpfDigitsOf(cpfDigits);
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
        <section className="hpanel-table-card billing-card billing-situation">
          <div className="billing-situation-main">
            <p className="billing-kicker">Situação</p>
            <p className="billing-situation-title">{situation.title}</p>
            <p className="table-cell-muted">{situation.detail}</p>
          </div>
          <span className={`billing-status-pill ${entitlement?.allowsProduct ? 'is-ok' : 'is-standby'}`}>
            {entitlement?.allowsProduct ? 'Produto liberado' : 'Produto bloqueado'}
          </span>
        </section>
      )}

      <section className={`hpanel-table-card billing-card${subscription ? ' billing-sub' : ' billing-store-card'}`}>
        <h2>{subscription ? 'Minha assinatura' : 'Escolha seu plano'}</h2>
        {subscription ? (
          <div className="billing-sub-row">
            <div>
              <p className="billing-sub-title">
                {checkoutPlanName || subscription.planCode}
                <span className="billing-sub-meta">
                  {' '}· {intervalLabel(subscription.interval)} · {subscription.paymentMethod.toUpperCase()}
                </span>
              </p>
              {paymentConfirmed ? (
                <p className="table-cell-muted">Vigência até {formatDate(subscription.currentPeriodEnd)}</p>
              ) : (
                <p className="table-cell-muted">Vigência definida após a confirmação do pagamento.</p>
              )}
            </div>
            {subscription.status !== 'canceled' && (
              <button type="button" className="btn btn-outline btn-pill" disabled={busy} onClick={() => void cancelMine()}>
                Cancelar
              </button>
            )}
          </div>
        ) : (
          <form className="billing-store" onSubmit={subscribe}>
            {sellablePlans.length === 0 ? (
              <p className="table-cell-muted">Nenhum plano disponível para contratação no momento.</p>
            ) : (
              <>
                {/* 1. Ciclo de cobrança */}
                {cycleOptions.length > 1 && (
                  <div className="billing-cycle-switch" role="group" aria-label="Ciclo de cobrança">
                    {cycleOptions.map((option) => {
                      const bestSaving = sellablePlans.reduce(
                        (max, plan) => Math.max(max, savingsPercent(plan, option.value)),
                        0,
                      );
                      const active = interval === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`billing-cycle-chip${active ? ' is-active' : ''}`}
                          aria-pressed={active}
                          disabled={busy}
                          onClick={() => setInterval(option.value)}
                        >
                          {option.label}
                          {bestSaving > 0 ? (
                            <span className="billing-cycle-save">-{bestSaving}%</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 2. Cards de plano */}
                <div className="billing-plan-grid">
                  {sellablePlans.map((plan) => {
                    const price = plan.prices.find((item) => item.interval === interval);
                    const quota = quotas[plan.code];
                    const selected = plan.code === planCode;
                    const featured = sellablePlans.length > 1 && (plan.level ?? 0) === topLevel;
                    const saving = savingsPercent(plan, interval);
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        className={[
                          'billing-plan-card',
                          selected ? 'is-selected' : '',
                          featured ? 'is-featured' : '',
                          price ? '' : 'is-unavailable',
                        ].filter(Boolean).join(' ')}
                        aria-pressed={selected}
                        disabled={busy || !price}
                        onClick={() => setPlanCode(plan.code)}
                      >
                        <span className="billing-plan-card-top">
                          <span className="billing-plan-level">Nível {plan.level ?? 0}</span>
                          {featured ? (
                            <span className="billing-plan-flag">
                              <Sparkles size={11} aria-hidden />
                              Mais completo
                            </span>
                          ) : null}
                        </span>

                        <span className="billing-plan-name">{plan.name}</span>

                        {price ? (
                          <span className="billing-plan-price">
                            <span className="billing-plan-price-val">
                              {formatMoney(monthlyEquivalentCents(price), price.currency)}
                            </span>
                            <span className="billing-plan-price-unit">/mês</span>
                          </span>
                        ) : (
                          <span className="billing-plan-price-off">Sem {intervalLabel(interval).toLowerCase()}</span>
                        )}

                        {price && interval !== 'month' ? (
                          <span className="billing-plan-price-total">
                            {formatMoney(price.amountCents, price.currency)} a cada {monthsOf(interval)} meses
                            {saving > 0 ? ` · economia de ${saving}%` : ''}
                          </span>
                        ) : null}

                        {quota ? (
                          <span className="billing-plan-quotas">
                            <span className="billing-plan-quota-pill">
                              <strong>{quota.watchlistSlots}</strong> ativos
                            </span>
                            <span className="billing-plan-quota-pill is-picks">
                              <strong>{quota.watchlistPicks}</strong> de livre escolha
                            </span>
                          </span>
                        ) : null}

                        {planBenefit(plan) ? (
                          <span className="billing-plan-trial">{planBenefit(plan)}</span>
                        ) : null}

                        <span className="billing-plan-pick">
                          {selected ? (
                            <>
                              <Check size={14} aria-hidden />
                              Selecionado
                            </>
                          ) : (
                            'Escolher este plano'
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 3. Fechamento do pedido */}
                <div className="billing-checkout-panel">
                  <div className="billing-checkout-resume">
                    <p className="billing-kicker">Resumo</p>
                    <p className="billing-checkout-plan">
                      {selectedPlan?.name || 'Selecione um plano'}
                      <span className="billing-sub-meta"> · {intervalLabel(interval)}</span>
                    </p>
                    {selectedPrice ? (
                      <p className="billing-checkout-total">
                        {formatMoney(selectedPrice.amountCents, selectedPrice.currency)}
                        <span className="billing-checkout-total-unit"> por ciclo</span>
                      </p>
                    ) : null}
                  </div>

                  <div className="billing-checkout-form">
                    <div className="billing-field-block">
                      <span className="billing-label-title" id="billing-method-label">Pagamento</span>
                      <div className="billing-method-switch" role="group" aria-labelledby="billing-method-label">
                        {(['pix', 'boleto'] as const).map((method) => (
                          <button
                            key={method}
                            type="button"
                            className={`billing-method-chip${paymentMethod === method ? ' is-active' : ''}`}
                            aria-pressed={paymentMethod === method}
                            disabled={busy}
                            onClick={() => setPaymentMethod(method)}
                          >
                            {method === 'pix' ? 'PIX' : 'Boleto'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="billing-field-block">
                      <label htmlFor="billing-cpf-input" className="billing-label-title">
                        CPF
                        {!hasCpf && <span className="billing-required-tag">Obrigatório</span>}
                      </label>
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

                  <button
                    className="btn btn-primary btn-pill billing-submit-btn"
                    type="submit"
                    disabled={
                      busy
                      || !planCode
                      || !selectedPrice
                      || (!hasCpf && (!cpfDigits || !isValidCpf(cpfDigits)))
                    }
                  >
                    <CreditCard size={15} />
                    {busy ? 'Processando…' : 'Assinar'}
                  </button>

                  <p className="billing-checkout-footnote">
                    O acesso libera assim que o pagamento for confirmado pelo banco.
                  </p>
                </div>
              </>
            )}
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
                    <td>
                      <span className={invoiceStatusBadgeClass(invoice.status)}>
                        {invoiceStatusLabel(invoice.status)}
                      </span>
                    </td>
                    <td>{paymentMethodLabel(invoice.paymentMethod)}</td>
                    <td>
                      <div className="billing-table-actions">
                        <button
                          type="button"
                          className="btn-table-icon"
                          title="Ver detalhes da fatura"
                          aria-label="Ver detalhes da fatura"
                          onClick={() => setDetailInvoice(invoice)}
                        >
                          <Eye size={15} />
                        </button>
                        {invoice.pixPayload && (invoice.status === 'pending' || invoice.status === 'overdue') ? (
                          <button
                            type="button"
                            className="btn-table-icon"
                            title="Copiar código PIX"
                            aria-label="Copiar código PIX"
                            onClick={() => void copyPix(invoice.pixPayload || '')}
                          >
                            <Copy size={15} />
                          </button>
                        ) : null}
                        {invoice.bankSlipUrl ? (
                          <a
                            className="btn-table-icon"
                            href={invoice.bankSlipUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir boleto"
                            aria-label="Abrir boleto"
                          >
                            <ExternalLink size={15} />
                          </a>
                        ) : null}
                        {invoice.nfUrl ? (
                          <a
                            className="btn-table-icon"
                            href={invoice.nfUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir nota fiscal"
                            aria-label="Abrir nota fiscal"
                          >
                            <FileText size={15} />
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <InvoiceDetailModal
        isOpen={detailInvoice !== null}
        onClose={() => setDetailInvoice(null)}
        invoice={detailInvoice}
      />
    </div>
  );
};
