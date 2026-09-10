import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, CreditCard, Crown, Loader2, Pencil, Plus, Search } from 'lucide-react';
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

const INTERVALS = [
  { value: 'month', label: 'Mensal' },
  { value: 'quarter', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'year', label: 'Anual' },
] as const;

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
          <input className="form-input" type="datetime-local" value={draft.to} onChange={(e) => setDraft((f) => ({ ...f, to: e.target.value }))} aria-label="Até" />
          <div className="audits-filter-actions">
            <button type="submit" className="btn btn-secondary btn-pill audits-filter-submit" disabled={loading}>
              <Search size={15} />
              <span>Filtrar</span>
            </button>
          </div>
        </div>
      </form>
      <ListPager loading={loading} page={page} totalPages={totalPages} onPrev={() => setPage((p) => Math.max(0, p - 1))} onNext={() => setPage((p) => p + 1)} />
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

  const connectForm = writable && (items.length === 0 || unusedLinked.length > 0) ? (
    connecting ? (
      <div className="billing-gateway-connect">
        <label htmlFor="billing-gateway-type">
          Tipo
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
    ) : (
      <button className="btn btn-primary btn-pill" type="button" onClick={() => setConnecting(true)}>
        Conectar gateway
      </button>
    )
  ) : null;

  return (
    <div className="billing-gateway-list">
      {items.length === 0 ? (
        <section className="hpanel-table-card billing-card billing-gateway-card">
          <div className="billing-gateway-empty">
            <h2>Nenhum meio de cobrança.</h2>
            <p>Conecte um gateway da organização. O tipo vem antes do formulário.</p>
          </div>
          {connectForm}
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
          {unusedLinked.length > 0 ? (
            <section className="hpanel-table-card billing-card billing-gateway-card">
              {connectForm}
            </section>
          ) : null}
        </>
      )}

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
          <div className="audits-filter-actions">
            <button type="submit" className="btn btn-secondary btn-pill audits-filter-submit" disabled={loading}>
              <Search size={15} />
              <span>Filtrar</span>
            </button>
            {writable && (
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
            )}
          </div>
        </div>
      </form>
      <ListPager loading={loading} page={page} totalPages={totalPages} onPrev={() => setPage((p) => Math.max(0, p - 1))} onNext={() => setPage((p) => p + 1)} />
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

  const submitPlan = async (event: React.FormEvent) => {
    event.preventDefault();
    const access = getAccessToken();
    if (!access || !planModal) return;
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

  return (
    <div>
      <section className="hpanel-table-card billing-card">
        <div className="client-system-create-row">
          <h2>Planos da organização</h2>
          {writable && (
            <button
              type="button"
              className="btn btn-primary btn-pill"
              onClick={() => {
                setEditingCode(null);
                setPlanModal({ ...EMPTY_PLAN });
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
              {loading ? (
                <tr><td colSpan={writable ? 5 : 4} className="table-cell-muted">Carregando…</td></tr>
              ) : plans.length === 0 ? (
                <tr><td colSpan={writable ? 5 : 4} className="table-cell-muted">Nenhum plano.</td></tr>
              ) : plans.map((plan) => (
                <tr key={plan.id}>
                  <td>{plan.code}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span>{plan.name}</span>
                      {plan.isLifetime && (
                        <span className="billing-status-pill is-vip" title="Plano VIP vitalício sem cobrança de gateway">
                          <Crown size={12} style={{ marginRight: '0.25rem' }} />
                          VIP / Vitalício
                        </span>
                      )}
                      {plan.isPublic === false && (
                        <span className="billing-status-pill is-private" title="Plano oculto da vitrine de contratação pública">
                          Privado
                        </span>
                      )}
                    </div>
                  </td>
                  <td>{plan.enabled ? 'Ativo' : 'Inativo'}</td>
                  <td>
                    {plan.isLifetime && plan.prices.length === 0 ? (
                      <span className="table-cell-muted">Isento (Vitalício)</span>
                    ) : (
                      plan.prices.map((price) => `${intervalLabel(price.interval)} ${formatMoney(price.amountCents, price.currency)}`).join(' · ') || '—'
                    )}
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
                            isPublic: plan.isPublic ?? true,
                            isLifetime: plan.isLifetime ?? false,
                            trialDays: plan.trialDays,
                            prices: plan.prices.length ? plan.prices : (plan.isLifetime ? [] : EMPTY_PLAN.prices),
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
              <input className="form-input" value={planModal.code} disabled={Boolean(editingCode)} onChange={(event) => setPlanModal({ ...planModal, code: event.target.value })} required />
            </label>
            <label>
              Nome
              <input className="form-input" value={planModal.name} onChange={(event) => setPlanModal({ ...planModal, name: event.target.value })} required />
            </label>
            <label>
              Trial (dias)
              <input className="form-input" type="number" min={0} value={planModal.trialDays} onChange={(event) => setPlanModal({ ...planModal, trialDays: Number(event.target.value) || 0 })} />
            </label>
            <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.25rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <label className="billing-check">
                <input type="checkbox" checked={planModal.enabled} onChange={(event) => setPlanModal({ ...planModal, enabled: event.target.checked })} />
                Ativo
              </label>
              <label className="billing-check">
                <input
                  type="checkbox"
                  checked={planModal.isPublic ?? true}
                  onChange={(event) => setPlanModal({ ...planModal, isPublic: event.target.checked })}
                />
                Exibir na vitrine pública
              </label>
              <label className="billing-check">
                <input
                  type="checkbox"
                  checked={planModal.isLifetime ?? false}
                  onChange={(event) => {
                    const isLifetime = event.target.checked;
                    setPlanModal({
                      ...planModal,
                      isLifetime,
                      isPublic: isLifetime ? false : (planModal.isPublic ?? true),
                    });
                  }}
                />
                Plano VIP / Vitalício
              </label>
            </div>
            {planModal.isLifetime && (
              <div style={{
                padding: '0.6rem 0.8rem',
                borderRadius: '6px',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                fontSize: '0.82rem',
                color: '#d97706',
                marginBottom: '0.75rem',
              }}>
                <strong>Plano VIP Vitalício:</strong> Assinaturas vinculadas a este plano terão acesso irrestrito ao mercado sem cobranças ou faturas no gateway Asaas. Não é obrigatório cadastrar ciclos de preços.
              </div>
            )}
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
}
