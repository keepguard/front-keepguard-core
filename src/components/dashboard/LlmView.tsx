import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  FlaskConical,
  Pencil,
  Power,
  PowerOff,
  Search,
  Sparkles,
} from 'lucide-react';
import { ListPager } from '../common/ListPager';
import { Modal } from '../common/Modal';
import { RowActionsMenu, useRowActionsMenu } from '../common/RowActionsMenu';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAppliedListUrl } from '../../hooks/useAppliedListUrl';
import {
  completeLlm,
  createLlmAlertRule,
  createLlmProvider,
  getLlmUsage,
  listLlmAlertFirings,
  listLlmAlertRules,
  listLlmProviders,
  searchLlmUsage,
  setLlmAlertRuleEnabled,
  setLlmProviderEnabled,
  updateLlmAlertRule,
  updateLlmProvider,
  type LlmAlertFiring,
  type LlmAlertRule,
  type LlmProvider,
  type LlmUsage,
  type UpsertLlmAlertRule,
  type UpsertLlmProvider,
} from '../../services/llmGatewayService';
import { assertLlmVisibility, canWriteLlm } from '../../utils/roles';

const visibilityFailures = assertLlmVisibility();
if (visibilityFailures.length > 0 && import.meta.env.DEV) {
  console.warn('canReadLlm:', visibilityFailures);
}

type Panel = 'usage' | 'providers' | 'alerts' | 'firings';
type SortKey = 'occurredAt' | 'feature' | 'providerType' | 'model' | 'outcome' | 'totalTokens' | 'sourceService';
type SortDir = 'asc' | 'desc';

type UsageFilters = {
  from: string;
  to: string;
  outcome: string;
  providerType: string;
  model: string;
  feature: string;
  sourceService: string;
  companyId: string;
  sort: '' | SortKey;
  dir: '' | SortDir;
};

type ProviderFilters = {
  name: string;
  providerType: string;
  status: '' | 'active' | 'inactive';
};

type RuleFilters = {
  name: string;
  metric: string;
  status: '' | 'active' | 'inactive';
};

type FiringFilters = {
  from: string;
  to: string;
  ruleName: string;
};

/** Entrada em Uso: mais recentes primeiro (occurredAt desc). */
const DEFAULT_USAGE_FILTERS: UsageFilters = {
  from: '',
  to: '',
  outcome: '',
  providerType: '',
  model: '',
  feature: '',
  sourceService: '',
  companyId: '',
  sort: 'occurredAt',
  dir: 'desc',
};

const EMPTY_PROVIDER_FILTERS: ProviderFilters = {
  name: '',
  providerType: '',
  status: '',
};

const EMPTY_RULE_FILTERS: RuleFilters = {
  name: '',
  metric: '',
  status: '',
};

const EMPTY_FIRING_FILTERS: FiringFilters = {
  from: '',
  to: '',
  ruleName: '',
};

const EMPTY_PROVIDER: UpsertLlmProvider = {
  name: '',
  providerType: 'openai',
  baseUrl: '',
  modelDefault: '',
  apiKeyEnvRef: 'OPENAI_KEEPGUARD_API_KEY',
  enabled: true,
};

const EMPTY_RULE: UpsertLlmAlertRule = {
  name: '',
  metric: 'tokens_total',
  window: '24h',
  threshold: 100000,
  groupBy: 'global',
  enabled: true,
};

function formatDate(isoDate?: string) {
  if (!isoDate) return '—';
  try {
    return new Date(isoDate).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

function payloadString(payload: Record<string, unknown> | undefined, key: string): string {
  const value = payload?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function payloadNumber(payload: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = payload?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** windowKey = `{ruleId}|{slice}|{iso}` — mostra slice + horário legível. */
function formatFiringWindow(windowKey: string, payload?: Record<string, unknown>): string {
  const parts = windowKey.split('|');
  const slice = payloadString(payload, 'slice') || (parts.length >= 2 ? parts[1] : '');
  const iso = parts.length >= 3 ? parts[parts.length - 1] : '';
  const when = iso ? formatDate(iso) : '';
  if (slice && when) return `${slice} · ${when}`;
  if (when) return when;
  if (slice) return slice;
  return windowKey || '—';
}

function firingRuleLabel(item: LlmAlertFiring, rules: LlmAlertRule[]): string {
  const fromPayload = payloadString(item.payload, 'rule_name');
  if (fromPayload) return fromPayload;
  const rule = rules.find((r) => r.id === item.ruleId);
  return rule?.name || item.ruleId;
}

function formatMetricValue(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString('pt-BR') : value.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

function toIso(localValue: string): string | undefined {
  if (!localValue) return undefined;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function outcomeLabel(outcome?: string): string {
  switch ((outcome || '').toUpperCase()) {
    case 'SUCCESS':
      return 'Sucesso';
    case 'FAILURE':
      return 'Falha';
    default:
      return outcome || '—';
  }
}

function outcomeStyle(outcome?: string): React.CSSProperties {
  switch ((outcome || '').toUpperCase()) {
    case 'SUCCESS':
      return { background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' };
    case 'FAILURE':
      return { background: '#fdecea', color: '#c0392b', borderColor: '#f5c6cb' };
    default:
      return {};
  }
}

function formatCost(value?: number) {
  if (value == null || Number.isNaN(value)) return '—';
  return `US$ ${value.toFixed(6)}`;
}

function metricLabel(metric?: string) {
  switch (metric) {
    case 'tokens_total':
      return 'Tokens';
    case 'requests':
      return 'Requisições';
    case 'estimated_cost':
      return 'Custo estimado';
    default:
      return metric || '—';
  }
}

function compareUsage(a: LlmUsage, b: LlmUsage, key: SortKey): number {
  switch (key) {
    case 'occurredAt':
      return new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    case 'totalTokens':
      return a.totalTokens - b.totalTokens;
    case 'feature':
      return (a.feature || '').localeCompare(b.feature || '', 'pt-BR');
    case 'providerType':
      return (a.providerType || '').localeCompare(b.providerType || '', 'pt-BR');
    case 'model':
      return (a.model || '').localeCompare(b.model || '', 'pt-BR');
    case 'outcome':
      return outcomeLabel(a.outcome).localeCompare(outcomeLabel(b.outcome), 'pt-BR');
    case 'sourceService':
      return (a.sourceService || '').localeCompare(b.sourceService || '', 'pt-BR');
    default:
      return 0;
  }
}

function isForbidden(err: { status?: number } | undefined) {
  return err?.status === 403;
}

function matchesText(haystack: string | undefined, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return (haystack || '').toLowerCase().includes(q);
}

function inLocalRange(iso: string | undefined, fromLocal: string, toLocal: string): boolean {
  if (!iso) return !fromLocal && !toLocal;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (fromLocal) {
    const from = new Date(fromLocal).getTime();
    if (!Number.isNaN(from) && t < from) return false;
  }
  if (toLocal) {
    const to = new Date(toLocal).getTime();
    if (!Number.isNaN(to) && t > to) return false;
  }
  return true;
}

const LLM_TABS: ReadonlyArray<{ id: Panel; label: string; tabId: string; panelId: string }> = [
  { id: 'usage', label: 'Uso', tabId: 'llm-tab-usage', panelId: 'llm-panel-usage' },
  { id: 'providers', label: 'Provedores', tabId: 'llm-tab-providers', panelId: 'llm-panel-providers' },
  { id: 'alerts', label: 'Alertas', tabId: 'llm-tab-alerts', panelId: 'llm-panel-alerts' },
  { id: 'firings', label: 'Disparos', tabId: 'llm-tab-firings', panelId: 'llm-panel-firings' },
];

export const LlmView: React.FC = () => {
  const { isAuthenticated, getAccessToken, user } = useAuth();
  const { addToast } = useToast();
  const writable = canWriteLlm(getAccessToken(), user?.roles);
  const [panel, setPanel] = useState<Panel>('usage');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectPanel = (id: Panel, focus = false) => {
    setPanel(id);
    if (!focus) return;
    const index = LLM_TABS.findIndex((tab) => tab.id === id);
    if (index >= 0) tabRefs.current[index]?.focus();
  };

  const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % LLM_TABS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + LLM_TABS.length) % LLM_TABS.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = LLM_TABS.length - 1;
    }

    if (next < 0) return;
    event.preventDefault();
    selectPanel(LLM_TABS[next].id, true);
  };

  const activeTab = LLM_TABS.find((tab) => tab.id === panel) ?? LLM_TABS[0];

  return (
    <div>
      <div className="llm-panel-tabs" role="tablist" aria-label="Seções LLM">
        {LLM_TABS.map((tab, index) => {
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
              onKeyDown={(e) => handleTabKeyDown(e, index)}
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
        {panel === 'usage' ? (
          <UsagePanel isAuthenticated={isAuthenticated} getAccessToken={getAccessToken} addToast={addToast} />
        ) : null}
        {panel === 'providers' ? (
          <ProvidersPanel writable={writable} isAuthenticated={isAuthenticated} getAccessToken={getAccessToken} addToast={addToast} />
        ) : null}
        {panel === 'alerts' ? (
          <AlertsPanel writable={writable} isAuthenticated={isAuthenticated} getAccessToken={getAccessToken} addToast={addToast} />
        ) : null}
        {panel === 'firings' ? (
          <FiringsPanel isAuthenticated={isAuthenticated} getAccessToken={getAccessToken} addToast={addToast} />
        ) : null}
      </div>
    </div>
  );
};

type ToastFn = ReturnType<typeof useToast>['addToast'];

function FilterSubmit({ disabled }: { disabled: boolean }) {
  return (
    <div className="audits-filter-actions">
      <button type="submit" className="btn btn-secondary btn-pill audits-filter-submit" disabled={disabled}>
        <Search size={15} />
        <span>Filtrar</span>
      </button>
    </div>
  );
}

function UsagePanel({
  isAuthenticated,
  getAccessToken,
  addToast,
}: {
  isAuthenticated: boolean;
  getAccessToken: () => string | null;
  addToast: ToastFn;
}) {
  const { filters, setFilters, applied, page, applyFilters, goToPage } = useAppliedListUrl(DEFAULT_USAGE_FILTERS);
  const [items, setItems] = useState<LlmUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [detail, setDetail] = useState<LlmUsage | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const pageRef = useRef(page);
  const appliedRef = useRef(applied);
  const itemsRef = useRef(items);
  pageRef.current = page;
  appliedRef.current = applied;
  itemsRef.current = items;

  const loadPage = useCallback(async (nextPage = pageRef.current, nextFilters = appliedRef.current) => {
    const token = getAccessToken();
    if (!token) return;
    const hasRows = itemsRef.current.length > 0;
    if (hasRows) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await searchLlmUsage(
        {
          page: nextPage,
          size: 20,
          from: toIso(nextFilters.from),
          to: toIso(nextFilters.to),
          outcome: nextFilters.outcome || undefined,
          providerType: nextFilters.providerType.trim() || undefined,
          model: nextFilters.model.trim() || undefined,
          feature: nextFilters.feature.trim() || undefined,
          sourceService: nextFilters.sourceService.trim() || undefined,
          companyId: nextFilters.companyId.trim() || undefined,
          sort: nextFilters.sort || undefined,
          dir: nextFilters.dir || undefined,
        },
        token
      );
      setForbidden(false);
      setItems(result.content || []);
      setTotalPages(Math.max(result.totalPages || 1, 1));
      setSortKey(null);
      setSortDir('asc');
    } catch (err: any) {
      if (isForbidden(err)) {
        setForbidden(true);
        setItems([]);
        addToast({
          type: 'error',
          title: 'Acesso restrito',
          description: 'Somente ADMIN, SYSTEM ou quem tiver llm:read consultam o uso de LLM.',
        });
        return;
      }
      addToast({
        type: 'error',
        title: 'Falha ao consultar uso de LLM',
        description: err?.message || 'Tente novamente em instantes.',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addToast, getAccessToken]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadPage(page, applied);
  }, [applied, isAuthenticated, loadPage, page]);

  const displayedItems = useMemo(() => {
    if (!sortKey) return items;
    const sorted = [...items].sort((a, b) => compareUsage(a, b, sortKey));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [items, sortDir, sortKey]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters(filters);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'occurredAt' || key === 'totalTokens' ? 'desc' : 'asc');
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ChevronsUpDown size={13} />;
    return sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
  };

  const openDetail = async (row: LlmUsage) => {
    const token = getAccessToken();
    if (!token) return;
    setDetailLoading(true);
    try {
      setDetail(await getLlmUsage(row.id, token));
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Falha ao abrir uso',
        description: err?.message || 'Não foi possível carregar o detalhe.',
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const pager = (includeFilter = false) => (
    <ListPager
      loading={loading}
      refreshing={refreshing}
      page={page}
      totalPages={totalPages}
      onPrev={() => goToPage(page - 1)}
      onNext={() => goToPage(page + 1)}
      leading={includeFilter ? <FilterSubmit disabled={loading || refreshing} /> : undefined}
    />
  );

  const emptyMessage = forbidden
    ? 'Sem permissão llm:read para consultar o uso de LLM.'
    : 'Nenhum uso de LLM para os filtros atuais.';

  return (
    <div>
      <form className="audits-toolbar" onSubmit={handleSearch}>
        <div className="audits-filter-row audits-filter-row-primary">
          <input className="form-input" type="datetime-local" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} aria-label="De (opcional)" title="De (opcional)" />
          <input className="form-input" type="datetime-local" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} aria-label="Até (opcional)" title="Até (opcional)" />
          <select className="form-input audits-compact-select" value={filters.outcome} onChange={(e) => setFilters((f) => ({ ...f, outcome: e.target.value }))} aria-label="Resultado">
            <option value="">Todos os resultados</option>
            <option value="SUCCESS">Sucesso</option>
            <option value="FAILURE">Falha</option>
          </select>
        </div>
        <div className="audits-filter-row audits-filter-row-secondary">
          <input className="form-input" placeholder="Provedor (openai, anthropic…)" value={filters.providerType} onChange={(e) => setFilters((f) => ({ ...f, providerType: e.target.value }))} />
          <input className="form-input" placeholder="Modelo" value={filters.model} onChange={(e) => setFilters((f) => ({ ...f, model: e.target.value }))} />
          <input className="form-input" placeholder="Feature" value={filters.feature} onChange={(e) => setFilters((f) => ({ ...f, feature: e.target.value }))} />
        </div>
        <div className="audits-filter-row audits-filter-row-tertiary">
          <input className="form-input" placeholder="Origem (serviço)" value={filters.sourceService} onChange={(e) => setFilters((f) => ({ ...f, sourceService: e.target.value }))} />
          <input className="form-input" placeholder="Company ID" value={filters.companyId} onChange={(e) => setFilters((f) => ({ ...f, companyId: e.target.value }))} />
          <div className="audits-sort-group">
            <select className="form-input audits-sort-select" value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as UsageFilters['sort'], dir: e.target.value ? (f.dir || 'desc') : '' }))} aria-label="Ordenar por">
              <option value="">Ordenar por</option>
              <option value="occurredAt">Quando</option>
              <option value="feature">Feature</option>
              <option value="providerType">Provedor</option>
              <option value="model">Modelo</option>
              <option value="outcome">Resultado</option>
              <option value="totalTokens">Tokens</option>
              <option value="sourceService">Origem</option>
            </select>
            <select className="form-input audits-dir-select" value={filters.dir} onChange={(e) => setFilters((f) => ({ ...f, dir: e.target.value as UsageFilters['dir'] }))} aria-label="Direção">
              <option value="">Direção</option>
              <option value="desc">Mais recentes</option>
              <option value="asc">Mais antigos</option>
            </select>
          </div>
        </div>
        {pager(true)}
      </form>

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th><button type="button" className="th-sort" onClick={() => toggleSort('occurredAt')}>Quando {sortIcon('occurredAt')}</button></th>
              <th><button type="button" className="th-sort" onClick={() => toggleSort('feature')}>Feature {sortIcon('feature')}</button></th>
              <th><button type="button" className="th-sort" onClick={() => toggleSort('providerType')}>Provedor {sortIcon('providerType')}</button></th>
              <th><button type="button" className="th-sort" onClick={() => toggleSort('model')}>Modelo {sortIcon('model')}</button></th>
              <th><button type="button" className="th-sort" onClick={() => toggleSort('totalTokens')}>Tokens {sortIcon('totalTokens')}</button></th>
              <th><button type="button" className="th-sort" onClick={() => toggleSort('outcome')}>Resultado {sortIcon('outcome')}</button></th>
            </tr>
          </thead>
          <tbody>
            {loading && displayedItems.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>Carregando uso de LLM...</td></tr>
            ) : displayedItems.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <Sparkles size={22} />
                    <span>{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              displayedItems.map((row) => (
                <tr key={row.id} onClick={() => openDetail(row)} style={{ cursor: 'pointer' }}>
                  <td>{formatDate(row.occurredAt)}</td>
                  <td><span className="table-cell-title">{row.feature || '—'}</span></td>
                  <td>{row.providerType}</td>
                  <td><span className="id-compact">{row.model || '—'}</span></td>
                  <td>{row.totalTokens}</td>
                  <td><span className="badge-role" style={outcomeStyle(row.outcome)}>{outcomeLabel(row.outcome)}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {displayedItems.map((row) => (
          <button type="button" key={row.id} className="mobile-domain-card" onClick={() => openDetail(row)} style={{ textAlign: 'left', width: '100%', border: 'none', background: 'inherit' }}>
            <div className="mobile-card-top">
              <span className="mobile-domain-name">{row.feature || row.model || 'Uso LLM'}</span>
              <span className="badge-role" style={outcomeStyle(row.outcome)}>{outcomeLabel(row.outcome)}</span>
            </div>
            <div className="mobile-card-subinfo">{formatDate(row.occurredAt)}</div>
            <div className="mobile-card-meta">{row.providerType} · {row.totalTokens} tokens</div>
          </button>
        ))}
      </div>

      {pager(false)}

      <Modal isOpen={!!detail || detailLoading} onClose={() => setDetail(null)} title={detail?.feature || 'Uso de LLM'} subtitle={detail ? formatDate(detail.occurredAt) : 'Carregando...'} maxWidth="640px">
        {detailLoading && !detail ? (
          <p style={{ color: '#5f6368' }}>Carregando detalhe...</p>
        ) : detail ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="info-row"><span className="info-label">Resultado</span><span className="badge-role" style={outcomeStyle(detail.outcome)}>{outcomeLabel(detail.outcome)}</span></div>
            <div className="info-row"><span className="info-label">Provedor</span><span className="info-value">{detail.providerType}</span></div>
            <div className="info-row"><span className="info-label">Modelo</span><span className="info-value text-mono">{detail.model || '—'}</span></div>
            <div className="info-row"><span className="info-label">Tokens</span><span className="info-value">{detail.promptTokens} + {detail.completionTokens} = {detail.totalTokens}</span></div>
            <div className="info-row"><span className="info-label">Custo estimado</span><span className="info-value">{formatCost(detail.estimatedCostUsd)}</span></div>
            <div className="info-row"><span className="info-label">Origem</span><span className="info-value">{detail.sourceService || '—'}</span></div>
            <div className="info-row"><span className="info-label">Latência</span><span className="info-value">{detail.latencyMs} ms</span></div>
            <div className="info-row"><span className="info-label">Company ID</span><span className="info-value text-mono">{detail.companyId || '—'}</span></div>
            <div className="info-row"><span className="info-label">Correlation ID</span><span className="info-value text-mono">{detail.correlationId || '—'}</span></div>
            <div className="info-row"><span className="info-label">Erro</span><span className="info-value">{detail.errorCode || '—'}</span></div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function ProvidersPanel({
  writable,
  isAuthenticated,
  getAccessToken,
  addToast,
}: {
  writable: boolean;
  isAuthenticated: boolean;
  getAccessToken: () => string | null;
  addToast: ToastFn;
}) {
  const [items, setItems] = useState<LlmProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [filters, setFilters] = useState<ProviderFilters>(EMPTY_PROVIDER_FILTERS);
  const [applied, setApplied] = useState<ProviderFilters>(EMPTY_PROVIDER_FILTERS);
  const [form, setForm] = useState<UpsertLlmProvider | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const { openId, setOpenId, menuRef, dropdownRef, run } = useRowActionsMenu();

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      const result = await listLlmProviders(token);
      setForbidden(false);
      setItems(Array.isArray(result) ? result : []);
    } catch (err: any) {
      if (isForbidden(err)) {
        setForbidden(true);
        setItems([]);
        addToast({ type: 'error', title: 'Acesso restrito', description: 'Sem permissão para listar provedores LLM.' });
        return;
      }
      addToast({ type: 'error', title: 'Falha ao listar provedores', description: err?.message || 'Tente novamente.' });
    } finally {
      setLoading(false);
    }
  }, [addToast, getAccessToken]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void load();
  }, [isAuthenticated, load]);

  const displayed = useMemo(() => {
    return items.filter((item) => {
      if (!matchesText(item.name, applied.name)) return false;
      if (!matchesText(item.providerType, applied.providerType)) return false;
      if (applied.status === 'active' && !item.enabled) return false;
      if (applied.status === 'inactive' && item.enabled) return false;
      return true;
    });
  }, [applied, items]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setApplied({ ...filters });
    void load();
  };

  const save = async () => {
    const token = getAccessToken();
    if (!token || !form) return;
    setSaving(true);
    try {
      if (editingId) await updateLlmProvider(editingId, form, token);
      else await createLlmProvider(form, token);
      setForm(null);
      setEditingId(null);
      addToast({ type: 'success', title: editingId ? 'Provedor atualizado' : 'Provedor criado' });
      await load();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Falha ao salvar provedor', description: err?.message || 'Confira o nome e o env ref da key.' });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (item: LlmProvider) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await setLlmProviderEnabled(item.id, !item.enabled, token);
      await load();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Falha ao alterar provedor', description: err?.message || 'Tente novamente.' });
    }
  };

  const testComplete = async (item: LlmProvider) => {
    const token = getAccessToken();
    if (!token) return;
    setTestingId(item.id);
    try {
      const result = await completeLlm({
        providerId: item.id,
        feature: 'ops-test',
        sourceService: 'backoffice',
        maxTokens: 16,
        messages: [{ role: 'user', content: 'Responda só: ok' }],
      }, token);
      addToast({
        type: 'success',
        title: 'Complete registrado',
        description: `${result.model} · ${result.usage?.totalTokens ?? 0} tokens (estimado ${formatCost(result.usage?.estimatedCostUsd)})`,
      });
      await load();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Falha no complete de teste', description: err?.message || 'O uso ainda pode ter sido registrado como falha.' });
    } finally {
      setTestingId(null);
    }
  };

  const emptyMessage = forbidden
    ? 'Sem permissão llm:read para ver provedores.'
    : items.length === 0
      ? 'Nenhum provedor cadastrado.'
      : 'Nenhum provedor para os filtros atuais.';

  return (
    <div>
      {writable ? (
        <div className="client-system-create-row">
          <button type="button" className="btn btn-secondary btn-pill" onClick={() => { setEditingId(null); setForm({ ...EMPTY_PROVIDER }); }}>
            Novo provedor
          </button>
        </div>
      ) : null}
      <form className="audits-toolbar" onSubmit={handleSearch}>
        <div className="audits-filter-row audits-filter-row-primary">
          <input
            className="form-input"
            placeholder="Nome"
            value={filters.name}
            onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
            aria-label="Nome"
          />
          <input
            className="form-input"
            placeholder="Tipo (openai, anthropic…)"
            value={filters.providerType}
            onChange={(e) => setFilters((f) => ({ ...f, providerType: e.target.value }))}
            aria-label="Tipo"
          />
          <select
            className="form-input audits-compact-select"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as ProviderFilters['status'] }))}
            aria-label="Status"
          >
            <option value="">Todos os status</option>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
        </div>
        <div className="audits-filter-actions audits-filter-actions-start">
          <button type="submit" className="btn btn-secondary btn-pill audits-filter-submit" disabled={loading}>
            <Search size={15} />
            <span>Filtrar</span>
          </button>
        </div>
      </form>

      <div className={`hpanel-table-card desktop-table-view${writable ? ' has-sticky-actions' : ''}`}>
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Modelo padrão</th>
              <th>Env da key</th>
              <th>Status</th>
              {writable ? <th className="cell-actions">Ações</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={writable ? 6 : 5} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>Carregando provedores...</td></tr>
            ) : displayed.length === 0 ? (
              <tr>
                <td colSpan={writable ? 6 : 5} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : displayed.map((item) => (
              <tr key={item.id}>
                <td><span className="table-cell-title">{item.name}</span></td>
                <td>{item.providerType}</td>
                <td><span className="id-compact">{item.modelDefault || '—'}</span></td>
                <td><span className="text-mono">{item.apiKeyEnvRef}</span></td>
                <td><span className="badge-role" style={outcomeStyle(item.enabled ? 'SUCCESS' : 'FAILURE')}>{item.enabled ? 'Ativo' : 'Inativo'}</span></td>
                {writable ? (
                  <td className="cell-actions">
                    <RowActionsMenu
                      id={item.id}
                      ariaLabel={`Ações do provedor ${item.name}`}
                      openId={openId}
                      setOpenId={setOpenId}
                      menuRef={menuRef}
                      dropdownRef={dropdownRef}
                      run={run}
                      items={[
                        {
                          id: 'test',
                          label: testingId === item.id ? 'Testando…' : 'Testar complete',
                          icon: <FlaskConical size={15} />,
                          disabled: testingId === item.id || !item.enabled,
                          onSelect: () => { void testComplete(item); },
                        },
                        {
                          id: 'edit',
                          label: 'Editar',
                          icon: <Pencil size={15} />,
                          onSelect: () => {
                            setEditingId(item.id);
                            setForm({
                              name: item.name,
                              providerType: item.providerType,
                              baseUrl: item.baseUrl || '',
                              modelDefault: item.modelDefault || '',
                              apiKeyEnvRef: item.apiKeyEnvRef,
                              enabled: item.enabled,
                            });
                          },
                        },
                        {
                          id: 'toggle',
                          label: item.enabled ? 'Desativar' : 'Ativar',
                          icon: item.enabled ? <PowerOff size={15} /> : <Power size={15} />,
                          onSelect: () => { void toggle(item); },
                        },
                      ]}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!form}
        onClose={() => { setForm(null); setEditingId(null); }}
        title={editingId ? 'Editar provedor' : 'Novo provedor'}
        maxWidth="520px"
        footer={
          <button type="button" className="btn btn-secondary" disabled={saving || !form?.name || !form?.apiKeyEnvRef} onClick={() => void save()}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        }
      >
        {form ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label className="form-label llm-form-field">Nome<input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="form-label llm-form-field">Tipo
              <select className="form-input" value={form.providerType} onChange={(e) => setForm({ ...form, providerType: e.target.value })}>
                <option value="openai">openai</option>
                <option value="anthropic">anthropic</option>
                <option value="google">google</option>
                <option value="ollama">ollama</option>
              </select>
            </label>
            <label className="form-label llm-form-field">Base URL<input className="form-input" value={form.baseUrl || ''} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="opcional" /></label>
            <label className="form-label llm-form-field">Modelo padrão<input className="form-input" value={form.modelDefault || ''} onChange={(e) => setForm({ ...form, modelDefault: e.target.value })} /></label>
            <label className="form-label llm-form-field">Env da API key<input className="form-input" value={form.apiKeyEnvRef} onChange={(e) => setForm({ ...form, apiKeyEnvRef: e.target.value })} placeholder="OPENAI_KEEPGUARD_API_KEY" /></label>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function AlertsPanel({
  writable,
  isAuthenticated,
  getAccessToken,
  addToast,
}: {
  writable: boolean;
  isAuthenticated: boolean;
  getAccessToken: () => string | null;
  addToast: ToastFn;
}) {
  const [rules, setRules] = useState<LlmAlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [filters, setFilters] = useState<RuleFilters>(EMPTY_RULE_FILTERS);
  const [applied, setApplied] = useState<RuleFilters>(EMPTY_RULE_FILTERS);
  const [form, setForm] = useState<UpsertLlmAlertRule | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { openId, setOpenId, menuRef, dropdownRef, run } = useRowActionsMenu();

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      const nextRules = await listLlmAlertRules(token);
      setForbidden(false);
      setRules(Array.isArray(nextRules) ? nextRules : []);
    } catch (err: any) {
      if (isForbidden(err)) {
        setForbidden(true);
        setRules([]);
        addToast({ type: 'error', title: 'Acesso restrito', description: 'Sem permissão para consultar alertas LLM.' });
        return;
      }
      addToast({ type: 'error', title: 'Falha ao carregar alertas', description: err?.message || 'Tente novamente.' });
    } finally {
      setLoading(false);
    }
  }, [addToast, getAccessToken]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void load();
  }, [isAuthenticated, load]);

  const displayed = useMemo(() => {
    return rules.filter((rule) => {
      if (!matchesText(rule.name, applied.name)) return false;
      if (applied.metric && rule.metric !== applied.metric) return false;
      if (applied.status === 'active' && !rule.enabled) return false;
      if (applied.status === 'inactive' && rule.enabled) return false;
      return true;
    });
  }, [applied, rules]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setApplied({ ...filters });
    void load();
  };

  const save = async () => {
    const token = getAccessToken();
    if (!token || !form) return;
    setSaving(true);
    try {
      if (editingId) await updateLlmAlertRule(editingId, form, token);
      else await createLlmAlertRule(form, token);
      setForm(null);
      setEditingId(null);
      addToast({ type: 'success', title: editingId ? 'Regra atualizada' : 'Regra criada' });
      await load();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Falha ao salvar regra', description: err?.message || 'Confira limiar e janela.' });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (rule: LlmAlertRule) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await setLlmAlertRuleEnabled(rule.id, !rule.enabled, token);
      await load();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Falha ao alterar regra', description: err?.message || 'Tente novamente.' });
    }
  };

  const emptyMessage = forbidden
    ? 'Sem permissão llm:read para ver alertas.'
    : rules.length === 0
      ? 'Nenhuma regra de alerta.'
      : 'Nenhuma regra para os filtros atuais.';

  return (
    <div>
      {writable ? (
        <div className="client-system-create-row">
          <button type="button" className="btn btn-secondary btn-pill" onClick={() => { setEditingId(null); setForm({ ...EMPTY_RULE }); }}>
            Nova regra
          </button>
        </div>
      ) : null}
      <form className="audits-toolbar" onSubmit={handleSearch}>
        <div className="audits-filter-row audits-filter-row-primary">
          <input
            className="form-input"
            placeholder="Nome da regra"
            value={filters.name}
            onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
            aria-label="Nome da regra"
          />
          <select
            className="form-input audits-compact-select"
            value={filters.metric}
            onChange={(e) => setFilters((f) => ({ ...f, metric: e.target.value }))}
            aria-label="Métrica"
          >
            <option value="">Todas as métricas</option>
            <option value="tokens_total">Tokens</option>
            <option value="requests">Requisições</option>
            <option value="estimated_cost">Custo estimado</option>
          </select>
          <select
            className="form-input audits-compact-select"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as RuleFilters['status'] }))}
            aria-label="Status"
          >
            <option value="">Todos os status</option>
            <option value="active">Ativa</option>
            <option value="inactive">Inativa</option>
          </select>
        </div>
        <div className="audits-filter-actions audits-filter-actions-start">
          <button type="submit" className="btn btn-secondary btn-pill audits-filter-submit" disabled={loading}>
            <Search size={15} />
            <span>Filtrar</span>
          </button>
        </div>
      </form>

      <div className={`hpanel-table-card desktop-table-view${writable ? ' has-sticky-actions' : ''}`}>
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Métrica</th>
              <th>Janela</th>
              <th>Limiar</th>
              <th>Agrupar</th>
              <th>Status</th>
              {writable ? <th className="cell-actions">Ações</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading && rules.length === 0 ? (
              <tr><td colSpan={writable ? 7 : 6} style={{ textAlign: 'center', padding: '2rem', color: '#5f6368' }}>Carregando regras...</td></tr>
            ) : displayed.length === 0 ? (
              <tr><td colSpan={writable ? 7 : 6} style={{ textAlign: 'center', padding: '2rem', color: '#5f6368' }}>{emptyMessage}</td></tr>
            ) : displayed.map((rule) => (
              <tr key={rule.id}>
                <td><span className="table-cell-title">{rule.name}</span></td>
                <td>{metricLabel(rule.metric)}</td>
                <td>{rule.window}</td>
                <td>{rule.threshold}</td>
                <td>{rule.groupBy}</td>
                <td><span className="badge-role" style={outcomeStyle(rule.enabled ? 'SUCCESS' : 'FAILURE')}>{rule.enabled ? 'Ativa' : 'Inativa'}</span></td>
                {writable ? (
                  <td className="cell-actions">
                    <RowActionsMenu
                      id={rule.id}
                      ariaLabel={`Ações da regra ${rule.name}`}
                      openId={openId}
                      setOpenId={setOpenId}
                      menuRef={menuRef}
                      dropdownRef={dropdownRef}
                      run={run}
                      items={[
                        {
                          id: 'edit',
                          label: 'Editar',
                          icon: <Pencil size={15} />,
                          onSelect: () => {
                            setEditingId(rule.id);
                            setForm({
                              name: rule.name,
                              metric: rule.metric,
                              window: rule.window,
                              threshold: rule.threshold,
                              groupBy: rule.groupBy,
                              enabled: rule.enabled,
                            });
                          },
                        },
                        {
                          id: 'toggle',
                          label: rule.enabled ? 'Desativar' : 'Ativar',
                          icon: rule.enabled ? <PowerOff size={15} /> : <Power size={15} />,
                          onSelect: () => { void toggle(rule); },
                        },
                      ]}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!form}
        onClose={() => { setForm(null); setEditingId(null); }}
        title={editingId ? 'Editar regra' : 'Nova regra'}
        maxWidth="520px"
        footer={
          <button type="button" className="btn btn-secondary" disabled={saving || !form?.name} onClick={() => void save()}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        }
      >
        {form ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label className="form-label llm-form-field">Nome<input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="form-label llm-form-field">Métrica
              <select className="form-input" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
                <option value="tokens_total">tokens_total</option>
                <option value="requests">requests</option>
                <option value="estimated_cost">estimated_cost</option>
              </select>
            </label>
            <label className="form-label llm-form-field">Janela
              <select className="form-input" value={form.window} onChange={(e) => setForm({ ...form, window: e.target.value })}>
                <option value="1h">1h</option>
                <option value="24h">24h</option>
                <option value="7d">7d</option>
              </select>
            </label>
            <label className="form-label llm-form-field">Limiar<input className="form-input" type="number" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} /></label>
            <label className="form-label llm-form-field">Agrupar
              <select className="form-input" value={form.groupBy} onChange={(e) => setForm({ ...form, groupBy: e.target.value })}>
                <option value="global">global</option>
                <option value="company">company</option>
                <option value="feature">feature</option>
                <option value="provider">provider</option>
              </select>
            </label>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function FiringsPanel({
  isAuthenticated,
  getAccessToken,
  addToast,
}: {
  isAuthenticated: boolean;
  getAccessToken: () => string | null;
  addToast: ToastFn;
}) {
  const [rules, setRules] = useState<LlmAlertRule[]>([]);
  const [items, setItems] = useState<LlmAlertFiring[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [filters, setFilters] = useState<FiringFilters>(EMPTY_FIRING_FILTERS);
  const [applied, setApplied] = useState<FiringFilters>(EMPTY_FIRING_FILTERS);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const load = useCallback(async (nextPage: number) => {
    const token = getAccessToken();
    if (!token) return;
    const hasRows = itemsRef.current.length > 0;
    if (hasRows) setRefreshing(true);
    else setLoading(true);
    try {
      const [nextRules, nextFirings] = await Promise.all([
        listLlmAlertRules(token),
        listLlmAlertFirings({ page: nextPage, size: 20 }, token),
      ]);
      setForbidden(false);
      setRules(Array.isArray(nextRules) ? nextRules : []);
      // API já ordena por fired_at DESC (mais recentes primeiro).
      setItems(nextFirings.content || []);
      setTotalPages(Math.max(nextFirings.totalPages || 1, 1));
      setPage(nextFirings.page ?? nextPage);
    } catch (err: any) {
      if (isForbidden(err)) {
        setForbidden(true);
        setRules([]);
        setItems([]);
        addToast({ type: 'error', title: 'Acesso restrito', description: 'Sem permissão para consultar disparos LLM.' });
        return;
      }
      addToast({ type: 'error', title: 'Falha ao carregar disparos', description: err?.message || 'Tente novamente.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addToast, getAccessToken]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void load(0);
  }, [isAuthenticated, load]);

  const displayed = useMemo(() => {
    return items.filter((item) => {
      const label = firingRuleLabel(item, rules);
      if (!matchesText(label, applied.ruleName) && !matchesText(item.ruleId, applied.ruleName)) return false;
      if (!inLocalRange(item.firedAt, applied.from, applied.to)) return false;
      return true;
    });
  }, [applied, items, rules]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setApplied({ ...filters });
    void load(0);
  };

  const emptyMessage = forbidden
    ? 'Sem permissão llm:read para ver disparos.'
    : items.length === 0
      ? 'Nenhum disparo registrado.'
      : 'Nenhum disparo para os filtros atuais.';

  return (
    <div>
      <form className="audits-toolbar" onSubmit={handleSearch}>
        <div className="audits-filter-row audits-filter-row-primary">
          <input
            className="form-input"
            type="datetime-local"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            aria-label="De (opcional)"
            title="De (opcional)"
          />
          <input
            className="form-input"
            type="datetime-local"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            aria-label="Até (opcional)"
            title="Até (opcional)"
          />
          <input
            className="form-input"
            placeholder="Nome da regra"
            value={filters.ruleName}
            onChange={(e) => setFilters((f) => ({ ...f, ruleName: e.target.value }))}
            aria-label="Nome da regra"
          />
        </div>
        <ListPager
          loading={loading}
          refreshing={refreshing}
          page={page}
          totalPages={totalPages}
          onPrev={() => { void load(page - 1); }}
          onNext={() => { void load(page + 1); }}
          leading={<FilterSubmit disabled={loading || refreshing} />}
        />
      </form>

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Regra</th>
              <th>Janela</th>
              <th>Valor</th>
              <th>Limiar</th>
              <th>Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#5f6368' }}>Carregando disparos...</td></tr>
            ) : displayed.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#5f6368' }}>{emptyMessage}</td></tr>
            ) : displayed.map((item) => {
              const requests = payloadNumber(item.payload, 'requests');
              return (
                <tr key={item.id}>
                  <td>{formatDate(item.firedAt)}</td>
                  <td><span className="table-cell-title">{firingRuleLabel(item, rules)}</span></td>
                  <td>{formatFiringWindow(item.windowKey, item.payload)}</td>
                  <td>{formatMetricValue(item.metricValue)}</td>
                  <td>{formatMetricValue(item.threshold)}</td>
                  <td style={{ color: '#5f6368', fontSize: '0.9rem' }}>
                    {requests != null ? `${requests.toLocaleString('pt-BR')} req` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ListPager
        loading={loading}
        refreshing={refreshing}
        page={page}
        totalPages={totalPages}
        onPrev={() => { void load(page - 1); }}
        onNext={() => { void load(page + 1); }}
      />
    </div>
  );
}
