import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  FlaskConical,
  MoreVertical,
  Pencil,
  Power,
  PowerOff,
  Search,
  Sparkles,
} from 'lucide-react';
import { ListPager } from '../common/ListPager';
import { Modal } from '../common/Modal';
import { RefreshCombo } from '../common/RefreshCombo';
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

type Panel = 'usage' | 'providers' | 'alerts';
type SortKey = 'occurredAt' | 'feature' | 'providerType' | 'model' | 'outcome' | 'totalTokens' | 'sourceService';
type SortDir = 'asc' | 'desc';

type Filters = {
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

const EMPTY_FILTERS: Filters = {
  from: '',
  to: '',
  outcome: '',
  providerType: '',
  model: '',
  feature: '',
  sourceService: '',
  companyId: '',
  sort: '',
  dir: '',
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
  return err?.status === 401 || err?.status === 403;
}

type RowMenuItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onSelect: () => void;
};

function useRowActionsMenu() {
  const [openId, setOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openId) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpenId(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null);
    };
    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openId]);

  const close = () => setOpenId(null);
  const run = (event: React.SyntheticEvent, action: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    close();
    action();
  };

  return { openId, setOpenId, menuRef, dropdownRef, run };
}

function RowActionsMenu({
  id,
  ariaLabel,
  openId,
  setOpenId,
  menuRef,
  dropdownRef,
  run,
  items,
}: {
  id: string;
  ariaLabel: string;
  openId: string | null;
  setOpenId: React.Dispatch<React.SetStateAction<string | null>>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  run: (event: React.SyntheticEvent, action: () => void) => void;
  items: RowMenuItem[];
}) {
  const isOpen = openId === id;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) {
      setCoords(null);
      return;
    }
    const place = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const menuHeight = dropdownRef.current?.offsetHeight ?? 0;
      const gap = 4;
      let top = rect.bottom + gap;
      if (menuHeight && top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - gap - menuHeight);
      }
      setCoords({
        top,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [dropdownRef, isOpen, items]);

  return (
    <div
      className="table-actions-menu"
      ref={isOpen ? menuRef : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        ref={buttonRef}
        className="btn-table-icon"
        title="Ações"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpenId((prev) => (prev === id ? null : id));
        }}
      >
        <MoreVertical size={15} />
      </button>
      {isOpen
        ? createPortal(
            <div
              ref={dropdownRef}
              className="table-actions-dropdown is-portal"
              role="menu"
              style={{
                top: coords?.top ?? 0,
                right: coords?.right ?? 8,
                visibility: coords ? 'visible' : 'hidden',
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="table-actions-menu-item"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={(e) => run(e, item.onSelect)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export const LlmView: React.FC = () => {
  const { isAuthenticated, getAccessToken, user } = useAuth();
  const { addToast } = useToast();
  const writable = canWriteLlm(getAccessToken(), user?.roles);
  const [panel, setPanel] = useState<Panel>('usage');

  return (
    <div>
      <div className="llm-panel-tabs" role="tablist" aria-label="Seções LLM">
        {([
          ['usage', 'Uso'],
          ['providers', 'Provedores'],
          ['alerts', 'Alertas'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={panel === id}
            className={`btn btn-pill ${panel === id ? 'btn-secondary' : 'btn-outline'}`}
            onClick={() => setPanel(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {panel === 'usage' ? (
        <UsagePanel writable={writable} isAuthenticated={isAuthenticated} getAccessToken={getAccessToken} addToast={addToast} />
      ) : null}
      {panel === 'providers' ? (
        <ProvidersPanel writable={writable} isAuthenticated={isAuthenticated} getAccessToken={getAccessToken} addToast={addToast} />
      ) : null}
      {panel === 'alerts' ? (
        <AlertsPanel writable={writable} isAuthenticated={isAuthenticated} getAccessToken={getAccessToken} addToast={addToast} />
      ) : null}
    </div>
  );
};

type ToastFn = ReturnType<typeof useToast>['addToast'];

function UsagePanel({
  isAuthenticated,
  getAccessToken,
  addToast,
}: {
  writable: boolean;
  isAuthenticated: boolean;
  getAccessToken: () => string | null;
  addToast: ToastFn;
}) {
  const { filters, setFilters, applied, page, applyFilters, goToPage } = useAppliedListUrl(EMPTY_FILTERS);
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

  const filterActions = (
    <div className="audits-filter-actions">
      <button type="submit" className="btn btn-secondary btn-pill audits-filter-submit" disabled={loading || refreshing}>
        <Search size={15} />
        <span>Filtrar</span>
      </button>
      <RefreshCombo
        onRefresh={() => void loadPage(pageRef.current, appliedRef.current)}
        disabled={loading || refreshing}
        refreshing={refreshing}
      />
    </div>
  );

  const pager = (includeFilter = false) => (
    <ListPager
      loading={loading}
      refreshing={refreshing}
      page={page}
      totalPages={totalPages}
      onPrev={() => goToPage(page - 1)}
      onNext={() => goToPage(page + 1)}
      leading={includeFilter ? filterActions : undefined}
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
            <select className="form-input audits-sort-select" value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as Filters['sort'], dir: e.target.value ? f.dir : '' }))} aria-label="Ordenar por">
              <option value="">Ordenar por</option>
              <option value="occurredAt">Quando</option>
              <option value="feature">Feature</option>
              <option value="providerType">Provedor</option>
              <option value="model">Modelo</option>
              <option value="outcome">Resultado</option>
              <option value="totalTokens">Tokens</option>
              <option value="sourceService">Origem</option>
            </select>
            <select className="form-input audits-dir-select" value={filters.dir} onChange={(e) => setFilters((f) => ({ ...f, dir: e.target.value as Filters['dir'] }))} aria-label="Direção">
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

  return (
    <div>
      <div className="audits-toolbar">
        <div className="audits-filter-row" style={{ gridTemplateColumns: '1fr auto' }}>
          <p style={{ margin: 0, color: '#5f6368', fontSize: '0.9rem' }}>
            Keys ficam no Secret; a API devolve só o nome do env (`apiKeyEnvRef`), nunca a chave.
          </p>
          {writable ? (
            <button type="button" className="btn btn-secondary btn-pill" onClick={() => { setEditingId(null); setForm({ ...EMPTY_PROVIDER }); }}>
              Novo provedor
            </button>
          ) : null}
        </div>
      </div>
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
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={writable ? 6 : 5} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  {forbidden ? 'Sem permissão llm:read para ver provedores.' : 'Nenhum provedor cadastrado.'}
                </td>
              </tr>
            ) : items.map((item) => (
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
  const [firings, setFirings] = useState<LlmAlertFiring[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [form, setForm] = useState<UpsertLlmAlertRule | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { openId, setOpenId, menuRef, dropdownRef, run } = useRowActionsMenu();

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      const [nextRules, nextFirings] = await Promise.all([
        listLlmAlertRules(token),
        listLlmAlertFirings({ page: 0, size: 20 }, token),
      ]);
      setForbidden(false);
      setRules(Array.isArray(nextRules) ? nextRules : []);
      setFirings(nextFirings.content || []);
    } catch (err: any) {
      if (isForbidden(err)) {
        setForbidden(true);
        setRules([]);
        setFirings([]);
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

  return (
    <div>
      <div className="audits-toolbar">
        <div className="audits-filter-row" style={{ gridTemplateColumns: '1fr auto auto' }}>
          <p style={{ margin: 0, color: '#5f6368', fontSize: '0.9rem' }}>
            Disparos ficam só na plataforma. Sem e-mail ou Telegram neste MVP.
          </p>
          <RefreshCombo onRefresh={() => void load()} disabled={loading} refreshing={loading} />
          {writable ? (
            <button type="button" className="btn btn-secondary btn-pill" onClick={() => { setEditingId(null); setForm({ ...EMPTY_RULE }); }}>
              Nova regra
            </button>
          ) : null}
        </div>
      </div>

      <h2 className="dashboard-subtitle" style={{ margin: '0 0 0.75rem' }}>Regras</h2>
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
            ) : rules.length === 0 ? (
              <tr><td colSpan={writable ? 7 : 6} style={{ textAlign: 'center', padding: '2rem', color: '#5f6368' }}>{forbidden ? 'Sem permissão llm:read para ver alertas.' : 'Nenhuma regra de alerta.'}</td></tr>
            ) : rules.map((rule) => (
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

      <h2 className="dashboard-subtitle" style={{ margin: '1.25rem 0 0.75rem' }}>Disparos</h2>
      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Regra</th>
              <th>Janela</th>
              <th>Valor</th>
              <th>Limiar</th>
            </tr>
          </thead>
          <tbody>
            {firings.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#5f6368' }}>Nenhum disparo registrado.</td></tr>
            ) : firings.map((item) => (
              <tr key={item.id}>
                <td>{formatDate(item.firedAt)}</td>
                <td><span className="id-compact">{item.ruleId}</span></td>
                <td><span className="id-compact">{item.windowKey}</span></td>
                <td>{item.metricValue}</td>
                <td>{item.threshold}</td>
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
