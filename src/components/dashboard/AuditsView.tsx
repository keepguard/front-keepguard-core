import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, RefreshCw, ScrollText, Search } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getAudit, searchAudits, type AuditDetail, type AuditEvent } from '../../services/auditService';
import { assertAuditReadVisibility } from '../../utils/roles';

const visibilityFailures = assertAuditReadVisibility();
if (visibilityFailures.length > 0 && import.meta.env.DEV) {
  console.warn('canReadAudits:', visibilityFailures);
}

type SortKey = 'occurredAt' | 'actor' | 'action' | 'resource' | 'outcome' | 'sourceService';
type SortDir = 'asc' | 'desc';
type IntervalPreset = '5s' | '30s' | '1m' | 'custom';

const INTERVAL_MS: Record<Exclude<IntervalPreset, 'custom'>, number> = {
  '5s': 5_000,
  '30s': 30_000,
  '1m': 60_000,
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

function compactId(value?: string): string {
  if (!value) return '—';
  const trimmed = value.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
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
    case 'DENIED':
      return 'Negado';
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
    case 'DENIED':
      return { background: '#fff4e5', color: '#b36b00', borderColor: '#ffe0b2' };
    default:
      return {};
  }
}

function actorSortValue(event: AuditEvent): string {
  return (event.actor?.codeUser || event.actor?.type || '').toLowerCase();
}

function resourceSortValue(event: AuditEvent): string {
  return `${event.resource?.type || ''} ${event.resource?.id || ''}`.trim().toLowerCase();
}

function compareEvents(a: AuditEvent, b: AuditEvent, key: SortKey): number {
  switch (key) {
    case 'occurredAt':
      return new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    case 'actor':
      return actorSortValue(a).localeCompare(actorSortValue(b), 'pt-BR');
    case 'action':
      return (a.action || '').localeCompare(b.action || '', 'pt-BR');
    case 'resource':
      return resourceSortValue(a).localeCompare(resourceSortValue(b), 'pt-BR');
    case 'outcome':
      return outcomeLabel(a.outcome).localeCompare(outcomeLabel(b.outcome), 'pt-BR');
    case 'sourceService':
      return (a.sourceService || '').localeCompare(b.sourceService || '', 'pt-BR');
    default:
      return 0;
  }
}

type Filters = {
  from: string;
  to: string;
  outcome: string;
  actorCodeUser: string;
  action: string;
  resourceType: string;
  resourceId: string;
  correlationId: string;
  sourceService: string;
  sort: '' | SortKey;
  dir: '' | SortDir;
};

function isAlphaSort(sort: Filters['sort']) {
  return sort === 'actor' || sort === 'action' || sort === 'resource' || sort === 'outcome' || sort === 'sourceService';
}

const AuditPager: React.FC<{
  loading: boolean;
  refreshing: boolean;
  page: number;
  totalPages: number;
  totalElements: number;
  onPrev: () => void;
  onNext: () => void;
}> = ({ loading, refreshing, page, totalPages, totalElements, onPrev, onNext }) => (
  <div className="audits-pager">
    <span className="audits-pager-meta">
      {totalElements} evento{totalElements === 1 ? '' : 's'} · página {page + 1} de {totalPages}
      {refreshing ? ' · atualizando…' : ''}
    </span>
    <div className="audits-pager-actions">
      <button
        type="button"
        className="btn btn-outline btn-pill btn-icon-pager"
        disabled={loading || refreshing || page <= 0}
        onClick={onPrev}
        aria-label="Página anterior"
        title="Página anterior"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        type="button"
        className="btn btn-outline btn-pill btn-icon-pager"
        disabled={loading || refreshing || page >= totalPages - 1}
        onClick={onNext}
        aria-label="Próxima página"
        title="Próxima página"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  </div>
);

export const AuditsView: React.FC = () => {
  const { accessToken } = useAuth();
  const { addToast } = useToast();
  const [filters, setFilters] = useState<Filters>({
    from: '',
    to: '',
    outcome: '',
    actorCodeUser: '',
    action: '',
    resourceType: '',
    resourceId: '',
    correlationId: '',
    sourceService: '',
    sort: '',
    dir: '',
  });
  const [applied, setApplied] = useState<Filters>(filters);
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [refreshMenuOpen, setRefreshMenuOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [intervalPreset, setIntervalPreset] = useState<IntervalPreset>('30s');
  const [customSeconds, setCustomSeconds] = useState(10);

  const token = accessToken || localStorage.getItem('keepguard_access_token') || '';
  const refreshMenuRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(page);
  const appliedRef = useRef(applied);
  const itemsRef = useRef(items);
  pageRef.current = page;
  appliedRef.current = applied;
  itemsRef.current = items;

  const loadPage = useCallback(async (nextPage = pageRef.current, nextFilters = appliedRef.current) => {
    if (!token) return;
    const hasRows = itemsRef.current.length > 0;
    if (hasRows) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const result = await searchAudits(
        {
          page: nextPage,
          size: 20,
          from: toIso(nextFilters.from),
          to: toIso(nextFilters.to),
          outcome: nextFilters.outcome || undefined,
          actorCodeUser: nextFilters.actorCodeUser.trim() || undefined,
          action: nextFilters.action.trim() || undefined,
          resourceType: nextFilters.resourceType.trim() || undefined,
          resourceId: nextFilters.resourceId.trim() || undefined,
          correlationId: nextFilters.correlationId.trim() || undefined,
          sourceService: nextFilters.sourceService.trim() || undefined,
          sort: nextFilters.sort || undefined,
          dir: nextFilters.dir || undefined,
        },
        token
      );
      setItems(result.content || []);
      setPage(result.page ?? nextPage);
      setTotalPages(Math.max(result.totalPages || 1, 1));
      setTotalElements(result.totalElements || 0);
      setSortKey(null);
      setSortDir('asc');
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        addToast({
          type: 'error',
          title: 'Acesso restrito',
          description: 'Somente ADMIN, SYSTEM ou quem tiver audit:read consultam a auditoria.',
        });
        return;
      }
      addToast({
        type: 'error',
        title: 'Falha ao consultar auditoria',
        description: err?.message || 'Tente novamente em instantes.',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addToast, token]);

  useEffect(() => {
    loadPage(0, applied);
  }, [accessToken]);

  useEffect(() => {
    if (!refreshMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (refreshMenuRef.current && !refreshMenuRef.current.contains(event.target as Node)) {
        setRefreshMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRefreshMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [refreshMenuOpen]);

  const refreshIntervalMs = useMemo(() => {
    if (intervalPreset === 'custom') {
      const seconds = Number(customSeconds);
      return Number.isFinite(seconds) && seconds >= 3 ? seconds * 1000 : 10_000;
    }
    return INTERVAL_MS[intervalPreset];
  }, [customSeconds, intervalPreset]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void loadPage(pageRef.current, appliedRef.current);
    }, refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadPage, refreshIntervalMs]);

  const displayedItems = useMemo(() => {
    if (!sortKey) return items;
    const sorted = [...items].sort((a, b) => compareEvents(a, b, sortKey));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [items, sortDir, sortKey]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setApplied(filters);
    loadPage(0, filters);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'occurredAt' ? 'desc' : 'asc');
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ChevronsUpDown size={13} />;
    return sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
  };

  const openDetail = async (event: AuditEvent) => {
    if (!token) return;
    setDetailLoading(true);
    try {
      const full = await getAudit(event.eventId, token);
      setDetail(full);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Falha ao abrir evento',
        description: err?.message || 'Não foi possível carregar o detalhe.',
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const applyCorrelation = (correlationId: string) => {
    const next = { ...filters, correlationId };
    setFilters(next);
    setApplied(next);
    setDetail(null);
    loadPage(0, next);
  };

  const pager = (
    <AuditPager
      loading={loading}
      refreshing={refreshing}
      page={page}
      totalPages={totalPages}
      totalElements={totalElements}
      onPrev={() => loadPage(page - 1, applied)}
      onNext={() => loadPage(page + 1, applied)}
    />
  );

  return (
    <div>
      <form className="audits-toolbar" onSubmit={handleSearch}>
        <div className="audits-filter-row">
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
          <select
            className="form-input"
            value={filters.outcome}
            onChange={(e) => setFilters((f) => ({ ...f, outcome: e.target.value }))}
            aria-label="Resultado"
          >
            <option value="">Todos os resultados</option>
            <option value="SUCCESS">Sucesso</option>
            <option value="FAILURE">Falha</option>
            <option value="DENIED">Negado</option>
          </select>
          <div className="search-input-wrapper audits-search-field">
            <Search size={16} className="search-icon" />
            <input
              className="search-input"
              placeholder="Quem fez (codeUser)"
              value={filters.actorCodeUser}
              onChange={(e) => setFilters((f) => ({ ...f, actorCodeUser: e.target.value }))}
            />
          </div>
          <input
            className="form-input"
            placeholder="Ação"
            value={filters.action}
            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
          />
          <input
            className="form-input"
            placeholder="Tipo do recurso"
            value={filters.resourceType}
            onChange={(e) => setFilters((f) => ({ ...f, resourceType: e.target.value }))}
          />
        </div>
        <div className="audits-filter-row audits-filter-row-tools">
          <input
            className="form-input"
            placeholder="ID do recurso"
            value={filters.resourceId}
            onChange={(e) => setFilters((f) => ({ ...f, resourceId: e.target.value }))}
          />
          <input
            className="form-input"
            placeholder="Correlation ID"
            value={filters.correlationId}
            onChange={(e) => setFilters((f) => ({ ...f, correlationId: e.target.value }))}
          />
          <input
            className="form-input"
            placeholder="Origem"
            value={filters.sourceService}
            onChange={(e) => setFilters((f) => ({ ...f, sourceService: e.target.value }))}
          />
          <select
            className="form-input"
            value={filters.sort}
            onChange={(e) => {
              const sort = e.target.value as Filters['sort'];
              setFilters((f) => ({ ...f, sort, dir: sort ? f.dir : '' }));
            }}
            aria-label="Ordenar por (opcional)"
            title="Ordenar por (opcional)"
          >
            <option value="">Ordenar por</option>
            <option value="occurredAt">Quando</option>
            <option value="actor">Quem</option>
            <option value="action">Ação</option>
            <option value="resource">Recurso</option>
            <option value="outcome">Resultado</option>
            <option value="sourceService">Origem</option>
          </select>
          <select
            className="form-input audits-dir-select"
            value={filters.dir}
            onChange={(e) => setFilters((f) => ({ ...f, dir: e.target.value as Filters['dir'] }))}
            aria-label="Direção da ordem (opcional)"
            title="Direção da ordem (opcional)"
          >
            <option value="">Direção</option>
            {isAlphaSort(filters.sort) ? (
              <>
                <option value="asc">A–Z / crescente</option>
                <option value="desc">Z–A / decrescente</option>
              </>
            ) : (
              <>
                <option value="desc">Mais recentes</option>
                <option value="asc">Mais antigos</option>
              </>
            )}
          </select>
          <div className="audits-filter-actions">
          <button type="submit" className="btn btn-secondary btn-pill audits-filter-submit" disabled={loading || refreshing}>
            <Search size={15} />
            <span>Filtrar</span>
          </button>
          <div className="refresh-combo" ref={refreshMenuRef}>
          <div className="refresh-combo-split">
            <button
              type="button"
              className="btn btn-secondary refresh-combo-main"
              onClick={() => loadPage(page, applied)}
              disabled={loading || refreshing}
              aria-label="Atualizar agora"
              title="Atualizar agora"
            >
              <RefreshCw size={15} className={loading || refreshing ? 'spin' : ''} />
            </button>
            <button
              type="button"
              className="btn btn-secondary refresh-combo-caret"
              onClick={() => setRefreshMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={refreshMenuOpen}
              aria-label="Opções de atualização"
              title="Opções de atualização"
            >
              <ChevronDown size={14} />
            </button>
          </div>
          {refreshMenuOpen && (
            <div className="refresh-combo-menu" role="menu">
              <label className="refresh-combo-auto">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Automático
              </label>
              <p className="refresh-combo-hint">Intervalo (só vale com automático ligado)</p>
              {(['5s', '30s', '1m'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`refresh-combo-option${intervalPreset === preset ? ' is-active' : ''}`}
                  role="menuitem"
                  onClick={() => setIntervalPreset(preset)}
                >
                  {preset}
                </button>
              ))}
              <button
                type="button"
                className={`refresh-combo-option${intervalPreset === 'custom' ? ' is-active' : ''}`}
                role="menuitem"
                onClick={() => setIntervalPreset('custom')}
              >
                Customizado
              </button>
              {intervalPreset === 'custom' && (
                <label className="refresh-combo-custom">
                  Segundos
                  <input
                    className="form-input"
                    type="number"
                    min={3}
                    step={1}
                    value={customSeconds}
                    onChange={(e) => setCustomSeconds(Number(e.target.value))}
                    aria-label="Intervalo personalizado em segundos"
                  />
                </label>
              )}
            </div>
          )}
        </div>
          </div>
        </div>
      </form>

      {pager}

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>
                <button type="button" className="th-sort" onClick={() => toggleSort('occurredAt')}>
                  Quando {sortIcon('occurredAt')}
                </button>
              </th>
              <th>
                <button type="button" className="th-sort" onClick={() => toggleSort('actor')}>
                  Quem {sortIcon('actor')}
                </button>
              </th>
              <th>
                <button type="button" className="th-sort" onClick={() => toggleSort('action')}>
                  Ação {sortIcon('action')}
                </button>
              </th>
              <th>
                <button type="button" className="th-sort" onClick={() => toggleSort('resource')}>
                  Recurso {sortIcon('resource')}
                </button>
              </th>
              <th>
                <button type="button" className="th-sort" onClick={() => toggleSort('outcome')}>
                  Resultado {sortIcon('outcome')}
                </button>
              </th>
              <th>
                <button type="button" className="th-sort" onClick={() => toggleSort('sourceService')}>
                  Origem {sortIcon('sourceService')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && displayedItems.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Carregando eventos de auditoria...
                </td>
              </tr>
            ) : displayedItems.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <ScrollText size={22} />
                    <span>Nenhum evento de auditoria para os filtros atuais.</span>
                  </div>
                </td>
              </tr>
            ) : (
              displayedItems.map((event) => (
                <tr
                  key={event.eventId}
                  onClick={() => openDetail(event)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>{formatDate(event.occurredAt)}</td>
                  <td>
                    <span className="id-compact" title={event.actor?.codeUser || event.actor?.type}>
                      {compactId(event.actor?.codeUser) === '—' ? event.actor?.type || '—' : compactId(event.actor?.codeUser)}
                    </span>
                  </td>
                  <td>
                    <span className="table-cell-title">{event.action}</span>
                  </td>
                  <td>
                    <span title={`${event.resource?.type || ''} ${event.resource?.id || ''}`}>
                      {event.resource?.type || '—'}
                      {event.resource?.id ? ` · ${compactId(event.resource.id)}` : ''}
                    </span>
                  </td>
                  <td>
                    <span className="badge-role" style={outcomeStyle(event.outcome)}>
                      {outcomeLabel(event.outcome)}
                    </span>
                  </td>
                  <td>
                    <span className="id-compact">{event.sourceService || '—'}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {displayedItems.map((event) => (
          <button
            type="button"
            key={event.eventId}
            className="mobile-domain-card"
            onClick={() => openDetail(event)}
            style={{ textAlign: 'left', width: '100%', border: 'none', background: 'inherit' }}
          >
            <div className="mobile-card-top">
              <span className="mobile-domain-name">{event.action}</span>
              <span className="badge-role" style={outcomeStyle(event.outcome)}>
                {outcomeLabel(event.outcome)}
              </span>
            </div>
            <div className="mobile-card-subinfo">{formatDate(event.occurredAt)}</div>
            <div className="mobile-card-meta">
              {event.actor?.codeUser || event.actor?.type} · {event.sourceService}
            </div>
          </button>
        ))}
      </div>

      {pager}

      <Modal
        isOpen={!!detail || detailLoading}
        onClose={() => setDetail(null)}
        title={detail?.action || 'Evento de auditoria'}
        subtitle={detail ? formatDate(detail.occurredAt) : 'Carregando...'}
        maxWidth="640px"
      >
        {detailLoading && !detail ? (
          <p style={{ color: '#5f6368' }}>Carregando detalhe...</p>
        ) : detail ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="info-row">
              <span className="info-label">Resultado</span>
              <span className="badge-role" style={outcomeStyle(detail.outcome)}>
                {outcomeLabel(detail.outcome)}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Quem</span>
              <span className="info-value text-mono">{detail.actor?.codeUser || detail.actor?.type || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Recurso</span>
              <span className="info-value">
                {detail.resource?.type || '—'} {detail.resource?.id ? `· ${detail.resource.id}` : ''}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Origem</span>
              <span className="info-value">{detail.sourceService}</span>
            </div>
            <div className="info-row">
              <span className="info-label">IP</span>
              <span className="info-value text-mono">{detail.actor?.clientIp || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Dispositivo</span>
              <span className="info-value text-mono">{detail.actor?.deviceId || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Motivo</span>
              <span className="info-value">{detail.reason || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Correlation ID</span>
              <span className="info-value text-mono">{detail.correlationId || '—'}</span>
            </div>
            {detail.actor?.roles && detail.actor.roles.length > 0 ? (
              <div className="info-row">
                <span className="info-label">Roles do ator</span>
                <span className="info-value">{detail.actor.roles.join(', ')}</span>
              </div>
            ) : null}
            {detail.changes && detail.changes.length > 0 ? (
              <div>
                <strong style={{ fontSize: '0.85rem' }}>Alterações</strong>
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                  {detail.changes.map((change, index) => (
                    <li key={`${change.field}-${index}`} style={{ fontSize: '0.85rem', color: '#5f6368' }}>
                      {change.field}: {JSON.stringify(change.before)} → {JSON.stringify(change.after)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {detail.journey && detail.journey.length > 0 ? (
              <div>
                <strong style={{ fontSize: '0.85rem' }}>Jornada</strong>
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                  {detail.journey.map((hop) => (
                    <li key={hop.eventId} style={{ fontSize: '0.85rem', color: '#5f6368' }}>
                      {formatDate(hop.occurredAt)} · {hop.sourceService} · {hop.action} · {outcomeLabel(hop.outcome)}
                    </li>
                  ))}
                </ul>
                {detail.correlationId ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-pill"
                    style={{ marginTop: '0.75rem' }}
                    onClick={() => applyCorrelation(detail.correlationId)}
                  >
                    Filtrar esta jornada
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
