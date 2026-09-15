import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CreditCard,
  Crown,
  Eye,
  Info,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ListPager } from '../common/ListPager';
import { Modal } from '../common/Modal';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  getPlanQuotas,
  listKnownTickers,
  savePlanQuotas,
  type PlanQuotaDTO,
} from '../../services/analystService';
import {
  deleteBillingPlan,
  grantLifetimeSubscription,
  listBillingGatewayAccounts,
  listBillingPlans,
  lookupBillingUser,
  patchBillingPlan,
  putBillingGatewayAccountByGateway,
  saveBillingPlan,
  searchBillingEntitlements,
  searchBillingInvoices,
  setPrimaryBillingGateway,
  type BillingEntitlement,
  type BillingGatewayAccount,
  type BillingInvoice,
  type BillingPlan,
  type BillingUserSummary,
  type SaveBillingPlan,
} from '../../services/billingService';
import { canWriteBilling } from '../../utils/roles';

const NO_PLAN_CODE = '__NO_PLAN__';

interface PlanFormState extends SaveBillingPlan {
  quotaSlots: number;
  quotaPicks: number;
  quotaFixedTickers: string[];
}

const INTERVAL_CONFIGS = [
  { value: 'month', label: 'Mensal', description: 'Cobrança padrão recorrente a cada 30 dias', months: 1, defaultCents: 19900 },
  { value: 'quarter', label: 'Trimestral', description: 'Cobrança trimestral a cada 3 meses', months: 3, defaultCents: 53700 },
  { value: 'semiannual', label: 'Semestral', description: 'Cobrança semestral a cada 6 meses', months: 6, defaultCents: 101400 },
  { value: 'year', label: 'Anual', description: 'Cobrança anual com renovação a cada 12 meses', months: 12, defaultCents: 178800 },
] as const;

const INTERVALS = INTERVAL_CONFIGS;

const PAGE_SIZE = 20;

type Panel = 'transacoes' | 'assinantes' | 'planos' | 'configuracoes';

const TABS: ReadonlyArray<{ id: Panel; label: string; tabId: string; panelId: string }> = [
  { id: 'transacoes', label: 'Transações', tabId: 'billing-tab-transacoes', panelId: 'billing-panel-transacoes' },
  { id: 'assinantes', label: 'Assinantes', tabId: 'billing-tab-assinantes', panelId: 'billing-panel-assinantes' },
  { id: 'planos', label: 'Planos', tabId: 'billing-tab-planos', panelId: 'billing-panel-planos' },
  { id: 'configuracoes', label: 'Configurações', tabId: 'billing-tab-config', panelId: 'billing-panel-config' },
];

const EMPTY_PLAN: SaveBillingPlan = {
  code: '',
  name: '',
  level: 0,
  enabled: true,
  isPublic: true,
  isLifetime: false,
  trialDays: 0,
  prices: [{ interval: 'month', amountCents: 0, currency: 'BRL' }],
};

const EMPTY_PLAN_FORM: PlanFormState = {
  ...EMPTY_PLAN,
  quotaSlots: 10,
  quotaPicks: 10,
  quotaFixedTickers: [],
};

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Não foi possível concluir a operação.';
}

function formatMoney(cents: number, currency = 'BRL'): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: currency || 'BRL' });
}

interface CurrencyInputProps {
  valueCents: number;
  onChange: (cents: number) => void;
  disabled?: boolean;
}

const CurrencyInput: React.FC<CurrencyInputProps> = ({ valueCents, onChange, disabled }) => {
  const formatValue = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const [text, setText] = useState(() => formatValue(valueCents));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setText(formatValue(valueCents));
    }
  }, [valueCents, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const sanitized = raw.replace(/[^\d.,]/g, '');
    setText(sanitized);

    const normalized = sanitized.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(normalized);
    if (!isNaN(num) && num >= 0) {
      onChange(Math.round(num * 100));
    } else if (sanitized === '') {
      onChange(0);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    setText(formatValue(valueCents));
  };

  return (
    <div className={`billing-currency-control ${isFocused ? 'is-focused' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <span className="billing-currency-addon" aria-hidden="true">R$</span>
      <input
        type="text"
        inputMode="decimal"
        className="billing-currency-field-input"
        value={text}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder="0,00"
      />
    </div>
  );
};

function intervalLabel(value?: string | null): string {
  if (value === 'lifetime') return 'Vitalício';
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

function compactId(value?: string | null): string {
  if (!value) return '—';
  const trimmed = value.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

function payerLabel(name?: string | null, email?: string | null, userId?: string | null): string {
  return name || email || compactId(userId);
}

function toIso(localValue: string): string | undefined {
  if (!localValue) return undefined;
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export const BillingOrgView: React.FC = () => {
  const { getAccessToken, user } = useAuth();
  const writable = canWriteBilling(getAccessToken(), user?.roles);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [panel, setPanel] = useState<Panel>('transacoes');

  const selectPanel = (id: Panel, focus = false) => {
    setPanel(id);
    if (!focus) return;
    const index = TABS.findIndex((tab) => tab.id === id);
    if (index >= 0) tabRefs.current[index]?.focus();
  };

  const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    selectPanel(TABS[next].id, true);
  };

  const activeTab = TABS.find((tab) => tab.id === panel) ?? TABS[0];

  return (
    <div className="billing-org">
      <div className="dashboard-header">
        <div className="dashboard-title-group">
          <h1 className="dashboard-title">
            <CreditCard size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
            Billing
          </h1>
          <p className="dashboard-subtitle">
            Planos, assinantes e cobrança da organização.
          </p>
        </div>
      </div>

      <div className="llm-panel-tabs" role="tablist" aria-label="Seções de Billing">
        {TABS.map((tab, index) => {
          const selected = panel === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[index] = el; }}
              id={tab.tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={tab.panelId}
              tabIndex={selected ? 0 : -1}
              className={`llm-panel-tab${selected ? ' is-active' : ''}`}
              onClick={() => selectPanel(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id={activeTab.panelId}
        role="tabpanel"
        aria-labelledby={activeTab.tabId}
        className="llm-panel-tabpanel"
      >
        {panel === 'transacoes' ? <TransactionsPanel /> : null}
        {panel === 'assinantes' ? <SubscribersPanel writable={writable} /> : null}
        {panel === 'planos' ? <PlansPanel writable={writable} /> : null}
        {panel === 'configuracoes' ? <GatewaysPanel writable={writable} /> : null}
      </div>
    </div>
  );
};

function TransactionsPanel() {
  const { isAuthenticated, getAccessToken } = useAuth();
  const { addToast } = useToast();
  const [draft, setDraft] = useState({ status: '', paymentMethod: '', q: '', from: '', to: '' });
  const [applied, setApplied] = useState(draft);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<BillingInvoice[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedInvoice, setSelectedInvoice] = useState<BillingInvoice | null>(null);

  const load = useCallback(async (nextPage: number, filters: typeof draft) => {
    const access = getAccessToken();
    if (!access) return;
    setLoading(true);
    try {
      const result = await searchBillingInvoices({
        page: nextPage,
        size: PAGE_SIZE,
        status: filters.status || undefined,
        paymentMethod: filters.paymentMethod || undefined,
        q: filters.q || undefined,
        from: toIso(filters.from),
        to: toIso(filters.to),
      }, access);
      setItems(result.items || []);
      setTotalPages(Math.max(1, result.totalPages || 1));
      setPage(result.page ?? nextPage);
    } catch (error) {
      addToast({ type: 'error', title: 'Transações', description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [addToast, getAccessToken]);

  useEffect(() => {
    if (isAuthenticated) void load(page, applied);
  }, [applied, isAuthenticated, load, page]);

  return (
    <div>
      <form
        className="audits-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          setApplied(draft);
        }}
      >
        <div className="audits-filter-row audits-filter-row-primary">
          <select className="form-input audits-compact-select" value={draft.status} onChange={(e) => setDraft((f) => ({ ...f, status: e.target.value }))} aria-label="Status">
            <option value="">Todos os status</option>
            <option value="pending">Aguardando pagamento</option>
            <option value="paid">Pago</option>
            <option value="overdue">Vencida</option>
            <option value="refunded">Estornada</option>
            <option value="canceled">Cancelada</option>
          </select>
          <select className="form-input audits-compact-select" value={draft.paymentMethod} onChange={(e) => setDraft((f) => ({ ...f, paymentMethod: e.target.value }))} aria-label="Método">
            <option value="">Todos os métodos</option>
            <option value="pix">PIX</option>
            <option value="boleto">Boleto</option>
          </select>
          <input className="form-input" value={draft.q} onChange={(e) => setDraft((f) => ({ ...f, q: e.target.value }))} placeholder="Usuário (UUID ou e-mail)" aria-label="Usuário" />
          <input className="form-input" type="datetime-local" value={draft.from} onChange={(e) => setDraft((f) => ({ ...f, from: e.target.value }))} aria-label="De" />
        </div>
        <ListPager
          loading={loading}
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          leading={(
            <div className="audits-filter-actions">
              <button type="submit" className="btn btn-secondary btn-pill audits-filter-submit" disabled={loading}>
                <Search size={15} />
                <span>Filtrar</span>
              </button>
            </div>
          )}
        />
      </form>
      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Valor</th>
              <th>Método</th>
              <th>Pagador</th>
              <th>Vencimento</th>
              <th>Pagamento</th>
              <th>NF</th>
              <th>Id</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="table-cell-muted">Carregando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="table-cell-muted">Nenhuma transação.</td></tr>
            ) : items.map((invoice) => (
              <tr
                key={invoice.id}
                className="billing-table-row-clickable"
                tabIndex={0}
                role="button"
                aria-label={`Ver detalhes da fatura ${invoice.id}`}
                onClick={() => setSelectedInvoice(invoice)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedInvoice(invoice);
                  }
                }}
              >
                <td>{invoiceStatusLabel(invoice.status)}</td>
                <td>{formatMoney(invoice.amountCents, invoice.currency)}</td>
                <td>{(invoice.paymentMethod || '—').toUpperCase()}</td>
                <td>{payerLabel(invoice.payerName, invoice.payerEmail, invoice.payerUserId)}</td>
                <td>{formatDate(invoice.dueAt)}</td>
                <td>{invoice.status === 'paid' ? formatDate(invoice.paidAt) : '—'}</td>
                <td>
                  {invoice.nfUrl ? (
                    <a
                      href={invoice.nfUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Nota
                    </a>
                  ) : '—'}
                </td>
                <td title={invoice.id}>{compactId(invoice.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <InvoiceDetailModal
        isOpen={selectedInvoice !== null}
        onClose={() => setSelectedInvoice(null)}
        invoice={selectedInvoice}
      />
    </div>
  );
}

function SubscribersPanel({ writable }: { writable: boolean }) {
  return <EntitlementTable hasPlan qPlaceholder="Usuário, e-mail ou UUID" emptyLabel="Nenhum assinante." writable={writable} />;
}

const LINKED_GATEWAYS = [
  { slug: 'asaas', label: 'Asaas' },
  { slug: 'stripe', label: 'Stripe' },
] as const;

function gatewayLabel(gateway?: string | null): string {
  const linked = LINKED_GATEWAYS.find((item) => item.slug === (gateway || '').toLowerCase());
  return linked?.label || gateway || 'Gateway';
}

function GatewayCredentialForm({
  idPrefix,
  gateway,
  apiKey,
  webhookToken,
  onApiKey,
  onWebhookToken,
  submitLabel,
  busy,
  hint,
  onSubmit,
}: {
  idPrefix: string;
  gateway: string;
  apiKey: string;
  webhookToken: string;
  onApiKey: (value: string) => void;
  onWebhookToken: (value: string) => void;
  submitLabel: string;
  busy: boolean;
  hint: string;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const isStripe = (gateway || '').toLowerCase() === 'stripe';
  const apiKeyLabel = isStripe ? 'Secret Key (sk_live_... / sk_test_...)' : 'API key';
  const tokenLabel = isStripe ? 'Webhook Signing Secret (whsec_...)' : 'Webhook token (asaas-access-token)';

  return (
    <form className="billing-form" onSubmit={onSubmit}>
      <p className="table-cell-muted">{hint}</p>
      <label htmlFor={`${idPrefix}-api-key`}>
        {apiKeyLabel}
        <input
          id={`${idPrefix}-api-key`}
          className="form-input"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => onApiKey(event.target.value)}
          required
        />
      </label>
      <label htmlFor={`${idPrefix}-webhook-token`}>
        {tokenLabel}
        <input
          id={`${idPrefix}-webhook-token`}
          className="form-input"
          type="password"
          autoComplete="off"
          value={webhookToken}
          onChange={(event) => onWebhookToken(event.target.value)}
          required
        />
      </label>
      <button className="btn btn-primary btn-pill" type="submit" disabled={busy}>
        {submitLabel}
      </button>
    </form>
  );
}

function GatewaysPanel({ writable }: { writable: boolean }) {
  const { isAuthenticated, getAccessToken } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<BillingGatewayAccount[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [newWebhookToken, setNewWebhookToken] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { apiKey: string; webhookToken: string }>>({});
  const [promoteGateway, setPromoteGateway] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadAccounts = useCallback(async () => {
    const access = getAccessToken();
    if (!access) return;
    setLoading(true);
    try {
      const result = await listBillingGatewayAccounts(access);
      setItems(result.items || []);
    } catch (error) {
      addToast({ type: 'error', title: 'Billing', description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [addToast, getAccessToken]);

  useEffect(() => {
    if (isAuthenticated) void loadAccounts();
  }, [isAuthenticated, loadAccounts]);

  const connectedSlugs = new Set(items.map((item) => (item.gateway || '').toLowerCase()));
  const unusedLinked = LINKED_GATEWAYS.filter((item) => !connectedSlugs.has(item.slug));

  const saveGateway = async (gateway: string, apiKey: string, webhookToken: string, connected: boolean) => {
    const access = getAccessToken();
    if (!access || !writable) return;
    setBusy(true);
    try {
      const saved = await putBillingGatewayAccountByGateway(gateway, apiKey.trim(), webhookToken.trim(), access);
      setItems((current) => {
        const next = current.filter((item) => item.gateway !== saved.gateway);
        next.push(saved);
        return next;
      });
      setNewApiKey('');
      setNewWebhookToken('');
      setDrafts((current) => ({ ...current, [gateway]: { apiKey: '', webhookToken: '' } }));
      setConnecting(false);
      setSelectedType('');
      addToast({
        type: 'success',
        title: 'Meio de cobrança',
        description: connected ? `Credencial ${gatewayLabel(gateway)} atualizada.` : `${gatewayLabel(gateway)} conectado.`,
      });
    } catch (error) {
      addToast({ type: 'error', title: 'Meio de cobrança', description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const confirmPromote = async () => {
    const access = getAccessToken();
    if (!access || !writable || !promoteGateway) return;
    setBusy(true);
    try {
      const saved = await setPrimaryBillingGateway(promoteGateway, access);
      setItems((current) => current.map((item) => ({
        ...item,
        primary: item.gateway === saved.gateway,
      })));
      setPromoteGateway(null);
      addToast({ type: 'success', title: 'Meio de cobrança', description: `${gatewayLabel(saved.gateway)} agora é o principal.` });
    } catch (error) {
      addToast({ type: 'error', title: 'Meio de cobrança', description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="hpanel-table-card billing-card billing-gateway-card" aria-busy="true" aria-live="polite">
        <p className="table-cell-muted">Carregando…</p>
      </section>
    );
  }

  return (
    <div className="billing-gateway-list">
      <div className="client-system-create-row" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Gateways de pagamento</h2>
          <p className="dashboard-subtitle" style={{ margin: '0.25rem 0 0' }}>
            Meios de cobrança e gateways configurados para a organização.
          </p>
        </div>
        {writable && (items.length === 0 || unusedLinked.length > 0) && (
          <button
            type="button"
            className="btn btn-primary btn-pill"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => {
              setSelectedType((items.length === 0 ? LINKED_GATEWAYS : unusedLinked)[0]?.slug || '');
              setNewApiKey('');
              setNewWebhookToken('');
              setConnecting(true);
            }}
          >
            <Plus size={15} />
            <span>Conectar gateway</span>
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <section className="hpanel-table-card billing-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <CreditCard size={44} style={{ margin: '0 auto 1rem', opacity: 0.4, color: 'var(--text-sub)' }} />
          <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Nenhum meio de cobrança configurado</h2>
          <p className="table-cell-muted" style={{ maxWidth: '420px', margin: '0 auto 1.5rem' }}>
            Conecte um gateway da organização (como Asaas ou Stripe) para gerenciar faturas e assinaturas.
          </p>
          {writable && (
            <button
              className="btn btn-primary btn-pill"
              type="button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              onClick={() => {
                setSelectedType(LINKED_GATEWAYS[0].slug);
                setNewApiKey('');
                setNewWebhookToken('');
                setConnecting(true);
              }}
            >
              <Plus size={15} />
              <span>Conectar gateway</span>
            </button>
          )}
        </section>
      ) : (
        <>
          {items.map((account) => {
            const slug = (account.gateway || '').toLowerCase();
            const draft = drafts[slug] || { apiKey: '', webhookToken: '' };
            return (
              <section key={slug || account.companyId} className="hpanel-table-card billing-card billing-gateway-card">
                <div className="billing-gateway-head">
                  <div>
                    <p className="billing-kicker">Meio de cobrança</p>
                    <h2>{gatewayLabel(account.gateway)}</h2>
                  </div>
                  <div className="billing-gateway-pills">
                    <span className={`billing-status-pill ${account.primary ? 'is-ok' : 'is-standby'}`}>
                      {account.primary ? 'Principal' : 'Em espera — não cobra assinaturas novas'}
                    </span>
                    <span className={`billing-status-pill ${account.webhookConfigured ? 'is-ok' : 'is-pending'}`}>
                      {account.webhookConfigured ? 'Webhook configurado' : 'Webhook pendente'}
                    </span>
                  </div>
                </div>
                <dl className="billing-gateway-meta">
                  <div>
                    <dt>API key</dt>
                    <dd>{account.apiKeyMasked}</dd>
                  </div>
                  {account.rotatedAt ? (
                    <div>
                      <dt>Última rotação</dt>
                      <dd>{formatDate(account.rotatedAt)}</dd>
                    </div>
                  ) : null}
                </dl>
                {writable ? (
                  <>
                    {slug === 'asaas' || slug === 'stripe' ? (
                      <GatewayCredentialForm
                        idPrefix={`billing-gateway-${slug}`}
                        gateway={slug}
                        apiKey={draft.apiKey}
                        webhookToken={draft.webhookToken}
                        onApiKey={(value) => setDrafts((current) => ({ ...current, [slug]: { ...draft, apiKey: value } }))}
                        onWebhookToken={(value) => setDrafts((current) => ({ ...current, [slug]: { ...draft, webhookToken: value } }))}
                        submitLabel="Salvar credencial"
                        busy={busy}
                        hint="Para rotacionar, informe a nova credencial e o token de webhook. A chave completa não volta a ser exibida."
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveGateway(slug, draft.apiKey, draft.webhookToken, true);
                        }}
                      />
                    ) : null}
                    {!account.primary ? (
                      <div className="billing-gateway-actions">
                        <button className="btn btn-pill" type="button" disabled={busy} onClick={() => setPromoteGateway(slug)}>
                          Tornar principal
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="table-cell-muted">Somente leitura. É preciso billing:write para alterar.</p>
                )}
              </section>
            );
          })}
        </>
      )}

      <Modal
        isOpen={connecting}
        onClose={() => {
          setConnecting(false);
          setSelectedType('');
          setNewApiKey('');
          setNewWebhookToken('');
        }}
        title="Conectar Gateway"
      >
        <div className="billing-gateway-connect">
          <label htmlFor="billing-gateway-type">
            Tipo de Gateway
            <select
              id="billing-gateway-type"
              className="form-input"
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
            >
              <option value="">Selecione o gateway</option>
              {(items.length === 0 ? LINKED_GATEWAYS : unusedLinked).map((item) => (
                <option key={item.slug} value={item.slug}>{item.label}</option>
              ))}
            </select>
          </label>
          {selectedType === 'asaas' || selectedType === 'stripe' ? (
            <GatewayCredentialForm
              idPrefix="billing-gateway-new"
              gateway={selectedType}
              apiKey={newApiKey}
              webhookToken={newWebhookToken}
              onApiKey={setNewApiKey}
              onWebhookToken={setNewWebhookToken}
              submitLabel={`Conectar ${gatewayLabel(selectedType)}`}
              busy={busy}
              hint="A chave completa não volta a ser exibida depois de salvar."
              onSubmit={(event) => {
                event.preventDefault();
                void saveGateway(selectedType, newApiKey, newWebhookToken, false);
              }}
            />
          ) : null}
        </div>
      </Modal>

      <Modal
        isOpen={promoteGateway !== null}
        onClose={() => setPromoteGateway(null)}
        title="Tornar principal"
        footer={(
          <>
            <button className="btn btn-pill" type="button" onClick={() => setPromoteGateway(null)} disabled={busy}>
              Cancelar
            </button>
            <button className="btn btn-primary btn-pill" type="button" onClick={() => void confirmPromote()} disabled={busy}>
              Confirmar
            </button>
          </>
        )}
      >
        <p>
          Assinaturas já ativas neste outro meio continuam lá. Só as novas usam este.
        </p>
      </Modal>
    </div>
  );
}

function EntitlementTable({
  hasPlan,
  qPlaceholder,
  emptyLabel,
  writable,
}: {
  hasPlan?: boolean;
  qPlaceholder: string;
  emptyLabel: string;
  writable?: boolean;
}) {
  const { isAuthenticated, getAccessToken } = useAuth();
  const { addToast } = useToast();
  const [draft, setDraft] = useState({ status: '', planCode: '', q: '' });
  const [applied, setApplied] = useState(draft);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<BillingEntitlement[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<BillingPlan[]>([]);
  const [selectedPlanCode, setSelectedPlanCode] = useState('VIP');
  const [userEmailQuery, setUserEmailQuery] = useState('');
  const [searchingUser, setSearchingUser] = useState(false);
  const [foundUser, setFoundUser] = useState<BillingUserSummary | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);

  const loadPlans = useCallback(async () => {
    const access = getAccessToken();
    if (!access) return;
    try {
      const plansList = await listBillingPlans(access);
      setAvailablePlans(plansList);
      if (plansList.length > 0) {
        const vipOrLifetime = plansList.find((p) => p.code?.toUpperCase() === 'VIP' || p.isLifetime);
        if (vipOrLifetime) {
          setSelectedPlanCode(vipOrLifetime.code);
        } else {
          setSelectedPlanCode(plansList[0].code);
        }
      }
    } catch {
      // ignore
    }
  }, [getAccessToken]);

  const load = useCallback(async (nextPage: number, filters: typeof draft) => {
    const access = getAccessToken();
    if (!access) return;
    setLoading(true);
    try {
      const result = await searchBillingEntitlements({
        page: nextPage,
        size: PAGE_SIZE,
        status: filters.status || undefined,
        planCode: filters.planCode || undefined,
        q: filters.q || undefined,
        hasPlan,
      }, access);
      setItems(result.items || []);
      setTotalPages(Math.max(1, result.totalPages || 1));
      setPage(result.page ?? nextPage);
    } catch (error) {
      addToast({ type: 'error', title: 'Billing', description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [addToast, getAccessToken, hasPlan]);

  useEffect(() => {
    if (isAuthenticated) void load(page, applied);
  }, [applied, isAuthenticated, load, page]);

  useEffect(() => {
    if (!assignModalOpen) return;
    const trimmed = userEmailQuery.trim();
    if (!trimmed || trimmed.length < 3) {
      setFoundUser(null);
      setSearchError(null);
      setSearchingUser(false);
      return;
    }
    const timer = setTimeout(async () => {
      const access = getAccessToken();
      if (!access) return;
      setSearchingUser(true);
      setSearchError(null);
      try {
        const user = await lookupBillingUser(trimmed, access);
        setFoundUser(user);
        setSearchError(null);
      } catch {
        setFoundUser(null);
        setSearchError('Usuário não encontrado nesta organização');
      } finally {
        setSearchingUser(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [userEmailQuery, assignModalOpen, getAccessToken]);

  const handleAssignPlan = async (event: React.FormEvent) => {
    event.preventDefault();
    const access = getAccessToken();
    if (!access || !foundUser || !selectedPlanCode.trim()) return;
    setAssignBusy(true);
    try {
      await grantLifetimeSubscription(
        {
          targetUserId: foundUser.id,
          planCode: selectedPlanCode.trim().toUpperCase(),
        },
        access,
      );
      addToast({
        type: 'success',
        title: 'Plano Atribuído',
        description: `Plano ${selectedPlanCode.trim().toUpperCase()} atribuído com sucesso para ${foundUser.username || foundUser.email}.`,
      });
      setAssignModalOpen(false);
      setFoundUser(null);
      setUserEmailQuery('');
      setSearchError(null);
      void load(0, applied);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Atribuir Plano',
        description: errorMessage(error),
      });
    } finally {
      setAssignBusy(false);
    }
  };

  return (
    <div>
      {writable && (
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-start' }}>
          <button
            type="button"
            className="btn btn-primary btn-pill"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => {
              setUserEmailQuery('');
              setFoundUser(null);
              setSearchError(null);
              void loadPlans();
              setAssignModalOpen(true);
            }}
          >
            <Plus size={15} />
            <span>Atribuir Plano</span>
          </button>
        </div>
      )}
      <form
        className="audits-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          setApplied(draft);
        }}
      >
        <div className="audits-filter-row audits-filter-row-primary">
          <select className="form-input audits-compact-select" value={draft.status} onChange={(e) => setDraft((f) => ({ ...f, status: e.target.value }))} aria-label="Status">
            <option value="">Todos os status</option>
            <option value="trial">Período de avaliação</option>
            <option value="active">Ativo</option>
            <option value="grace">Em carência</option>
            <option value="restricted">Restrito</option>
            <option value="canceled">Cancelado</option>
            <option value="none">Sem assinatura</option>
          </select>
          <input className="form-input" value={draft.planCode} onChange={(e) => setDraft((f) => ({ ...f, planCode: e.target.value }))} placeholder="Código do plano" aria-label="Plano" />
          <input className="form-input" value={draft.q} onChange={(e) => setDraft((f) => ({ ...f, q: e.target.value }))} placeholder={qPlaceholder} aria-label="Busca" />
        </div>
        <ListPager
          loading={loading}
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          leading={(
            <div className="audits-filter-actions">
              <button type="submit" className="btn btn-secondary btn-pill audits-filter-submit" disabled={loading}>
                <Search size={15} />
                <span>Filtrar</span>
              </button>
            </div>
          )}
        />
      </form>
      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Plano</th>
              <th>Intervalo</th>
              <th>Status</th>
              <th>Período</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="table-cell-muted">Carregando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="table-cell-muted">{emptyLabel}</td></tr>
            ) : items.map((row) => (
              <tr key={`${row.companyId}-${row.userId}`}>
                <td>{payerLabel(row.payerName, row.payerEmail, row.userId)}</td>
                <td>{row.planCode || '—'}</td>
                <td>
                  {row.interval === 'lifetime' ? (
                    <span className="billing-status-pill is-vip">
                      <Crown size={12} style={{ marginRight: '0.25rem' }} />
                      Vitalício
                    </span>
                  ) : (
                    intervalLabel(row.interval)
                  )}
                </td>
                <td>{entitlementLabel(row.status)}</td>
                <td>
                  {row.interval === 'lifetime' || (!row.currentPeriodEnd && row.planCode?.toUpperCase() === 'VIP') ? (
                    <span style={{ color: 'var(--success, #00b090)', fontWeight: 600 }}>
                      Vitalício (Sem expiração)
                    </span>
                  ) : (
                    formatDate(row.currentPeriodEnd)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={assignModalOpen}
        onClose={() => { if (!assignBusy) setAssignModalOpen(false); }}
        title="Atribuir Plano ao Usuário"
        footer={(
          <>
            <button className="btn btn-pill" type="button" onClick={() => setAssignModalOpen(false)} disabled={assignBusy}>
              Cancelar
            </button>
            <button
              className="btn btn-primary btn-pill"
              type="submit"
              form="billing-assign-plan-form"
              disabled={assignBusy || !foundUser || !selectedPlanCode.trim()}
            >
              {assignBusy ? 'Atribuindo…' : 'Confirmar Atribuição de Plano'}
            </button>
          </>
        )}
      >
        <form id="billing-assign-plan-form" className="billing-form" onSubmit={handleAssignPlan}>
          <p className="table-cell-muted" style={{ marginBottom: '1rem' }}>
            Selecione o plano desejado e localize o usuário pelo e-mail para conceder o acesso manual sem cobranças no gateway Asaas.
          </p>
          <label>
            Plano
            <select
              className="form-input"
              value={selectedPlanCode}
              onChange={(e) => setSelectedPlanCode(e.target.value)}
              required
            >
              {availablePlans.length === 0 ? (
                <option value="VIP">VIP</option>
              ) : (
                availablePlans.map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {plan.name} ({plan.code}){plan.isLifetime ? ' • Vitalício' : ''}{!plan.enabled ? ' (Inativo)' : ''}
                  </option>
                ))
              )}
            </select>
          </label>
          <div className="billing-user-lookup">
            <label>
              E-mail do Usuário
              <div className="billing-search-input-wrap">
                <input
                  className="form-input"
                  type="email"
                  value={userEmailQuery}
                  onChange={(e) => setUserEmailQuery(e.target.value)}
                  placeholder="Digite o e-mail do usuário cadastrado"
                  required
                  autoFocus
                />
                <div className="billing-search-icon">
                  {searchingUser ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
                </div>
              </div>
            </label>

            {searchingUser && (
              <div className="billing-user-feedback is-loading">
                <Loader2 size={14} className="spin" />
                <span>Localizando usuário...</span>
              </div>
            )}

            {searchError && !searchingUser && (
              <div className="billing-user-feedback is-error">
                <AlertCircle size={14} />
                <span>{searchError}</span>
              </div>
            )}

            {foundUser && !searchingUser && (
              <div className="billing-user-card is-selected">
                <div className="billing-user-avatar">
                  {(foundUser.username || foundUser.email || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="billing-user-info">
                  <div className="billing-user-name-row">
                    <span className="billing-user-name">
                      {foundUser.username || 'Sem nome cadastrado'}
                    </span>
                    <span className="billing-status-pill is-ok" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
                      <CheckCircle2 size={11} style={{ marginRight: '0.2rem' }} />
                      {foundUser.status === 'ACTIVE' ? 'Ativo' : foundUser.status}
                    </span>
                  </div>
                  <span className="billing-user-email">{foundUser.email}</span>
                  <span className="billing-user-id">UUID: {foundUser.id}</span>
                </div>
              </div>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}

function InfoHelpTooltip({
  text,
  align = 'center',
}: {
  text: string;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <span
      className={`billing-info-tooltip billing-info-tooltip-${align}`}
      tabIndex={0}
      role="button"
      aria-label={text}
    >
      <Info size={13} className="billing-info-tooltip-icon" />
      <span className="billing-info-tooltip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}

interface TickerPickerProps {
  knownTickers: string[];
  selectedTickers: string[];
  maxCount: number;
  onAdd: (ticker: string) => void;
  onRemove: (ticker: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

function TickerPicker({
  knownTickers,
  selectedTickers,
  maxCount,
  onAdd,
  onRemove,
  disabled,
  placeholder = 'Buscar ativo no catálogo (ex: PETR4, HGLG11)...',
  id = 'ticker-search-input',
}: TickerPickerProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  const remaining = Math.max(0, maxCount - selectedTickers.length);
  const isMaxReached = remaining === 0;

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    const available = knownTickers.filter((t) => !selectedTickers.includes(t));
    if (!q) return available.slice(0, 20);
    return available.filter((t) => t.includes(q)).slice(0, 20);
  }, [knownTickers, query, selectedTickers]);

  const updateCoords = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updateCoords();

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      updateCoords();
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updateCoords]);

  const handleAdd = (ticker: string) => {
    const clean = ticker.trim().toUpperCase();
    if (!clean || isMaxReached) return;
    onAdd(clean);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div className="billing-ticker-picker" ref={containerRef}>
      <div className="billing-ticker-picker-label-row">
        <div className="billing-title-with-tooltip">
          <label className="billing-field-label" htmlFor={id} style={{ margin: 0 }}>
            Ativos Fixos Recomendados da Plataforma
          </label>
          <InfoHelpTooltip text={`Defina os ${maxCount} ativo(s) fixo(s) obrigatório(s) para completar a carteira deste plano.`} />
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isMaxReached ? 'var(--success, #00b090)' : 'var(--text-muted)' }}>
          {selectedTickers.length} de {maxCount} adicionados
        </span>
      </div>

      <div className="billing-ticker-picker-input-group">
        <Search size={15} className="billing-ticker-input-icon" />
        <input
          ref={inputRef}
          id={id}
          className="form-input billing-ticker-picker-input"
          value={query}
          disabled={disabled || isMaxReached}
          placeholder={isMaxReached ? `Meta atingida (${maxCount} ativos fixados)` : placeholder}
          onChange={(e) => {
            setQuery(e.target.value.toUpperCase());
            setIsOpen(true);
          }}
          onFocus={() => {
            if (!isMaxReached) {
              updateCoords();
              setIsOpen(true);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (filtered.length > 0 && query.trim()) {
                handleAdd(filtered[0]);
              } else if (query.trim()) {
                handleAdd(query);
              }
            } else if (e.key === 'Escape') {
              setIsOpen(false);
            }
          }}
          autoComplete="off"
        />
        <button
          type="button"
          className="btn btn-outline btn-pill"
          disabled={disabled || isMaxReached || !query.trim()}
          onClick={() => handleAdd(query)}
        >
          <Plus size={15} style={{ marginRight: '0.25rem' }} />
          Adicionar
        </button>
      </div>

      {isOpen && !isMaxReached && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          className="billing-ticker-picker-popover"
          role="listbox"
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            zIndex: 99999,
          }}
        >
          {filtered.length === 0 ? (
            <div className="billing-ticker-popover-empty">
              {query.trim() ? `Nenhum ativo encontrado para "${query}"` : 'Nenhum ativo disponível'}
            </div>
          ) : (
            filtered.map((ticker) => (
              <button
                key={ticker}
                type="button"
                className="billing-ticker-popover-item"
                onClick={() => handleAdd(ticker)}
              >
                <span className="billing-ticker-popover-code">{ticker}</span>
                <span className="billing-ticker-popover-badge">+ Selecionar</span>
              </button>
            ))
          )}
        </div>,
        document.body
      )}

      {selectedTickers.length > 0 ? (
        <div className="billing-tickers-chips-wrap">
          {selectedTickers.map((ticker) => (
            <span key={ticker} className="billing-ticker-chip">
              <span>{ticker}</span>
              <button
                type="button"
                className="billing-ticker-chip-remove"
                title={`Remover ${ticker}`}
                onClick={() => onRemove(ticker)}
                disabled={disabled}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PlansPanel({ writable }: { writable: boolean }) {
  const { isAuthenticated, getAccessToken } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [quotasMap, setQuotasMap] = useState<Record<string, PlanQuotaDTO>>({});
  const [allQuotas, setAllQuotas] = useState<PlanQuotaDTO[]>([]);
  const [knownTickers, setKnownTickers] = useState<string[]>([]);
  const [planModal, setPlanModal] = useState<PlanFormState | null>(null);
  const [planStep, setPlanStep] = useState<'general' | 'pricing' | 'quotas'>('general');
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewingPlan, setViewingPlan] = useState<BillingPlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<BillingPlan | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  // Freemium state
  const [editingNoPlan, setEditingNoPlan] = useState(false);
  const [noPlanDraft, setNoPlanDraft] = useState<{ watchlistSlots: number; watchlistPicks: number; fixedTickers: string[] }>({
    watchlistSlots: 5,
    watchlistPicks: 1,
    fixedTickers: [],
  });
  const [noPlanBusy, setNoPlanBusy] = useState(false);

  const load = useCallback(async () => {
    const access = getAccessToken();
    if (!access) return;
    setLoading(true);
    try {
      const [plansRes, quotasRes, tickersRes] = await Promise.all([
        listBillingPlans(access),
        getPlanQuotas().catch((err) => {
          console.warn('Falha ao carregar cotas salvas:', err);
          return [] as PlanQuotaDTO[];
        }),
        listKnownTickers().catch((err) => {
          console.warn('Falha ao carregar tickers conhecidos:', err);
          return { tickers: [] };
        }),
      ]);
      setPlans(plansRes);
      setAllQuotas(quotasRes);
      const qMap: Record<string, PlanQuotaDTO> = {};
      for (const q of quotasRes) {
        qMap[q.planCode] = q;
      }
      setQuotasMap(qMap);
      if (tickersRes && Array.isArray(tickersRes.tickers)) {
        setKnownTickers(tickersRes.tickers);
      }
      const np = qMap[NO_PLAN_CODE];
      if (np) {
        setNoPlanDraft({
          watchlistSlots: np.watchlistSlots ?? 5,
          watchlistPicks: np.watchlistPicks ?? 1,
          fixedTickers: np.fixedTickers ? [...np.fixedTickers] : [],
        });
      }
    } catch (error) {
      addToast({ type: 'error', title: 'Planos', description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [addToast, getAccessToken]);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [isAuthenticated, load]);

  const confirmDelete = async () => {
    if (!deletingPlan) return;
    const access = getAccessToken();
    if (!access) return;

    setDeletingBusy(true);
    try {
      await deleteBillingPlan(deletingPlan.code, access);
      addToast({
        type: 'success',
        title: 'Plano excluído',
        description: `O plano "${deletingPlan.name}" (${deletingPlan.code}) foi removido com sucesso.`,
      });
      setDeletingPlan(null);
      if (viewingPlan?.id === deletingPlan.id) {
        setViewingPlan(null);
      }
      await load();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Não foi possível excluir o plano',
        description: err.message || 'Falha ao excluir o plano no servidor.',
      });
    } finally {
      setDeletingBusy(false);
    }
  };

  const openNewPlan = () => {
    setEditingCode(null);
    setPlanStep('general');
    setPlanModal({ ...EMPTY_PLAN_FORM });
  };

  const openEditPlan = (plan: BillingPlan) => {
    const existingQuota = quotasMap[plan.code];
    setEditingCode(plan.code);
    setPlanStep('general');
    setPlanModal({
      code: plan.code,
      name: plan.name,
      level: plan.isLifetime ? 999 : (plan.level ?? 0),
      enabled: plan.enabled,
      isPublic: plan.isPublic ?? true,
      isLifetime: plan.isLifetime ?? false,
      trialDays: plan.trialDays,
      prices: plan.prices.length
        ? plan.prices.map((p) => ({ ...p }))
        : (plan.isLifetime ? [] : [{ interval: 'month', amountCents: 19900, currency: 'BRL' }]),
      quotaSlots: existingQuota?.watchlistSlots ?? 10,
      quotaPicks: existingQuota?.watchlistPicks ?? 10,
      quotaFixedTickers: existingQuota?.fixedTickers ? [...existingQuota.fixedTickers] : [],
    });
  };

  const openEditNoPlan = () => {
    const np = quotasMap[NO_PLAN_CODE];
    setNoPlanDraft({
      watchlistSlots: np?.watchlistSlots ?? 5,
      watchlistPicks: np?.watchlistPicks ?? 1,
      fixedTickers: np?.fixedTickers ? [...np.fixedTickers] : [],
    });
    setEditingNoPlan(true);
  };

  const saveNoPlanQuota = async () => {
    if (noPlanDraft.watchlistSlots < 1) {
      addToast({ type: 'warning', title: 'Cotas Freemium', description: 'A carteira deve ter ao menos 1 slot de ativo.' });
      return;
    }
    if (noPlanDraft.watchlistPicks < 0 || noPlanDraft.watchlistPicks > noPlanDraft.watchlistSlots) {
      addToast({ type: 'warning', title: 'Cotas Freemium', description: 'Os picks livres não podem ser maiores que os slots totais.' });
      return;
    }
    const reqFixed = noPlanDraft.watchlistSlots - noPlanDraft.watchlistPicks;
    if (noPlanDraft.fixedTickers.length !== reqFixed) {
      addToast({
        type: 'warning',
        title: 'Ativos Fixos Incompletos',
        description: `O plano freemium exige exatamente ${reqFixed} ativo(s) fixo(s) obrigatório(s). Foram adicionados ${noPlanDraft.fixedTickers.length}.`,
      });
      return;
    }

    setNoPlanBusy(true);
    try {
      const otherQuotas = allQuotas.filter((q) => q.planCode !== NO_PLAN_CODE);
      const newQuotaList = [
        ...otherQuotas,
        {
          planCode: NO_PLAN_CODE,
          watchlistSlots: noPlanDraft.watchlistSlots,
          watchlistPicks: noPlanDraft.watchlistPicks,
          fixedTickers: noPlanDraft.fixedTickers,
        },
      ];
      await savePlanQuotas({ quotas: newQuotaList });
      setEditingNoPlan(false);
      addToast({
        type: 'success',
        title: 'Cotas Freemium salvas',
        description: 'Os limites de degustação para usuários sem assinatura foram atualizados com sucesso.',
      });
      await load();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Erro ao salvar cotas freemium',
        description: err.message || 'Falha ao salvar no servidor.',
      });
    } finally {
      setNoPlanBusy(false);
    }
  };

  const addPlanFixedTicker = (raw: string) => {
    if (!planModal) return;
    const ticker = raw.trim().toUpperCase();
    if (!ticker) return;
    if (planModal.quotaFixedTickers.includes(ticker)) {
      addToast({ type: 'info', title: 'Ativo já adicionado', description: `${ticker} já está na lista fixa deste plano.` });
      return;
    }
    const req = planModal.quotaSlots - planModal.quotaPicks;
    if (planModal.quotaFixedTickers.length >= req) {
      addToast({
        type: 'warning',
        title: 'Limite atingido',
        description: `Este plano requer apenas ${req} ativo(s) fixo(s). Ajuste os slots ou picks se desejar adicionar mais.`,
      });
      return;
    }
    setPlanModal({
      ...planModal,
      quotaFixedTickers: [...planModal.quotaFixedTickers, ticker],
    });
  };

  const removePlanFixedTicker = (ticker: string) => {
    if (!planModal) return;
    setPlanModal({
      ...planModal,
      quotaFixedTickers: planModal.quotaFixedTickers.filter((t) => t !== ticker),
    });
  };

  const addNoPlanFixedTicker = (raw: string) => {
    const ticker = raw.trim().toUpperCase();
    if (!ticker) return;
    if (noPlanDraft.fixedTickers.includes(ticker)) {
      addToast({ type: 'info', title: 'Ativo já adicionado', description: `${ticker} já está na lista fixa freemium.` });
      return;
    }
    const req = noPlanDraft.watchlistSlots - noPlanDraft.watchlistPicks;
    if (noPlanDraft.fixedTickers.length >= req) {
      addToast({
        type: 'warning',
        title: 'Limite atingido',
        description: `O freemium requer apenas ${req} ativo(s) fixo(s). Ajuste os slots ou picks se desejar adicionar mais.`,
      });
      return;
    }
    setNoPlanDraft({
      ...noPlanDraft,
      fixedTickers: [...noPlanDraft.fixedTickers, ticker],
    });
  };

  const removeNoPlanFixedTicker = (ticker: string) => {
    setNoPlanDraft({
      ...noPlanDraft,
      fixedTickers: noPlanDraft.fixedTickers.filter((t) => t !== ticker),
    });
  };

  const submitPlan = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    const access = getAccessToken();
    if (!access || !planModal) return;

    if (!planModal.code.trim() || !planModal.name.trim()) {
      addToast({ type: 'warning', title: 'Dados do Plano', description: 'Código e nome são obrigatórios.' });
      setPlanStep('general');
      return;
    }

    if (!planModal.isLifetime && planModal.prices.length === 0) {
      addToast({ type: 'warning', title: 'Ciclos de Cobrança', description: 'O plano precisa ter ao menos um ciclo de cobrança ativo.' });
      setPlanStep('pricing');
      return;
    }

    if (planModal.quotaSlots < 1) {
      addToast({ type: 'warning', title: 'Cotas do Plano', description: 'A carteira deve ter ao menos 1 slot de ativo.' });
      setPlanStep('quotas');
      return;
    }
    if (planModal.quotaPicks < 0 || planModal.quotaPicks > planModal.quotaSlots) {
      addToast({ type: 'warning', title: 'Cotas do Plano', description: 'Os picks livres não podem ser negativos nem maiores que os slots totais.' });
      setPlanStep('quotas');
      return;
    }
    const requiredFixed = planModal.quotaSlots - planModal.quotaPicks;
    if (planModal.quotaFixedTickers.length !== requiredFixed) {
      addToast({
        type: 'warning',
        title: 'Ativos Fixos Incompletos',
        description: `Este plano exige exatamente ${requiredFixed} ativo(s) fixo(s) obrigatório(s) (Slots: ${planModal.quotaSlots} - Picks: ${planModal.quotaPicks}). Foram adicionados ${planModal.quotaFixedTickers.length}.`,
      });
      setPlanStep('quotas');
      return;
    }

    setBusy(true);
    try {
      const payload: SaveBillingPlan = {
        code: planModal.code.trim(),
        name: planModal.name.trim(),
        level: planModal.isLifetime ? 999 : (planModal.level ?? 0),
        enabled: planModal.enabled,
        isPublic: planModal.isPublic ?? true,
        isLifetime: planModal.isLifetime ?? false,
        trialDays: planModal.trialDays,
        prices: planModal.isLifetime ? [] : planModal.prices,
      };

      if (editingCode) {
        await patchBillingPlan(editingCode, payload, access);
      } else {
        await saveBillingPlan(payload, access);
      }

      // Persiste cotas de mercado no bff-invest
      const otherQuotas = allQuotas.filter((q) => q.planCode !== payload.code);
      const newQuotaList = [
        ...otherQuotas,
        {
          planCode: payload.code,
          watchlistSlots: planModal.quotaSlots,
          watchlistPicks: planModal.quotaPicks,
          fixedTickers: planModal.quotaFixedTickers,
        },
      ];
      await savePlanQuotas({ quotas: newQuotaList });

      setPlanModal(null);
      setEditingCode(null);
      setPlanStep('general');
      addToast({
        type: 'success',
        title: editingCode ? 'Plano atualizado' : 'Plano criado',
        description: `O plano "${payload.name}" e seus limites de mercado foram salvos com sucesso.`,
      });
      await load();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Erro ao salvar plano',
        description: err.message || 'Falha ao comunicar com os servidores.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="billing-plans-view">
      <div className="client-system-create-row" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Planos da organização</h2>
          <p className="dashboard-subtitle" style={{ margin: '0.25rem 0 0' }}>
            Gerencie os planos de assinatura, níveis de acesso e ciclos de preços ativos.
          </p>
        </div>
        {writable && (
          <button
            type="button"
            className="btn btn-primary btn-pill"
            onClick={openNewPlan}
          >
            <Plus size={15} />
            <span>Novo plano</span>
          </button>
        )}
      </div>

      {/* Card Freemium / Degustação */}
      {(() => {
        const np = quotasMap[NO_PLAN_CODE];
        const slots = np?.watchlistSlots ?? 5;
        const picks = np?.watchlistPicks ?? 1;
        const fixed = np?.fixedTickers ?? [];
        return (
          <div className="billing-freemium-card" style={{ marginBottom: '1.5rem' }}>
            <div className="billing-freemium-left">
              <div className="billing-freemium-icon-wrap">
                <Sparkles size={20} />
              </div>
              <div className="billing-freemium-info">
                <div className="billing-freemium-title-row">
                  <h3 className="billing-freemium-title">Degustação Freemium (Sem Assinatura Ativa)</h3>
                  <span className="billing-freemium-badge">Padrão do Sistema</span>
                </div>
                <p className="billing-freemium-desc">
                  Limites de mercado aplicados automaticamente aos usuários sem plano ativo ou após o cancelamento da assinatura.
                </p>
                <div className="billing-freemium-metrics">
                  <div className="billing-freemium-metric-item">
                    <span className="billing-freemium-metric-num">{slots}</span>
                    <span className="billing-freemium-metric-label">Slots na Carteira</span>
                  </div>
                  <div className="billing-freemium-metric-divider" />
                  <div className="billing-freemium-metric-item">
                    <span className="billing-freemium-metric-num">{picks}</span>
                    <span className="billing-freemium-metric-label">Picks Livres</span>
                  </div>
                  <div className="billing-freemium-metric-divider" />
                  <div className="billing-freemium-metric-item">
                    <span className="billing-freemium-metric-num">{fixed.length}</span>
                    <span className="billing-freemium-metric-label">Ativos Fixos</span>
                  </div>
                  {fixed.length > 0 && (
                    <div className="billing-freemium-fixed-tickers">
                      {fixed.map((t) => (
                        <span key={t} className="billing-ticker-mini-tag is-freemium">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {writable && (
              <div className="billing-freemium-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-pill btn-sm"
                  onClick={openEditNoPlan}
                >
                  <Settings2 size={14} style={{ marginRight: '0.35rem' }} />
                  Editar Cotas Freemium
                </button>
              </div>
            )}
          </div>
        );
      })()}

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table billing-plans-table">
          <thead>
            <tr>
              <th style={{ width: '100px' }}>Nível</th>
              <th style={{ width: '120px' }}>Código</th>
              <th style={{ minWidth: '170px' }}>Nome</th>
              <th style={{ width: '100px' }}>Status</th>
              <th style={{ width: '160px' }}>Cotas da Carteira</th>
              <th>Preços por Ciclo</th>
              <th style={{ width: writable ? '120px' : '50px', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="table-cell-muted">Carregando…</td></tr>
            ) : plans.length === 0 ? (
              <tr><td colSpan={7} className="table-cell-muted">Nenhum plano cadastrado.</td></tr>
            ) : plans.map((plan) => (
              <tr key={plan.id}>
                <td>
                  {plan.isLifetime || (plan.level != null && plan.level >= 999) ? (
                    <span className="billing-level-tag is-vip" title="Acesso Vitalício Especial (Nível 999)">
                      <Crown size={11} style={{ marginRight: '0.25rem' }} />
                      <span>Vitalício</span>
                    </span>
                  ) : (
                    <span className={`billing-level-tag level-${plan.level ?? 0}`}>
                      Nível {plan.level ?? 0}
                    </span>
                  )}
                </td>
                <td>
                  <code className="billing-code-pill">{plan.code}</code>
                </td>
                <td>
                  <div className="billing-plan-name-cell">
                    <span className="billing-plan-name-text">{plan.name}</span>
                    {plan.isPublic === false && (
                      <span className="billing-tag-meta is-private" title="Plano privado (oculto da vitrine pública de contratação)">
                        <Lock size={10} />
                        <span>Privado</span>
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <span className={`billing-status-badge ${plan.enabled ? 'is-active' : 'is-inactive'}`}>
                    <span className="billing-status-dot" />
                    {plan.enabled ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td>
                  {(() => {
                    const q = quotasMap[plan.code];
                    if (!q) {
                      return <span className="table-cell-muted" style={{ fontSize: '0.8rem' }}>Sem cota definida</span>;
                    }
                    return (
                      <div className="billing-quota-cell">
                        <div className="billing-quota-badges">
                          <span className="billing-quota-chip" title="Total de slots disponíveis na carteira">
                            <strong>{q.watchlistSlots}</strong> slots
                          </span>
                          <span className="billing-quota-chip is-picks" title="Picks de livre escolha do usuário">
                            <strong>{q.watchlistPicks}</strong> picks
                          </span>
                        </div>
                        {q.fixedTickers && q.fixedTickers.length > 0 && (
                          <div className="billing-quota-fixed-preview" title={`Fixos obrigatórios: ${q.fixedTickers.join(', ')}`}>
                            {q.fixedTickers.slice(0, 3).map((t) => (
                              <span key={t} className="billing-ticker-mini-tag">{t}</span>
                            ))}
                            {q.fixedTickers.length > 3 && (
                              <span className="billing-ticker-mini-tag is-more">+{q.fixedTickers.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td>
                  {plan.isLifetime && (!plan.prices || plan.prices.length === 0) ? (
                    <div className="billing-price-exempt-tag">
                      <Crown size={13} />
                      <span>Isento (Vitalício)</span>
                    </div>
                  ) : !plan.prices || plan.prices.length === 0 ? (
                    <span className="table-cell-muted">Sem ciclos de preço</span>
                  ) : (
                    <div className="billing-price-chips-wrap">
                      {plan.prices.map((price) => (
                        <div key={price.interval} className="billing-price-chip">
                          <span className="billing-price-chip-interval">{intervalLabel(price.interval)}</span>
                          <span className="billing-price-chip-amount">{formatMoney(price.amountCents, price.currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div className="billing-table-actions">
                    <button
                      type="button"
                      className="btn-table-icon"
                      title="Ver detalhes do plano"
                      onClick={() => setViewingPlan(plan)}
                    >
                      <Eye size={15} />
                    </button>
                    {writable ? (
                      <>
                        <button
                          type="button"
                          className="btn-table-icon"
                          title="Editar plano"
                          onClick={() => openEditPlan(plan)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn-table-icon is-danger"
                          title="Excluir plano"
                          onClick={() => setDeletingPlan(plan)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={planModal !== null}
        onClose={() => { setPlanModal(null); setEditingCode(null); setPlanStep('general'); }}
        title={editingCode ? 'Editar Plano' : 'Novo Plano'}
        subtitle={
          editingCode
            ? `Configuração do plano "${planModal?.name || editingCode}" (${planModal?.code || editingCode})`
            : 'Defina os dados fundamentais do plano e seus ciclos de faturamento'
        }
        maxWidth="800px"
        footer={(
          <div className="billing-modal-footer">
            <button
              type="button"
              className="btn btn-outline btn-pill"
              onClick={() => {
                if (planStep === 'quotas') {
                  setPlanStep(planModal?.isLifetime ? 'general' : 'pricing');
                } else if (planStep === 'pricing') {
                  setPlanStep('general');
                } else {
                  setPlanModal(null);
                  setEditingCode(null);
                  setPlanStep('general');
                }
              }}
              disabled={busy}
            >
              {planStep === 'quotas' ? (
                <>
                  <ArrowLeft size={15} style={{ marginRight: '0.35rem' }} />
                  {planModal?.isLifetime ? 'Voltar aos dados' : 'Voltar aos ciclos'}
                </>
              ) : planStep === 'pricing' ? (
                <>
                  <ArrowLeft size={15} style={{ marginRight: '0.35rem' }} />
                  Voltar aos dados
                </>
              ) : (
                'Cancelar'
              )}
            </button>

            {planStep === 'general' ? (
              <button
                type="button"
                className="btn btn-primary btn-pill"
                onClick={() => {
                  if (!planModal?.code?.trim() || !planModal?.name?.trim()) {
                    addToast({ type: 'warning', title: 'Dados do Plano', description: 'Preencha o código e o nome antes de prosseguir.' });
                    return;
                  }
                  setPlanStep(planModal.isLifetime ? 'quotas' : 'pricing');
                }}
              >
                {planModal?.isLifetime ? 'Avançar para Cotas' : 'Avançar para Ciclos'}
                <ArrowRight size={15} style={{ marginLeft: '0.35rem' }} />
              </button>
            ) : planStep === 'pricing' ? (
              <button
                type="button"
                className="btn btn-primary btn-pill"
                disabled={!planModal?.prices || planModal.prices.length === 0}
                onClick={() => setPlanStep('quotas')}
              >
                Avançar para Cotas
                <ArrowRight size={15} style={{ marginLeft: '0.35rem' }} />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-pill"
                disabled={busy}
                onClick={() => void submitPlan()}
              >
                {busy ? (
                  <>
                    <Loader2 size={15} className="billing-spin" style={{ marginRight: '0.35rem' }} />
                    Salvando…
                  </>
                ) : editingCode ? (
                  'Salvar Alterações'
                ) : (
                  'Criar Plano'
                )}
              </button>
            )}
          </div>
        )}
      >
        {planModal && (
          <div className="billing-plan-dialog">
            {/* Stepper Header */}
            <div className="billing-modal-stepper">
              <button
                type="button"
                className={`billing-stepper-btn ${planStep === 'general' ? 'is-active' : ''}`}
                onClick={() => setPlanStep('general')}
              >
                <span className="billing-stepper-num">1</span>
                <div className="billing-stepper-text">
                  <strong>1. Dados Gerais</strong>
                  <span>Identificação e nível</span>
                </div>
              </button>

              <button
                type="button"
                className={`billing-stepper-btn ${planStep === 'pricing' ? 'is-active' : ''}`}
                onClick={() => {
                  if (editingCode || (planModal.code.trim() && planModal.name.trim())) {
                    setPlanStep('pricing');
                  } else {
                    addToast({ type: 'info', title: 'Dados do Plano', description: 'Preencha o código e o nome antes de avançar para os ciclos.' });
                  }
                }}
              >
                <span className="billing-stepper-num">2</span>
                <div className="billing-stepper-text">
                  <strong>2. Ciclos & Preços</strong>
                  <span>{planModal.isLifetime ? 'Vitalício (Isento)' : `${planModal.prices.length} ciclo(s)`}</span>
                </div>
              </button>

              <button
                type="button"
                className={`billing-stepper-btn ${planStep === 'quotas' ? 'is-active' : ''}`}
                onClick={() => {
                  if (editingCode || (planModal.code.trim() && planModal.name.trim())) {
                    setPlanStep('quotas');
                  } else {
                    addToast({ type: 'info', title: 'Dados do Plano', description: 'Preencha o código e o nome antes de avançar para as cotas.' });
                  }
                }}
              >
                <span className="billing-stepper-num">3</span>
                <div className="billing-stepper-text">
                  <strong>3. Cotas de Mercado</strong>
                  <span>{planModal.quotaSlots} slots ({planModal.quotaPicks} livres)</span>
                </div>
              </button>
            </div>

            {/* Step 1: Dados do Plano */}
            {planStep === 'general' && (
              <div className="billing-step-content">
                <div className="billing-form-grid-2">
                  <div className="billing-field">
                    <label className="billing-field-label" htmlFor="plan-code-input">
                      Código {editingCode && <span className="billing-tag-readonly">Fixo</span>}
                    </label>
                    <input
                      id="plan-code-input"
                      className="form-input"
                      value={planModal.code}
                      disabled={Boolean(editingCode)}
                      onChange={(event) =>
                        setPlanModal({
                          ...planModal,
                          code: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
                        })
                      }
                      placeholder="ex: basic, pro, vip"
                      required
                    />
                    <span className="billing-field-hint">Chave de URL e APIs (minúsculas, números e hífens).</span>
                  </div>

                  <div className="billing-field">
                    <label className="billing-field-label" htmlFor="plan-name-input">
                      Nome do Plano
                    </label>
                    <input
                      id="plan-name-input"
                      className="form-input"
                      value={planModal.name}
                      onChange={(event) => setPlanModal({ ...planModal, name: event.target.value })}
                      placeholder="ex: KeepGuard Básico"
                      required
                    />
                    <span className="billing-field-hint">Nome visível na contratação e no painel.</span>
                  </div>
                </div>

                <div className="billing-form-grid-2" style={{ marginTop: '1rem' }}>
                  <div className="billing-field">
                    <label className="billing-field-label" htmlFor="plan-level-input">
                      <span>Nível de Hierarquia</span>
                      {planModal.isLifetime && (
                        <span className="billing-tag-readonly">Nível 999 Fixo (Vitalício)</span>
                      )}
                    </label>
                    <input
                      id="plan-level-input"
                      className="form-input"
                      type="number"
                      min={0}
                      value={planModal.isLifetime ? 999 : (planModal.level ?? 0)}
                      disabled={planModal.isLifetime}
                      onChange={(event) =>
                        setPlanModal({
                          ...planModal,
                          level: Math.max(0, parseInt(event.target.value, 10) || 0),
                        })
                      }
                      required
                    />
                    <span className="billing-field-hint">
                      {planModal.isLifetime
                        ? 'Nível especial 999 reservado para acesso vitalício total (fora da escada comercial regular).'
                        : '0 = Básico/Free, 1 = Pro, 2 = Pro+, 3 = Enterprise. Ordem de upgrade.'}
                    </span>
                  </div>

                  <div className="billing-field">
                    <label className="billing-field-label" htmlFor="plan-trial-input">
                      Trial (dias)
                    </label>
                    <div className="billing-input-group">
                      <input
                        id="plan-trial-input"
                        className="billing-input-group-field"
                        type="number"
                        min={0}
                        max={14}
                        value={planModal.trialDays}
                        onChange={(event) =>
                          setPlanModal({
                            ...planModal,
                            trialDays: Math.min(14, Math.max(0, Number(event.target.value) || 0)),
                          })
                        }
                      />
                      <span className="billing-input-group-addon">dias</span>
                    </div>
                    <div className="billing-quick-presets">
                      {[0, 7, 14].map((days) => (
                        <button
                          key={days}
                          type="button"
                          className={`billing-preset-chip ${planModal.trialDays === days ? 'is-active' : ''}`}
                          onClick={() => setPlanModal({ ...planModal, trialDays: days })}
                        >
                          {days === 0 ? 'Sem trial' : `${days} dias`}
                        </button>
                      ))}
                    </div>
                    <span className="billing-field-hint">0 a 14 dias de teste gratuito sem cobrança imediata.</span>
                  </div>
                </div>

                <div className="billing-toggles-card" style={{ marginTop: '1.25rem' }}>
                  <label className="billing-toggle-item">
                    <input
                      type="checkbox"
                      checked={planModal.enabled}
                      onChange={(event) => setPlanModal({ ...planModal, enabled: event.target.checked })}
                    />
                    <div className="billing-toggle-body">
                      <strong>Plano Ativo</strong>
                      <span>Disponível para novas assinaturas no sistema</span>
                    </div>
                  </label>

                  <label className="billing-toggle-item">
                    <input
                      type="checkbox"
                      checked={planModal.isPublic ?? true}
                      disabled={planModal.isLifetime}
                      onChange={(event) => setPlanModal({ ...planModal, isPublic: event.target.checked })}
                    />
                    <div className="billing-toggle-body">
                      <strong>Exibir na Vitrine Pública</strong>
                      <span>Aparece no catálogo de planos para visitantes e clientes</span>
                    </div>
                  </label>

                  <label className="billing-toggle-item">
                    <input
                      type="checkbox"
                      checked={planModal.isLifetime ?? false}
                      onChange={(event) => {
                        const isLifetime = event.target.checked;
                        setPlanModal({
                          ...planModal,
                          isLifetime,
                          level: isLifetime ? 999 : (planModal.level === 999 ? 0 : (planModal.level ?? 0)),
                          isPublic: isLifetime ? false : (planModal.isPublic ?? true),
                          prices: isLifetime
                            ? []
                            : (planModal.prices.length ? planModal.prices : [{ interval: 'month', amountCents: 19900, currency: 'BRL' }]),
                        });
                      }}
                    />
                    <div className="billing-toggle-body">
                      <strong>Plano VIP / Vitalício</strong>
                      <span>Acesso permanente com isenção total de faturas no gateway</span>
                    </div>
                  </label>
                </div>

                {planModal.isLifetime && (
                  <div className="billing-vip-alert">
                    <Crown size={22} className="billing-vip-alert-icon" />
                    <div className="billing-vip-alert-text">
                      <strong>Plano VIP Vitalício Selecionado</strong>
                      <p>Assinantes vinculados a este plano terão acesso irrestrito sem geração de cobranças no Asaas. A etapa de ciclos é dispensada e você já pode salvar o plano diretamente.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Ciclos e Preços */}
            {planStep === 'pricing' && (
              <div className="billing-step-content">
                {planModal.isLifetime ? (
                  <div className="billing-vip-hero">
                    <div className="billing-vip-hero-badge">
                      <Crown size={28} />
                    </div>
                    <h4>Isento de Ciclos Recorrentes</h4>
                    <p>
                      Este plano está configurado como <strong>VIP Vitalício</strong>. Usuários vinculados a ele não recebem cobranças automáticas no gateway de pagamento.
                    </p>
                    <button
                      type="button"
                      className="btn btn-outline btn-pill btn-sm"
                      onClick={() => {
                        setPlanModal({
                          ...planModal,
                          isLifetime: false,
                          prices: [{ interval: 'month', amountCents: 19900, currency: 'BRL' }],
                        });
                      }}
                    >
                      Alterar para Plano Recorrente com Ciclos
                    </button>
                  </div>
                ) : (
                  <div className="billing-pricing-section">
                    <div className="billing-pricing-header">
                      <div>
                        <h4>Ciclos de Faturamento Disponíveis</h4>
                        <p>Selecione as periodicidades que deseja oferecer e informe os respectivos valores em reais.</p>
                      </div>
                    </div>

                    <div className="billing-cycles-grid">
                      {INTERVAL_CONFIGS.map((cfg) => {
                        const price = planModal.prices.find((p) => p.interval === cfg.value);
                        const isSelected = Boolean(price);
                        const monthlyPrice = planModal.prices.find((p) => p.interval === 'month');
                        const monthlyCents = monthlyPrice ? monthlyPrice.amountCents : 0;
                        const expectedCents = monthlyCents * cfg.months;
                        const actualCents = price ? price.amountCents : 0;
                        const discount = cfg.months > 1 && expectedCents > 0 && actualCents > 0 && actualCents < expectedCents
                          ? Math.round(((expectedCents - actualCents) / expectedCents) * 100)
                          : 0;

                        return (
                          <div
                            key={cfg.value}
                            className={`billing-cycle-box ${isSelected ? 'is-selected' : 'is-unselected'}`}
                          >
                            <div className="billing-cycle-top">
                              <label className="billing-cycle-check">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      const defaultCents = cfg.defaultCents;
                                      setPlanModal({
                                        ...planModal,
                                        prices: [...planModal.prices, { interval: cfg.value, amountCents: defaultCents, currency: 'BRL' }],
                                      });
                                    } else {
                                      if (planModal.prices.length <= 1) {
                                        addToast({ type: 'warning', title: 'Ciclos', description: 'O plano precisa ter ao menos um ciclo ativo.' });
                                        return;
                                      }
                                      setPlanModal({
                                        ...planModal,
                                        prices: planModal.prices.filter((p) => p.interval !== cfg.value),
                                      });
                                    }
                                  }}
                                />
                                <span className="billing-cycle-label">{cfg.label}</span>
                              </label>

                              {isSelected && (
                                <span className="billing-cycle-badge-active">
                                  <Check size={12} style={{ marginRight: '3px' }} /> Ativo
                                </span>
                              )}
                            </div>

                            <p className="billing-cycle-desc">{cfg.description}</p>

                            <div className="billing-cycle-footer">
                              {isSelected ? (
                                <div className="billing-cycle-price-control">
                                  <CurrencyInput
                                    valueCents={price!.amountCents}
                                    onChange={(newCents) => {
                                      setPlanModal({
                                        ...planModal,
                                        prices: planModal.prices.map((p) =>
                                          p.interval === cfg.value ? { ...p, amountCents: newCents } : p
                                        ),
                                      });
                                    }}
                                  />
                                  {cfg.months > 1 && price!.amountCents > 0 && (
                                    <div className="billing-cycle-calc-row">
                                      <span className="billing-cycle-calc-monthly">
                                        ≈ {formatMoney(Math.round(price!.amountCents / cfg.months))}/mês
                                      </span>
                                      {discount > 0 && (
                                        <span className="billing-cycle-discount-tag">
                                          {discount}% de economia
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm btn-pill"
                                  onClick={() => {
                                    setPlanModal({
                                      ...planModal,
                                      prices: [...planModal.prices, { interval: cfg.value, amountCents: cfg.defaultCents, currency: 'BRL' }],
                                    });
                                  }}
                                >
                                  + Habilitar Ciclo
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Limites e Cotas de Mercado */}
            {planStep === 'quotas' && (
              <div className="billing-step-content">
                <div className="billing-quotas-form-intro">
                  <div className="billing-title-with-tooltip">
                    <h4>Capacidade da Carteira de Mercado</h4>
                    <InfoHelpTooltip text="Defina o tamanho da carteira que o assinante pode acompanhar e quantos ativos ele escolhe livremente." />
                  </div>
                </div>

                {(() => {
                  const requiredFixed = planModal.quotaSlots - planModal.quotaPicks;
                  const is100Free = requiredFixed === 0;
                  const percentComplete = requiredFixed > 0
                    ? Math.min(100, Math.round((planModal.quotaFixedTickers.length / requiredFixed) * 100))
                    : 100;

                  return (
                    <div>
                      {/* Equação Visual Interativa da Carteira */}
                      <div className="billing-quotas-composition-card">
                        <div className="billing-quotas-equation">
                          <div className="billing-equation-box is-total">
                            <input
                              id="plan-quota-slots"
                              type="number"
                              min={1}
                              max={200}
                              className="billing-equation-input"
                              value={planModal.quotaSlots}
                              onChange={(e) => {
                                const s = Math.max(1, parseInt(e.target.value, 10) || 1);
                                const p = Math.min(planModal.quotaPicks, s);
                                setPlanModal({
                                  ...planModal,
                                  quotaSlots: s,
                                  quotaPicks: p,
                                  quotaFixedTickers: planModal.quotaFixedTickers.slice(0, s - p),
                                });
                              }}
                              title="Capacidade máxima de ativos monitorados pelo usuário"
                              required
                            />
                            <div className="billing-equation-lbl-wrap">
                              <span className="billing-equation-lbl">Slots Totais</span>
                              <InfoHelpTooltip text="Limite máximo de ativos monitorados pelo usuário nesta carteira." />
                            </div>
                          </div>

                          <span className="billing-equation-op">=</span>

                          <div className="billing-equation-box is-picks">
                            <input
                              id="plan-quota-picks"
                              type="number"
                              min={0}
                              max={planModal.quotaSlots}
                              className="billing-equation-input is-picks"
                              value={planModal.quotaPicks}
                              onChange={(e) => {
                                const p = Math.min(
                                  planModal.quotaSlots,
                                  Math.max(0, parseInt(e.target.value, 10) || 0)
                                );
                                setPlanModal({
                                  ...planModal,
                                  quotaPicks: p,
                                  quotaFixedTickers: planModal.quotaFixedTickers.slice(0, planModal.quotaSlots - p),
                                });
                              }}
                              title="Ativos que o cliente escolhe livremente no catálogo"
                              required
                            />
                            <div className="billing-equation-lbl-wrap">
                              <span className="billing-equation-lbl" style={{ color: 'var(--primary, #673de6)' }}>Livre Escolha</span>
                              <InfoHelpTooltip text="Ativos que o cliente escolhe livremente no catálogo de mercado." />
                            </div>
                          </div>

                          <span className="billing-equation-op">+</span>

                          <div className="billing-equation-box is-fixed">
                            <span className="billing-equation-val" style={{ color: 'var(--warning, #b45309)' }}>
                              {requiredFixed}
                            </span>
                            <div className="billing-equation-lbl-wrap">
                              <span className="billing-equation-lbl" style={{ color: 'var(--warning, #b45309)' }}>Fixos da Plataforma</span>
                              <InfoHelpTooltip text="Ativos fixos recomendados obrigatórios configurados pela plataforma (Total menos Livre Escolha)." />
                            </div>
                          </div>
                        </div>

                        {requiredFixed > 0 && (
                          <div className="billing-quotas-progress-box">
                            <div className="billing-quotas-progress-header">
                              <span className="billing-quotas-progress-title">Composição dos Fixos Obrigatórios</span>
                              <span className="billing-quotas-progress-counter">
                                {planModal.quotaFixedTickers.length} de {requiredFixed} cadastrados ({percentComplete}%)
                              </span>
                            </div>
                            <div className="billing-quotas-progress-track">
                              <div
                                className={`billing-quotas-progress-bar ${percentComplete === 100 ? 'is-complete' : ''}`}
                                style={{ width: `${percentComplete}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {is100Free ? (
                        <div className="billing-tickers-empty-hint is-success" style={{ marginTop: '1rem' }}>
                          <CheckCircle2 size={16} />
                          <span>100% Livre Escolha: O assinante poderá escolher todos os {planModal.quotaSlots} ativos livremente.</span>
                        </div>
                      ) : (
                        <TickerPicker
                          id="plan-ticker-picker-input"
                          knownTickers={knownTickers}
                          selectedTickers={planModal.quotaFixedTickers}
                          maxCount={requiredFixed}
                          onAdd={addPlanFixedTicker}
                          onRemove={removePlanFixedTicker}
                          placeholder="Buscar ativo no catálogo (ex: PETR4, HGLG11)..."
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal de Cotas Freemium (Sem Assinatura) */}
      <Modal
        isOpen={editingNoPlan}
        onClose={() => !noPlanBusy && setEditingNoPlan(false)}
        title="Editar Cotas Freemium (Degustação)"
        subtitle="Configuração padrão aplicada aos usuários sem assinatura ativa ou após cancelamento"
        maxWidth="620px"
        footer={(
          <div className="billing-modal-footer">
            <button
              type="button"
              className="btn btn-outline btn-pill"
              onClick={() => setEditingNoPlan(false)}
              disabled={noPlanBusy}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-pill"
              disabled={
                noPlanBusy ||
                noPlanDraft.watchlistSlots < 1 ||
                noPlanDraft.watchlistPicks > noPlanDraft.watchlistSlots ||
                noPlanDraft.fixedTickers.length !== (noPlanDraft.watchlistSlots - noPlanDraft.watchlistPicks)
              }
              onClick={() => void saveNoPlanQuota()}
            >
              {noPlanBusy ? (
                <>
                  <Loader2 size={15} className="billing-spin" style={{ marginRight: '0.35rem' }} />
                  Salvando…
                </>
              ) : (
                'Salvar Cotas Freemium'
              )}
            </button>
          </div>
        )}
      >
        <div className="billing-freemium-edit-dialog">
          <div className="billing-quotas-form-intro" style={{ marginBottom: '1rem' }}>
            <div className="billing-title-with-tooltip">
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Cotas da Carteira Freemium</h4>
              <InfoHelpTooltip text="Configuração padrão de capacidade e picks aplicada aos usuários sem assinatura ativa ou após cancelamento." />
            </div>
          </div>

          {(() => {
            const reqFixed = noPlanDraft.watchlistSlots - noPlanDraft.watchlistPicks;
            const is100Free = reqFixed === 0;
            const percentComplete = reqFixed > 0
              ? Math.min(100, Math.round((noPlanDraft.fixedTickers.length / reqFixed) * 100))
              : 100;

            return (
              <div>
                <div className="billing-quotas-composition-card">
                  <div className="billing-quotas-equation">
                    <div className="billing-equation-box is-total">
                      <input
                        id="noplan-slots-input"
                        type="number"
                        min={1}
                        max={50}
                        className="billing-equation-input"
                        value={noPlanDraft.watchlistSlots}
                        onChange={(e) => {
                          const s = Math.max(1, parseInt(e.target.value, 10) || 1);
                          const p = Math.min(noPlanDraft.watchlistPicks, s);
                          setNoPlanDraft({
                            ...noPlanDraft,
                            watchlistSlots: s,
                            watchlistPicks: p,
                            fixedTickers: noPlanDraft.fixedTickers.slice(0, s - p),
                          });
                        }}
                        title="Total de ativos na carteira gratuita"
                        required
                      />
                      <div className="billing-equation-lbl-wrap">
                        <span className="billing-equation-lbl">Slots Totais</span>
                        <InfoHelpTooltip text="Limite máximo de ativos na carteira gratuita sem assinatura." />
                      </div>
                    </div>

                    <span className="billing-equation-op">=</span>

                    <div className="billing-equation-box is-picks">
                      <input
                        id="noplan-picks-input"
                        type="number"
                        min={0}
                        max={noPlanDraft.watchlistSlots}
                        className="billing-equation-input is-picks"
                        value={noPlanDraft.watchlistPicks}
                        onChange={(e) => {
                          const p = Math.min(noPlanDraft.watchlistSlots, Math.max(0, parseInt(e.target.value, 10) || 0));
                          setNoPlanDraft({
                            ...noPlanDraft,
                            watchlistPicks: p,
                            fixedTickers: noPlanDraft.fixedTickers.slice(0, noPlanDraft.watchlistSlots - p),
                          });
                        }}
                        title="Quantos ativos o usuário escolhe livremente"
                        required
                      />
                      <div className="billing-equation-lbl-wrap">
                        <span className="billing-equation-lbl" style={{ color: 'var(--primary, #673de6)' }}>Livre Escolha</span>
                        <InfoHelpTooltip text="Quantidade de ativos que o usuário sem assinatura pode escolher livremente no catálogo." />
                      </div>
                    </div>

                    <span className="billing-equation-op">+</span>

                    <div className="billing-equation-box is-fixed">
                      <span className="billing-equation-val" style={{ color: 'var(--warning, #b45309)' }}>
                        {reqFixed}
                      </span>
                      <div className="billing-equation-lbl-wrap">
                        <span className="billing-equation-lbl" style={{ color: 'var(--warning, #b45309)' }}>Fixos Degustação</span>
                        <InfoHelpTooltip text="Ativos fixos recomendados e obrigatórios incluídos automaticamente na degustação." />
                      </div>
                    </div>
                  </div>

                  {reqFixed > 0 && (
                    <div className="billing-quotas-progress-box">
                      <div className="billing-quotas-progress-header">
                        <span className="billing-quotas-progress-title">Composição dos Fixos de Degustação</span>
                        <span className="billing-quotas-progress-counter">
                          {noPlanDraft.fixedTickers.length} de {reqFixed} cadastrados ({percentComplete}%)
                        </span>
                      </div>
                      <div className="billing-quotas-progress-track">
                        <div
                          className={`billing-quotas-progress-bar ${percentComplete === 100 ? 'is-complete' : ''}`}
                          style={{ width: `${percentComplete}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {is100Free ? (
                  <div className="billing-tickers-empty-hint is-success" style={{ marginTop: '1rem' }}>
                    <CheckCircle2 size={16} />
                    <span>100% Livre Escolha: Usuários sem plano poderão escolher todos os {noPlanDraft.watchlistSlots} ativos da sua carteira.</span>
                  </div>
                ) : (
                  <TickerPicker
                    id="noplan-ticker-picker-input"
                    knownTickers={knownTickers}
                    selectedTickers={noPlanDraft.fixedTickers}
                    maxCount={reqFixed}
                    onAdd={addNoPlanFixedTicker}
                    onRemove={removeNoPlanFixedTicker}
                    placeholder="Buscar ativo no catálogo (ex: PETR4, HGLG11)..."
                  />
                )}
              </div>
            );
          })()}
        </div>
      </Modal>

      {/* Modal de Detalhes do Plano */}
      <Modal
        isOpen={viewingPlan !== null}
        onClose={() => setViewingPlan(null)}
        title={viewingPlan ? `Plano: ${viewingPlan.name}` : 'Detalhes do Plano'}
        subtitle={viewingPlan ? `Código identificador: ${viewingPlan.code}` : undefined}
        maxWidth="720px"
        footer={(
          <div className="billing-modal-footer">
            <button
              type="button"
              className="btn btn-outline btn-pill"
              onClick={() => setViewingPlan(null)}
            >
              Fechar
            </button>
            {writable && viewingPlan && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-outline-danger btn-pill"
                  onClick={() => {
                    const target = viewingPlan;
                    setViewingPlan(null);
                    setDeletingPlan(target);
                  }}
                >
                  <Trash2 size={15} style={{ marginRight: '0.35rem' }} />
                  Excluir Plano
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-pill"
                  onClick={() => {
                    const target = viewingPlan;
                    setViewingPlan(null);
                    openEditPlan(target);
                  }}
                >
                  <Pencil size={15} style={{ marginRight: '0.35rem' }} />
                  Editar Plano
                </button>
              </div>
            )}
          </div>
        )}
      >
        {viewingPlan && (
          <div className="billing-plan-detail-dialog">
            <div className="billing-detail-grid-4">
              <div className="billing-detail-stat-card">
                <span className="billing-detail-stat-label">Status</span>
                <div className="billing-detail-stat-value">
                  <span className={`billing-status-badge ${viewingPlan.enabled ? 'is-active' : 'is-inactive'}`}>
                    <span className="billing-status-dot" />
                    {viewingPlan.enabled ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>

              <div className="billing-detail-stat-card">
                <span className="billing-detail-stat-label">Nível de Acesso</span>
                <div className="billing-detail-stat-value">
                  {viewingPlan.isLifetime || (viewingPlan.level != null && viewingPlan.level >= 999) ? (
                    <span className="billing-level-tag is-vip">
                      <Crown size={11} style={{ marginRight: '0.25rem' }} />
                      Vitalício
                    </span>
                  ) : (
                    <span className={`billing-level-tag level-${viewingPlan.level ?? 0}`}>
                      Nível {viewingPlan.level ?? 0}
                    </span>
                  )}
                </div>
              </div>

              <div className="billing-detail-stat-card">
                <span className="billing-detail-stat-label">Visibilidade</span>
                <div className="billing-detail-stat-value">
                  {viewingPlan.isPublic === false ? (
                    <span className="billing-tag-meta is-private">
                      <Lock size={10} />
                      Privado
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-main)' }}>Público</span>
                  )}
                </div>
              </div>

              <div className="billing-detail-stat-card">
                <span className="billing-detail-stat-label">Período de Avaliação</span>
                <div className="billing-detail-stat-value">
                  {viewingPlan.trialDays && viewingPlan.trialDays > 0 ? (
                    <span>{viewingPlan.trialDays} dias grátis</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Sem trial</span>
                  )}
                </div>
              </div>
            </div>

            {viewingPlan.isLifetime ? (
              <div className="billing-vip-alert">
                <Crown size={24} className="billing-vip-alert-icon" />
                <div className="billing-vip-alert-text">
                  <strong>Plano VIP Vitalício Isento</strong>
                  <p>
                    Este plano concede acesso permanente sem geração de faturas nem cobranças recorrentes no gateway Asaas.
                  </p>
                </div>
              </div>
            ) : (
              <div className="billing-detail-section">
                <span className="billing-detail-section-title">Ciclos e Preços Configurados</span>
                {!viewingPlan.prices || viewingPlan.prices.length === 0 ? (
                  <div className="table-cell-muted" style={{ padding: '1rem', background: 'var(--bg-surface-elevated)', borderRadius: '8px' }}>
                    Nenhum ciclo de cobrança configurado para este plano.
                  </div>
                ) : (
                  <div className="billing-detail-prices-grid">
                    {INTERVALS.map((cfg) => {
                      const p = viewingPlan.prices.find((pr) => pr.interval === cfg.value);
                      if (!p) return null;
                      const monthPrice = viewingPlan.prices.find((pr) => pr.interval === 'month');
                      const baseMonthly = monthPrice ? monthPrice.amountCents : 0;
                      const monthlyEquivalent = Math.round(p.amountCents / cfg.months);
                      const discount = (baseMonthly > 0 && cfg.months > 1 && monthlyEquivalent < baseMonthly)
                        ? Math.round(((baseMonthly - monthlyEquivalent) / baseMonthly) * 100)
                        : 0;

                      return (
                        <div key={cfg.value} className="billing-detail-price-card">
                          <div className="billing-detail-price-header">
                            <span className="billing-detail-price-interval">{cfg.label}</span>
                          </div>
                          <div className="billing-detail-price-amount">
                            {formatMoney(p.amountCents, p.currency)}
                          </div>
                          {cfg.months > 1 && (
                            <span className="billing-detail-price-monthly">
                              ≈ {formatMoney(monthlyEquivalent, p.currency)}/mês
                            </span>
                          )}
                          {discount > 0 && (
                            <span className="billing-detail-discount-tag">
                              {discount}% de economia
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Seção de Cotas de Mercado */}
            {(() => {
              const q = quotasMap[viewingPlan.code];
              return (
                <div className="billing-detail-section" style={{ marginTop: '1.25rem' }}>
                  <span className="billing-detail-section-title">Limites da Carteira de Mercado</span>
                  {!q ? (
                    <div className="table-cell-muted" style={{ padding: '1rem', background: 'var(--bg-surface-elevated)', borderRadius: '8px' }}>
                      Nenhuma cota específica configurada para este plano. O sistema aplicará os padrões globais.
                    </div>
                  ) : (
                    <div className="billing-detail-quotas-card">
                      <div className="billing-detail-quotas-stats">
                        <div className="billing-detail-quota-stat">
                          <span className="billing-detail-quota-num">{q.watchlistSlots}</span>
                          <span className="billing-detail-quota-label">Slots na Carteira</span>
                        </div>
                        <div className="billing-freemium-metric-divider" />
                        <div className="billing-detail-quota-stat">
                          <span className="billing-detail-quota-num">{q.watchlistPicks}</span>
                          <span className="billing-detail-quota-label">Picks Livres</span>
                        </div>
                        <div className="billing-freemium-metric-divider" />
                        <div className="billing-detail-quota-stat">
                          <span className="billing-detail-quota-num">{(q.fixedTickers || []).length}</span>
                          <span className="billing-detail-quota-label">Ativos Fixos</span>
                        </div>
                      </div>

                      {q.fixedTickers && q.fixedTickers.length > 0 && (
                        <div className="billing-detail-fixed-wrap" style={{ marginTop: '0.75rem' }}>
                          <span className="billing-detail-stat-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                            Ativos Fixos Obrigatórios da Plataforma:
                          </span>
                          <div className="billing-tickers-chips-wrap">
                            {q.fixedTickers.map((t) => (
                              <span key={t} className="billing-ticker-mini-tag is-freemium" style={{ fontSize: '0.85rem', padding: '0.2rem 0.5rem' }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

      {/* Modal de Confirmação de Exclusão */}
      <Modal
        isOpen={deletingPlan !== null}
        onClose={() => !deletingBusy && setDeletingPlan(null)}
        title="Excluir Plano"
        subtitle="Confirmação de remoção permanente"
        maxWidth="500px"
        footer={(
          <div className="billing-modal-footer">
            <button
              type="button"
              className="btn btn-outline btn-pill"
              onClick={() => setDeletingPlan(null)}
              disabled={deletingBusy}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger btn-pill"
              disabled={deletingBusy}
              onClick={() => void confirmDelete()}
            >
              {deletingBusy ? (
                <>
                  <Loader2 size={15} className="billing-spin" style={{ marginRight: '0.35rem' }} />
                  Excluindo…
                </>
              ) : (
                'Sim, Excluir Plano'
              )}
            </button>
          </div>
        )}
      >
        {deletingPlan && (
          <div className="billing-delete-confirm-box">
            <div className="billing-delete-hero">
              <AlertCircle size={24} className="billing-delete-hero-icon" />
              <div className="billing-delete-hero-body">
                <span className="billing-delete-hero-title">Ação irreversível</span>
                <p className="billing-delete-hero-desc">
                  Você tem certeza que deseja excluir o plano <strong>{deletingPlan.name}</strong> (código: <code>{deletingPlan.code}</code>)?
                </p>
              </div>
            </div>

            <div className="billing-delete-rules-notice">
              <strong>Regra de Integridade Financeira:</strong> O sistema não permite excluir planos que já possuam assinaturas ou direitos de acesso concedidos a usuários. Caso este plano já tenha sido utilizado, você pode inativá-lo na edição em vez de excluí-lo.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
