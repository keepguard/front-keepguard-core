import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Copy, CreditCard, ExternalLink, Pencil, Plus } from 'lucide-react';
import { PixQr } from './PixQr';
import { Link } from 'react-router-dom';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  cancelBillingSubscription,
  createBillingSubscription,
  getBillingEntitlement,
  getBillingGatewayAccount,
  getBillingSubscription,
  listBillingInvoices,
  listBillingPlans,
  patchBillingPlan,
  putBillingGatewayAccount,
  saveBillingPlan,
  type BillingEntitlement,
  type BillingGatewayAccount,
  type BillingInvoice,
  type BillingPlan,
  type BillingPlanPrice,
  type BillingSubscription,
  type SaveBillingPlan,
} from '../../services/billingService';
import { PATHS } from '../../navigation/routes';
import {
  assertBillingVisibility,
  canSeeBillingStorefront,
  canWriteBilling,
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

function formatMoney(cents: number, currency = 'BRL'): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: currency || 'BRL' });
}

function intervalLabel(value?: string | null): string {
  return INTERVALS.find((item) => item.value === value)?.label || value || '—';
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

const EMPTY_PLAN: SaveBillingPlan = {
  code: '',
  name: '',
  enabled: true,
  trialDays: 0,
  prices: [{ interval: 'month', amountCents: 0, currency: 'BRL' }],
};

function InvoiceTable({
  invoices,
  onCopyPix,
}: {
  invoices: BillingInvoice[];
  onCopyPix: (payload: string) => void;
}) {
  return (
    <div className="hpanel-table-card desktop-table-view">
      <table className="hpanel-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Valor</th>
            <th>Método</th>
            <th>Vencimento</th>
            <th>Pagamento</th>
          </tr>
        </thead>
        <tbody>
          {invoices.length === 0 ? (
            <tr>
              <td colSpan={5} className="table-cell-muted">Nenhuma fatura.</td>
            </tr>
          ) : invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td>{invoiceStatusLabel(invoice.status)}</td>
              <td>{formatMoney(invoice.amountCents, invoice.currency)}</td>
              <td>{(invoice.paymentMethod || '—').toUpperCase()}</td>
              <td>{formatDate(invoice.dueAt)}</td>
              <td>
                {invoice.status === 'pending' && invoice.pixPayload && (
                  <button type="button" className="btn btn-outline btn-pill" onClick={() => onCopyPix(invoice.pixPayload!)}>
                    <Copy size={14} /> PIX
                  </button>
                )}
                {invoice.status === 'pending' && invoice.bankSlipUrl && (
                  <a className="link-btn" href={invoice.bankSlipUrl} target="_blank" rel="noreferrer">Boleto</a>
                )}
                {invoice.status === 'paid' ? formatDate(invoice.paidAt) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const BillingEntitlementBanner: React.FC = () => {
  const { isAuthenticated, getAccessToken, user } = useAuth();
  const [entitlement, setEntitlement] = useState<BillingEntitlement | null>(null);
  const token = getAccessToken();
  const showStorefront = canSeeBillingStorefront(token, user?.roles);

  useEffect(() => {
    if (!isAuthenticated || !token || !showStorefront) {
      setEntitlement(null);
      return;
    }
    let cancelled = false;
    getBillingEntitlement(token)
      .then((data) => {
        if (!cancelled) setEntitlement(data);
      })
      .catch(() => {
        if (!cancelled) setEntitlement(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token, showStorefront, user?.id]);

  if (!showStorefront || !entitlement) return null;
  if (entitlement.allowsProduct) return null;
  const status = (entitlement.status || '').toLowerCase();
  if (status === 'active' || status === 'trial') return null;

  const grace = status === 'grace';
  const message = grace
    ? `Assinatura em carência até ${formatDate(entitlement.graceEndsAt)}. Regularize o pagamento para manter o produto.`
    : 'Assine um plano para continuar. O collector da organização segue rodando.';

  return (
    <div className={`billing-banner ${grace ? 'is-grace' : 'is-restricted'}`} role="status">
      <AlertTriangle size={16} />
      <span>{message}</span>
      <Link className="link-btn" to={PATHS.billing}>
        Ir para planos
      </Link>
    </div>
  );
};

export const BillingOrgView: React.FC = () => {
  const { isAuthenticated, getAccessToken, user } = useAuth();
  const writable = canWriteBilling(getAccessToken(), user?.roles);
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [account, setAccount] = useState<BillingGatewayAccount | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [webhookToken, setWebhookToken] = useState('');
  const [planModal, setPlanModal] = useState<SaveBillingPlan | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const token = getAccessToken();

  const load = useCallback(async () => {
    const access = getAccessToken();
    if (!access) return;
    setLoading(true);
    try {
      const [nextPlans, nextInvoices, nextAccount] = await Promise.all([
        listBillingPlans(access),
        listBillingInvoices(access),
        getBillingGatewayAccount(access),
      ]);
      setPlans(nextPlans);
      setInvoices(nextInvoices);
      setAccount(nextAccount);
    } catch (error) {
      addToast({ type: 'error', title: 'Billing', description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [addToast, getAccessToken]);

  useEffect(() => {
    if (isAuthenticated && token) {
      void load();
    }
  }, [isAuthenticated, token, load]);

  const saveCredential = async (event: React.FormEvent) => {
    event.preventDefault();
    const access = getAccessToken();
    if (!access) return;
    setBusy(true);
    try {
      const saved = await putBillingGatewayAccount(apiKey.trim(), webhookToken.trim(), access);
      setAccount(saved);
      setApiKey('');
      setWebhookToken('');
      addToast({ type: 'success', title: 'Credencial salva', description: `Chave mascarada: ${saved.apiKeyMasked}` });
    } catch (error) {
      addToast({ type: 'error', title: 'Credencial', description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const submitPlan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!planModal) return;
    const access = getAccessToken();
    if (!access) return;
    setBusy(true);
    try {
      if (editingCode) {
        await patchBillingPlan(editingCode, planModal, access);
      } else {
        await saveBillingPlan(planModal, access);
      }
      setPlanModal(null);
      setEditingCode(null);
      addToast({ type: 'success', title: 'Plano', description: 'Plano gravado.' });
      await load();
    } catch (error) {
      addToast({ type: 'error', title: 'Plano', description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const copyPix = async (payload: string) => {
    try {
      await navigator.clipboard.writeText(payload);
      addToast({ type: 'success', title: 'PIX', description: 'Código copiado.' });
    } catch {
      addToast({ type: 'error', title: 'PIX', description: 'Não foi possível copiar.' });
    }
  };

  if (loading) {
    return <p className="text-muted">Carregando billing…</p>;
  }

  return (
    <div className="billing-page">
      <section className="hpanel-table-card billing-card">
        <h2>Credencial Asaas da organização</h2>
        {account ? (
          <p>
            Máscara da API key: <strong>{account.apiKeyMasked}</strong>
            {account.webhookConfigured ? ' · webhook configurado' : ' · webhook pendente'}
          </p>
        ) : (
          <p className="table-cell-muted">Nenhuma credencial cadastrada. A chave não volta a ser exibida.</p>
        )}
        {writable && (
          <form className="billing-form" onSubmit={saveCredential}>
            <label>
              API key
              <input
                className="form-input"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                required
              />
            </label>
            <label>
              Webhook token (asaas-access-token)
              <input
                className="form-input"
                type="password"
                autoComplete="off"
                value={webhookToken}
                onChange={(event) => setWebhookToken(event.target.value)}
                required
              />
            </label>
            <button className="btn btn-primary btn-pill" type="submit" disabled={busy}>
              Salvar credencial
            </button>
          </form>
        )}
      </section>

      <section className="hpanel-table-card billing-card">
        <div className="client-system-create-row">
          <h2>Planos da organização</h2>
          {writable && (
            <button
              type="button"
              className="btn btn-primary btn-pill"
              onClick={() => {
                setEditingCode(null);
                setPlanModal({ ...EMPTY_PLAN, prices: [{ interval: 'month', amountCents: 9900, currency: 'BRL' }] });
              }}
            >
              <Plus size={15} />
              <span>Novo plano</span>
            </button>
          )}
        </div>
        <div className="hpanel-table-card desktop-table-view">
          <table className="hpanel-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Status</th>
                <th>Preços</th>
                {writable ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {plans.length === 0 ? (
                <tr>
                  <td colSpan={writable ? 5 : 4} className="table-cell-muted">Nenhum plano.</td>
                </tr>
              ) : plans.map((plan) => (
                <tr key={plan.id}>
                  <td>{plan.code}</td>
                  <td>{plan.name}</td>
                  <td>{plan.enabled ? 'Ativo' : 'Inativo'}</td>
                  <td>
                    {plan.prices.map((price) => `${intervalLabel(price.interval)} ${formatMoney(price.amountCents, price.currency)}`).join(' · ') || '—'}
                  </td>
                  {writable ? (
                    <td>
                      <button
                        type="button"
                        className="btn-table-icon"
                        title="Editar"
                        onClick={() => {
                          setEditingCode(plan.code);
                          setPlanModal({
                            code: plan.code,
                            name: plan.name,
                            enabled: plan.enabled,
                            quotasJson: plan.quotasJson || '',
                            trialDays: plan.trialDays,
                            prices: plan.prices.length ? plan.prices : EMPTY_PLAN.prices,
                          });
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="hpanel-table-card billing-card">
        <h2>Todas as transações</h2>
        <InvoiceTable invoices={invoices} onCopyPix={(payload) => void copyPix(payload)} />
      </section>

      <Modal
        isOpen={planModal !== null}
        onClose={() => { setPlanModal(null); setEditingCode(null); }}
        title={editingCode ? 'Editar plano' : 'Novo plano'}
        footer={(
          <button className="btn btn-primary btn-pill" type="submit" form="billing-plan-form" disabled={busy}>
            Salvar
          </button>
        )}
      >
        {planModal && (
          <form id="billing-plan-form" className="billing-form" onSubmit={submitPlan}>
            <label>
              Código
              <input
                className="form-input"
                value={planModal.code}
                disabled={Boolean(editingCode)}
                onChange={(event) => setPlanModal({ ...planModal, code: event.target.value })}
                required
              />
            </label>
            <label>
              Nome
              <input
                className="form-input"
                value={planModal.name}
                onChange={(event) => setPlanModal({ ...planModal, name: event.target.value })}
                required
              />
            </label>
            <label>
              Trial (dias)
              <input
                className="form-input"
                type="number"
                min={0}
                value={planModal.trialDays}
                onChange={(event) => setPlanModal({ ...planModal, trialDays: Number(event.target.value) || 0 })}
              />
            </label>
            <label className="billing-check">
              <input
                type="checkbox"
                checked={planModal.enabled}
                onChange={(event) => setPlanModal({ ...planModal, enabled: event.target.checked })}
              />
              Ativo
            </label>
            {planModal.prices.map((price, index) => (
              <div key={`${price.interval}-${index}`} className="billing-price-row">
                <select
                  className="form-input"
                  value={price.interval}
                  onChange={(event) => {
                    const prices = [...planModal.prices];
                    prices[index] = { ...price, interval: event.target.value };
                    setPlanModal({ ...planModal, prices });
                  }}
                >
                  {INTERVALS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={(price.amountCents / 100).toString()}
                  onChange={(event) => {
                    const prices = [...planModal.prices];
                    prices[index] = { ...price, amountCents: Math.round(Number(event.target.value) * 100) };
                    setPlanModal({ ...planModal, prices });
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outline btn-pill"
              onClick={() => setPlanModal({
                ...planModal,
                prices: [...planModal.prices, { interval: 'year', amountCents: 0, currency: 'BRL' }],
              })}
            >
              Adicionar ciclo
            </button>
          </form>
        )}
      </Modal>
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
      detail: 'O QR e o código PIX geram a cobrança. O acesso só libera quando o Asaas confirmar o pagamento.',
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

const SubscriberCheckout: React.FC<{
  invoice: BillingInvoice | null;
  waiting: boolean;
  onCopyPix: (payload: string) => void;
}> = ({ invoice, waiting, onCopyPix }) => {
  if (waiting && !invoice?.pixPayload && !invoice?.bankSlipUrl) {
    return (
      <section className="hpanel-table-card billing-card billing-checkout">
        <h2>Pague agora</h2>
        <p className="table-cell-muted">Preparando o PIX… isso costuma levar poucos segundos.</p>
      </section>
    );
  }
  if (!invoice || (invoice.status !== 'pending' && invoice.status !== 'overdue')) {
    return null;
  }
  const pix = invoice.paymentMethod === 'pix';
  return (
    <section className="hpanel-table-card billing-card billing-checkout">
      <h2>{pix ? 'Pague com PIX' : 'Pague o boleto'}</h2>
      <p className="billing-checkout-amount">{formatMoney(invoice.amountCents, invoice.currency)}</p>
      <p className="table-cell-muted">Vencimento {formatDate(invoice.dueAt)}</p>
      {pix && invoice.pixPayload ? (
        <>
          <PixQr payload={invoice.pixPayload} />
          <p className="billing-checkout-hint">Aponte a câmera do banco ou copie o código.</p>
          <textarea
            className="form-input billing-pix-code"
            readOnly
            rows={4}
            value={invoice.pixPayload}
            aria-label="Código PIX copia e cola"
          />
          <button type="button" className="btn btn-primary btn-pill" onClick={() => onCopyPix(invoice.pixPayload!)}>
            <Copy size={15} />
            Copiar código PIX
          </button>
        </>
      ) : null}
      {invoice.bankSlipUrl ? (
        <a className="btn btn-primary btn-pill" href={invoice.bankSlipUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={15} />
          Abrir boleto
        </a>
      ) : null}
      <p className="table-cell-muted">Esta tela atualiza sozinha quando o pagamento for confirmado.</p>
    </section>
  );
};

export const BillingPlansView: React.FC = () => {
  const { isAuthenticated, getAccessToken } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entitlement, setEntitlement] = useState<BillingEntitlement | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [planCode, setPlanCode] = useState('');
  const [interval, setInterval] = useState('month');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'boleto'>('pix');
  const [busy, setBusy] = useState(false);
  const [justSubscribed, setJustSubscribed] = useState(false);

  const token = getAccessToken();

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const access = getAccessToken();
    if (!access) return;
    if (!opts?.silent) setLoading(true);
    try {
      const [nextEntitlement, nextPlans, nextSubscription, nextInvoices] = await Promise.all([
        getBillingEntitlement(access),
        listBillingPlans(access),
        getBillingSubscription(access),
        listBillingInvoices(access),
      ]);
      setEntitlement(nextEntitlement);
      setPlans(nextPlans);
      setSubscription(nextSubscription);
      setInvoices(nextInvoices);
    } catch (error) {
      addToast({ type: 'error', title: 'Billing', description: errorMessage(error) });
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [addToast, getAccessToken]);

  useEffect(() => {
    if (isAuthenticated && token) {
      void load();
    }
  }, [isAuthenticated, token, load]);

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
    const ms = waitingForPaid ? 10_000 : 2_000;
    const max = waitingForPaid ? 180_000 : 30_000;
    const started = Date.now();
    const id = window.setInterval(() => {
      if (Date.now() - started > max) {
        window.clearInterval(id);
        setJustSubscribed(false);
        return;
      }
      void load({ silent: true });
    }, ms);
    return () => window.clearInterval(id);
  }, [justSubscribed, pendingInvoice?.id, pendingInvoice?.status, hasInstrument, load]);

  const selectedPrice = selectedPlan?.prices.find((price) => price.interval === interval);
  const situation = situationCopy(entitlement, subscription, pendingInvoice);
  const waitingCheckout = justSubscribed || Boolean(pendingInvoice && !hasInstrument);

  const subscribe = async (event: React.FormEvent) => {
    event.preventDefault();
    const access = getAccessToken();
    if (!access || !planCode) return;
    setBusy(true);
    try {
      const created = await createBillingSubscription({ planCode, interval, paymentMethod }, access);
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
      addToast({ type: 'error', title: 'Assinatura', description: errorMessage(error) });
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
      addToast({ type: 'success', title: 'PIX', description: 'Código copiado.' });
    } catch {
      addToast({ type: 'error', title: 'PIX', description: 'Não foi possível copiar.' });
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
        onCopyPix={(payload) => void copyPix(payload)}
      />

      <section className="hpanel-table-card billing-card">
        <h2>Situação</h2>
        <p>{situation.title}</p>
        <p className="table-cell-muted">{situation.detail}</p>
      </section>

      <section className="hpanel-table-card billing-card">
        <h2>Minha assinatura</h2>
        {subscription ? (
          <div>
            <p>
              {subscription.planCode} · {intervalLabel(subscription.interval)} · {subscription.paymentMethod} · {subscription.status}
            </p>
            <p className="table-cell-muted">Vigência até {formatDate(subscription.currentPeriodEnd)}</p>
            {subscription.status !== 'canceled' && (
              <button type="button" className="btn btn-outline btn-pill" disabled={busy} onClick={() => void cancelMine()}>
                Cancelar
              </button>
            )}
          </div>
        ) : (
          <form className="billing-form" onSubmit={subscribe}>
            <label>
              Plano
              <select className="form-input" value={planCode} onChange={(event) => setPlanCode(event.target.value)} required>
                <option value="">Selecione</option>
                {plans.filter((plan) => plan.enabled).map((plan) => (
                  <option key={plan.id} value={plan.code}>{plan.name}</option>
                ))}
              </select>
            </label>
            <label>
              Ciclo
              <select className="form-input" value={interval} onChange={(event) => setInterval(event.target.value)}>
                {(selectedPlan?.prices.length ? selectedPlan.prices : INTERVALS.map((item) => ({ interval: item.value } as BillingPlanPrice))).map((price) => (
                  <option key={price.interval} value={price.interval}>
                    {intervalLabel(price.interval)}
                    {'amountCents' in price && price.amountCents ? ` · ${formatMoney(price.amountCents, price.currency)}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pagamento
              <select
                className="form-input"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as 'pix' | 'boleto')}
              >
                <option value="pix">PIX</option>
                <option value="boleto">Boleto</option>
              </select>
            </label>
            {selectedPrice && <p>Valor do ciclo: {formatMoney(selectedPrice.amountCents, selectedPrice.currency)}</p>}
            <button className="btn btn-primary btn-pill" type="submit" disabled={busy || !planCode}>
              <CreditCard size={15} />
              Assinar
            </button>
          </form>
        )}
      </section>
    </div>
  );
};
