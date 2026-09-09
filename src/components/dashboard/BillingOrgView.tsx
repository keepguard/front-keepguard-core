import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard, KeyRound, Pencil, Plus, Search } from 'lucide-react';
import { ListPager } from '../common/ListPager';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  getBillingGatewayAccount,
  listBillingPlans,
  patchBillingPlan,
  putBillingGatewayAccount,
  saveBillingPlan,
  searchBillingEntitlements,
  searchBillingInvoices,
  type BillingEntitlement,
  type BillingGatewayAccount,
  type BillingInvoice,
  type BillingPlan,
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
  const { isAuthenticated, getAccessToken, user } = useAuth();
  const writable = canWriteBilling(getAccessToken(), user?.roles);
  const { addToast } = useToast();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [panel, setPanel] = useState<Panel>('transacoes');
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [account, setAccount] = useState<BillingGatewayAccount | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [webhookToken, setWebhookToken] = useState('');
  const [busy, setBusy] = useState(false);

  const token = getAccessToken();

  const loadAccount = useCallback(async () => {
    const access = getAccessToken();
    if (!access) return;
    try {
      setAccount(await getBillingGatewayAccount(access));
    } catch (error) {
      addToast({ type: 'error', title: 'Billing', description: errorMessage(error) });
    }
  }, [addToast, getAccessToken]);

  useEffect(() => {
    if (isAuthenticated && token) {
      void loadAccount();
    }
  }, [isAuthenticated, token, loadAccount]);

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
      setCredentialOpen(false);
      addToast({ type: 'success', title: 'Credencial', description: 'Credencial Asaas gravada.' });
    } catch (error) {
      addToast({ type: 'error', title: 'Credencial', description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
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
            Credencial Asaas, planos, assinantes e transações da organização. Quem opera não assina.
          </p>
        </div>
        <div className="dashboard-top-actions">
          <button
            type="button"
            className="btn btn-outline btn-pill btn-icon-pager"
            onClick={() => setCredentialOpen(true)}
            aria-label="Credencial Asaas"
            title={account?.apiKeyMasked ? `Credencial Asaas ${account.apiKeyMasked}` : 'Credencial Asaas'}
          >
            <KeyRound size={18} />
          </button>
        </div>
      </div>

      {account?.apiKeyMasked ? (
        <p className="table-cell-muted billing-org-mask">
          API key {account.apiKeyMasked}
          {account.webhookConfigured ? ' · webhook configurado' : ' · webhook pendente'}
        </p>
      ) : null}

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
        {panel === 'assinantes' ? <SubscribersPanel /> : null}
        {panel === 'planos' ? <PlansPanel writable={writable} /> : null}
        {panel === 'configuracoes' ? <EntitlementsPanel /> : null}
      </div>

      <Modal
        isOpen={credentialOpen}
        onClose={() => setCredentialOpen(false)}
        title="Credencial Asaas"
        subtitle={writable ? 'A chave completa não volta a ser exibida.' : 'Somente leitura. É preciso billing:write para alterar.'}
        footer={writable ? (
          <button className="btn btn-primary btn-pill" type="submit" form="billing-credential-form" disabled={busy}>
            Salvar credencial
          </button>
        ) : undefined}
      >
        {account ? (
          <p>
            Máscara da API key: <strong>{account.apiKeyMasked}</strong>
            {account.webhookConfigured ? ' · webhook configurado' : ' · webhook pendente'}
          </p>
        ) : (
          <p className="table-cell-muted">Nenhuma credencial cadastrada.</p>
        )}
        <form id="billing-credential-form" className="billing-form" onSubmit={saveCredential}>
          <label>
            API key
            <input
              className="form-input"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              required={writable}
              disabled={!writable}
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
              required={writable}
              disabled={!writable}
            />
          </label>
        </form>
      </Modal>
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
              <th>Id</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="table-cell-muted">Carregando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="table-cell-muted">Nenhuma transação.</td></tr>
            ) : items.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoiceStatusLabel(invoice.status)}</td>
                <td>{formatMoney(invoice.amountCents, invoice.currency)}</td>
                <td>{(invoice.paymentMethod || '—').toUpperCase()}</td>
                <td>{payerLabel(invoice.payerName, invoice.payerEmail, invoice.payerUserId)}</td>
                <td>{formatDate(invoice.dueAt)}</td>
                <td>{invoice.status === 'paid' ? formatDate(invoice.paidAt) : '—'}</td>
                <td title={invoice.id}>{compactId(invoice.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SubscribersPanel() {
  return <EntitlementTable hasPlan qPlaceholder="Usuário, e-mail ou UUID" emptyLabel="Nenhum assinante." />;
}

function EntitlementsPanel() {
  return <EntitlementTable qPlaceholder="Usuário, e-mail ou UUID" emptyLabel="Nenhum entitlement." showAllColumns />;
}

function EntitlementTable({
  hasPlan,
  qPlaceholder,
  emptyLabel,
  showAllColumns = false,
}: {
  hasPlan?: boolean;
  qPlaceholder: string;
  emptyLabel: string;
  showAllColumns?: boolean;
}) {
  const { isAuthenticated, getAccessToken } = useAuth();
  const { addToast } = useToast();
  const [draft, setDraft] = useState({ status: '', planCode: '', q: '' });
  const [applied, setApplied] = useState(draft);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<BillingEntitlement[]>([]);
  const [totalPages, setTotalPages] = useState(1);

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
              {showAllColumns ? <th>Produto</th> : null}
              {showAllColumns ? <th>Carência</th> : null}
              {showAllColumns ? <th>Atualizado</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={showAllColumns ? 8 : 5} className="table-cell-muted">Carregando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={showAllColumns ? 8 : 5} className="table-cell-muted">{emptyLabel}</td></tr>
            ) : items.map((row) => (
              <tr key={`${row.companyId}-${row.userId}`}>
                <td>{payerLabel(row.payerName, row.payerEmail, row.userId)}</td>
                <td>{row.planCode || '—'}</td>
                <td>{intervalLabel(row.interval)}</td>
                <td>{entitlementLabel(row.status)}</td>
                <td>{formatDate(row.currentPeriodEnd)}</td>
                {showAllColumns ? <td>{row.allowsProduct ? 'Liberado' : 'Não'}</td> : null}
                {showAllColumns ? <td>{formatDate(row.graceEndsAt)}</td> : null}
                {showAllColumns ? <td>{formatDate(row.updatedAt)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
              {loading ? (
                <tr><td colSpan={writable ? 5 : 4} className="table-cell-muted">Carregando…</td></tr>
              ) : plans.length === 0 ? (
                <tr><td colSpan={writable ? 5 : 4} className="table-cell-muted">Nenhum plano.</td></tr>
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
            <label className="billing-check">
              <input type="checkbox" checked={planModal.enabled} onChange={(event) => setPlanModal({ ...planModal, enabled: event.target.checked })} />
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
}
