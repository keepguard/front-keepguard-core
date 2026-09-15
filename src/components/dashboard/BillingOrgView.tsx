import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, CreditCard, Crown, Loader2, Pencil, Plus, Search } from 'lucide-react';
import { ListPager } from '../common/ListPager';
import { Modal } from '../common/Modal';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
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
                    <span style={{ color: 'var(--success, #10b981)', fontWeight: 600 }}>
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

function PlansPanel({ writable }: { writable: boolean }) {
  const { isAuthenticated, getAccessToken } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [planModal, setPlanModal] = useState<SaveBillingPlan | null>(null);
  const [planStep, setPlanStep] = useState<'general' | 'pricing'>('general');
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const access = getAccessToken();
    if (!access) return;
    setLoading(true);
    try {
      setPlans(await listBillingPlans(access));
    } catch (error) {
      addToast({ type: 'error', title: 'Planos', description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [addToast, getAccessToken]);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [isAuthenticated, load]);

  const openNewPlan = () => {
    setEditingCode(null);
    setPlanStep('general');
    setPlanModal({ ...EMPTY_PLAN });
  };

  const openEditPlan = (plan: BillingPlan) => {
    setEditingCode(plan.code);
    setPlanStep('general');
    setPlanModal({
      code: plan.code,
      name: plan.name,
      level: plan.level ?? 0,
      enabled: plan.enabled,
      isPublic: plan.isPublic ?? true,
      isLifetime: plan.isLifetime ?? false,
      trialDays: plan.trialDays,
      prices: plan.prices.length
        ? plan.prices.map((p) => ({ ...p }))
        : (plan.isLifetime ? [] : [{ interval: 'month', amountCents: 19900, currency: 'BRL' }]),
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

    setBusy(true);
    try {
      const payload: SaveBillingPlan = {
        ...planModal,
        code: planModal.code.trim(),
        name: planModal.name.trim(),
        level: planModal.level ?? 0,
        prices: planModal.isLifetime ? [] : planModal.prices,
      };

      if (editingCode) {
        await patchBillingPlan(editingCode, payload, access);
      } else {
        await saveBillingPlan(payload, access);
      }
      setPlanModal(null);
      setEditingCode(null);
      setPlanStep('general');
      addToast({ type: 'success', title: 'Plano', description: editingCode ? 'Plano atualizado com sucesso.' : 'Plano cadastrado com sucesso.' });
      await load();
    } catch (error) {
      addToast({ type: 'error', title: 'Plano', description: errorMessage(error) });
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

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table billing-plans-table">
          <thead>
            <tr>
              <th style={{ width: '90px' }}>Nível</th>
              <th style={{ width: '120px' }}>Código</th>
              <th style={{ width: '220px' }}>Nome</th>
              <th style={{ width: '110px' }}>Status</th>
              <th>Preços por Ciclo</th>
              {writable ? <th style={{ width: '60px', textAlign: 'right' }} /> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={writable ? 6 : 5} className="table-cell-muted">Carregando…</td></tr>
            ) : plans.length === 0 ? (
              <tr><td colSpan={writable ? 6 : 5} className="table-cell-muted">Nenhum plano cadastrado.</td></tr>
            ) : plans.map((plan) => (
              <tr key={plan.id}>
                <td>
                  <span className={`billing-level-tag level-${plan.level ?? 0}`}>
                    Nível {plan.level ?? 0}
                  </span>
                </td>
                <td>
                  <code className="billing-code-pill">{plan.code}</code>
                </td>
                <td>
                  <div className="billing-plan-info">
                    <span className="billing-plan-title">{plan.name}</span>
                    <div className="billing-plan-badges">
                      {plan.isLifetime && (
                        <span className="billing-status-pill is-vip" title="Plano VIP vitalício sem cobrança de gateway">
                          <Crown size={11} style={{ marginRight: '0.25rem' }} />
                          VIP / Vitalício
                        </span>
                      )}
                      {plan.isPublic === false && (
                        <span className="billing-status-pill is-private" title="Plano oculto da vitrine de contratação pública">
                          Privado
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`billing-status-badge ${plan.enabled ? 'is-active' : 'is-inactive'}`}>
                    <span className="billing-status-dot" />
                    {plan.enabled ? 'Ativo' : 'Inativo'}
                  </span>
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
                {writable ? (
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn-table-icon"
                      title="Editar plano"
                      onClick={() => openEditPlan(plan)}
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
                if (planStep === 'pricing' && !planModal?.isLifetime) {
                  setPlanStep('general');
                } else {
                  setPlanModal(null);
                  setEditingCode(null);
                  setPlanStep('general');
                }
              }}
              disabled={busy}
            >
              {planStep === 'pricing' && !planModal?.isLifetime ? (
                <>
                  <ArrowLeft size={15} style={{ marginRight: '0.35rem' }} />
                  Voltar aos dados
                </>
              ) : (
                'Cancelar'
              )}
            </button>

            {planStep === 'general' && !planModal?.isLifetime ? (
              <button
                type="button"
                className="btn btn-primary btn-pill"
                onClick={() => {
                  if (!planModal?.code?.trim() || !planModal?.name?.trim()) {
                    addToast({ type: 'warning', title: 'Dados do Plano', description: 'Preencha o código e o nome antes de prosseguir.' });
                    return;
                  }
                  setPlanStep('pricing');
                }}
              >
                Avançar para Ciclos
                <ArrowRight size={15} style={{ marginLeft: '0.35rem' }} />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-pill"
                disabled={busy || (!planModal?.isLifetime && (!planModal?.prices || planModal.prices.length === 0))}
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
                  <strong>1. Dados do Plano</strong>
                  <span>Código, nome, nível e tipo</span>
                </div>
              </button>

              <div className="billing-stepper-divider" />

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
                  <strong>2. Ciclos e Preços</strong>
                  <span>{planModal.isLifetime ? 'Isento (Vitalício)' : `${planModal.prices.length} ciclo(s) ativo(s)`}</span>
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
                      Nível de Hierarquia
                    </label>
                    <input
                      id="plan-level-input"
                      className="form-input"
                      type="number"
                      min={0}
                      value={planModal.level ?? 0}
                      onChange={(event) =>
                        setPlanModal({
                          ...planModal,
                          level: Math.max(0, parseInt(event.target.value, 10) || 0),
                        })
                      }
                      required
                    />
                    <span className="billing-field-hint">0 = Básico/Free, 1 = Pro, 2 = Pro+, 3 = VIP. Ordem de upgrade.</span>
                  </div>

                  <div className="billing-field">
                    <label className="billing-field-label" htmlFor="plan-trial-input">
                      Trial (dias)
                    </label>
                    <div className="billing-input-group">
                      <input
                        id="plan-trial-input"
                        className="form-input"
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
                      <span className="billing-input-affix">dias</span>
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
          </div>
        )}
      </Modal>
    </div>
  );
}
