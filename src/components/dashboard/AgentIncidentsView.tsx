import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronsUpDown, ChevronUp, Search, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ListPager } from '../common/ListPager';
import { Modal } from '../common/Modal';
import { RefreshCombo } from '../common/RefreshCombo';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAppliedListUrl } from '../../hooks/useAppliedListUrl';
import { PATHS } from '../../navigation/routes';
import {
  acknowledgeCollectorIncident,
  applyCollectorIncidentSuccessor,
  getCollectorIncidentSuggestion,
  resolveCollectorIncident,
  searchCollectorIncidents,
  type CollectorIncident,
  type CollectorIncidentSuggestion,
} from '../../services/agentService';
import { canWriteCollector } from '../../utils/roles';
import {
  formatIncidentDate,
  incidentClassificationLabel,
  incidentStatusLabel,
  incidentStatusStyle,
} from '../../utils/collectorIncidents';

type SortKey = 'lastSeenAt' | 'agent' | 'classification' | 'status' | 'occurrences';
type SortDir = 'asc' | 'desc';

type Filters = {
  q: string;
  status: string;
  classification: string;
  sort: '' | SortKey;
  dir: '' | SortDir;
};

const EMPTY_FILTERS: Filters = {
  q: '',
  status: 'open',
  classification: '',
  sort: '',
  dir: '',
};

function compareIncidents(a: CollectorIncident, b: CollectorIncident, key: SortKey): number {
  switch (key) {
    case 'lastSeenAt':
      return new Date(a.lastSeenAt).getTime() - new Date(b.lastSeenAt).getTime();
    case 'agent':
      return (a.agentName || a.agentId || '').localeCompare(b.agentName || b.agentId || '', 'pt-BR');
    case 'classification':
      return incidentClassificationLabel(a.classification).localeCompare(
        incidentClassificationLabel(b.classification),
        'pt-BR',
      );
    case 'status':
      return incidentStatusLabel(a.status).localeCompare(incidentStatusLabel(b.status), 'pt-BR');
    case 'occurrences':
      return (a.occurrences || 0) - (b.occurrences || 0);
    default:
      return 0;
  }
}

function matchesQuery(item: CollectorIncident, q: string): boolean {
  if (!q) return true;
  const haystack = [
    item.agentName,
    item.entityHint,
    item.sourceHost,
    item.dataSourceSlug,
    item.errorExcerpt,
  ].join(' ').toLowerCase();
  return haystack.includes(q);
}

type IncidentConfirmAction = 'ack' | 'resolve' | 'apply';

function confirmCopy(action: IncidentConfirmAction): { title: string; body: string; confirm: string } {
  switch (action) {
    case 'ack':
      return {
        title: 'Reconhecer incidente',
        body: 'Marca que alguém viu este caso. A coleta continua normalmente.',
        confirm: 'Reconhecer',
      };
    case 'resolve':
      return {
        title: 'Resolver incidente',
        body: 'Fecha o caso. Uma nova falha permanente abre outro incidente.',
        confirm: 'Resolver',
      };
    case 'apply':
      return {
        title: 'Aplicar sucessor',
        body: 'Atualiza nome/configuração do agent com a sugestão e fecha o incidente.',
        confirm: 'Aplicar',
      };
  }
}

export const AgentIncidentsView: React.FC<{
  onOpenCountChange?: (count: number) => void;
  onIncidentsMutated?: () => void;
}> = ({ onOpenCountChange, onIncidentsMutated }) => {
  const { isAuthenticated, getAccessToken, user } = useAuth();
  const writable = canWriteCollector(getAccessToken(), user?.roles);
  const { addToast } = useToast();
  const { filters, setFilters, applied, page, applyFilters, goToPage } = useAppliedListUrl(EMPTY_FILTERS);
  const [items, setItems] = useState<CollectorIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [detail, setDetail] = useState<CollectorIncident | null>(null);
  const [suggestion, setSuggestion] = useState<CollectorIncidentSuggestion | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<IncidentConfirmAction | null>(null);
  const [confirm, setConfirm] = useState<IncidentConfirmAction | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const pageRef = useRef(page);
  const appliedRef = useRef(applied);
  const itemsRef = useRef(items);
  const onOpenCountChangeRef = useRef(onOpenCountChange);
  const onIncidentsMutatedRef = useRef(onIncidentsMutated);
  onOpenCountChangeRef.current = onOpenCountChange;
  onIncidentsMutatedRef.current = onIncidentsMutated;
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
      const result = await searchCollectorIncidents({
        page: nextPage,
        size: 20,
        status: nextFilters.status || undefined,
        classification: nextFilters.classification || undefined,
      }, token);
      setItems(result.content || []);
      setTotalPages(Math.max(result.totalPages || 1, 1));
      setSortKey(null);
      setSortDir('asc');
      if ((nextFilters.status || '') === 'open') {
        onOpenCountChangeRef.current?.(Math.max(0, result.totalElements || 0));
      }    } catch (err: unknown) {
      const error = err as { status?: number; message?: string };
      if (error?.status === 401 || error?.status === 403) {
        addToast({
          type: 'error',
          title: 'Acesso restrito',
          description: 'Somente ADMIN ou MANAGER consultam incidentes de coleta.',
        });
        return;
      }
      addToast({
        type: 'error',
        title: 'Falha ao consultar incidentes',
        description: error?.message || 'Tente novamente em instantes.',
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
    const query = applied.q.trim().toLowerCase();
    const filtered = query ? items.filter((item) => matchesQuery(item, query)) : items;
    if (!sortKey) return filtered;
    const sorted = [...filtered].sort((a, b) => compareIncidents(a, b, sortKey));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [applied.q, items, sortDir, sortKey]);

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
    setSortDir(key === 'lastSeenAt' || key === 'occurrences' ? 'desc' : 'asc');
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ChevronsUpDown size={13} />;
    return sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
  };

  const openDetail = async (item: CollectorIncident) => {
    const token = getAccessToken();
    setDetail(item);
    setConfirm(null);
    setSuggestion(null);
    if (!token) return;
    if (item.status !== 'open' && item.status !== 'acknowledged') return;
    setDetailLoading(true);
    try {
      const next = await getCollectorIncidentSuggestion(item.id, token);
      setSuggestion(next && next.incidentId ? next : null);
    } catch {
      setSuggestion(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const runAction = async (action: IncidentConfirmAction) => {
    const token = getAccessToken();
    if (!token || !detail) return;
    setBusy(action);
    try {
      let updated: CollectorIncident;
      if (action === 'ack') updated = await acknowledgeCollectorIncident(detail.id, token);
      else if (action === 'resolve') updated = await resolveCollectorIncident(detail.id, token);
      else updated = await applyCollectorIncidentSuccessor(detail.id, token);
      setItems((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
      setDetail(updated);
      setConfirm(null);
      if (action === 'resolve' || action === 'apply') setSuggestion(null);
      addToast({
        type: 'success',
        title: action === 'ack' ? 'Incidente reconhecido' : action === 'resolve' ? 'Incidente resolvido' : 'Sucessor aplicado',
        description: action === 'ack'
          ? 'A coleta continua.'
          : action === 'resolve'
            ? 'Uma nova falha abre outro incidente.'
            : 'Configuração atualizada e incidente fechado.',
      });
      onIncidentsMutatedRef.current?.();
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Falha ao atualizar incidente',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setBusy(null);
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

  const canAct = writable && detail && (detail.status === 'open' || detail.status === 'acknowledged');

  return (
    <div>
      <form className="audits-toolbar" onSubmit={handleSearch}>
        <div className="audits-filter-row audits-filter-row-primary">
          <div className="search-input-wrapper audits-search-field">
            <Search size={16} className="search-icon" />
            <input
              className="search-input"
              placeholder="Agent, host ou ticker"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              aria-label="Buscar incidente"
            />
          </div>
          <select
            className="form-input audits-compact-select"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            aria-label="Status"
          >
            <option value="">Todos os status</option>
            <option value="open">Abertos</option>
            <option value="acknowledged">Reconhecidos</option>
            <option value="resolved">Resolvidos</option>
          </select>
          <select
            className="form-input audits-compact-select"
            value={filters.classification}
            onChange={(e) => setFilters((f) => ({ ...f, classification: e.target.value }))}
            aria-label="Classificação"
          >
            <option value="">Todas as classificações</option>
            <option value="not_found">Não encontrado</option>
            <option value="source_changed">Fonte mudou</option>
            <option value="auth">Auth</option>
            <option value="rate_limited">Rate limit</option>
            <option value="transient_exhausted">Transiente</option>
            <option value="unknown">Desconhecida</option>
          </select>
        </div>
        <div className="audits-filter-row audits-filter-row-sort">
          <div className="audits-sort-group">
            <select
              className="form-input audits-sort-select"
              value={filters.sort}
              onChange={(e) => {
                const sort = e.target.value as Filters['sort'];
                setFilters((f) => ({ ...f, sort, dir: sort ? f.dir : '' }));
              }}
              aria-label="Ordenar por (opcional)"
              title="Ordenar por (opcional)"
            >
              <option value="">Ordenar por</option>
              <option value="lastSeenAt">Última vista</option>
              <option value="agent">Agent</option>
              <option value="classification">Classificação</option>
              <option value="status">Status</option>
              <option value="occurrences">Ocorrências</option>
            </select>
            <select
              className="form-input audits-dir-select"
              value={filters.dir}
              onChange={(e) => setFilters((f) => ({ ...f, dir: e.target.value as Filters['dir'] }))}
              aria-label="Direção da ordem (opcional)"
              title="Direção da ordem (opcional)"
            >
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
              <th>
                <button type="button" className="th-sort" onClick={() => toggleSort('lastSeenAt')}>
                  Última vista {sortIcon('lastSeenAt')}
                </button>
              </th>
              <th>
                <button type="button" className="th-sort" onClick={() => toggleSort('agent')}>
                  Agent {sortIcon('agent')}
                </button>
              </th>
              <th>
                <button type="button" className="th-sort" onClick={() => toggleSort('classification')}>
                  Classificação {sortIcon('classification')}
                </button>
              </th>
              <th>Host</th>
              <th>
                <button type="button" className="th-sort" onClick={() => toggleSort('occurrences')}>
                  Ocorrências {sortIcon('occurrences')}
                </button>
              </th>
              <th>
                <button type="button" className="th-sort" onClick={() => toggleSort('status')}>
                  Status {sortIcon('status')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && displayedItems.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Carregando incidentes...
                </td>
              </tr>
            ) : displayedItems.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldAlert size={22} />
                    <span>Nenhum incidente de coleta para os filtros atuais.</span>
                  </div>
                </td>
              </tr>
            ) : (
              displayedItems.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => void openDetail(item)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>{formatIncidentDate(item.lastSeenAt)}</td>
                  <td>
                    <span className="table-cell-title" title={item.agentName || item.agentId}>
                      {item.agentName || item.entityHint || 'Agent'}
                    </span>
                    {item.entityHint && item.agentName ? (
                      <div className="table-cell-muted">{item.entityHint}</div>
                    ) : null}
                  </td>
                  <td>{incidentClassificationLabel(item.classification)}</td>
                  <td>
                    <span className="id-compact" title={item.sourceHost}>{item.sourceHost || '—'}</span>
                  </td>
                  <td>{item.occurrences}</td>
                  <td>
                    <span className="badge-role" style={incidentStatusStyle(item.status)}>
                      {incidentStatusLabel(item.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {displayedItems.map((item) => (
          <button
            type="button"
            key={item.id}
            className="mobile-domain-card"
            onClick={() => void openDetail(item)}
            style={{ textAlign: 'left', width: '100%', border: 'none', background: 'inherit' }}
          >
            <div className="mobile-card-top">
              <span className="mobile-domain-name">{item.agentName || item.entityHint || 'Agent'}</span>
              <span className="badge-role" style={incidentStatusStyle(item.status)}>
                {incidentStatusLabel(item.status)}
              </span>
            </div>
            <div className="mobile-card-subinfo">{formatIncidentDate(item.lastSeenAt)}</div>
            <div className="mobile-card-meta">
              {incidentClassificationLabel(item.classification)}
              {item.sourceHost ? ` · ${item.sourceHost}` : ''}
              {` · ${item.occurrences} ocorrência(s)`}
            </div>
          </button>
        ))}
      </div>

      {pager(false)}

      <Modal
        isOpen={!!detail}
        onClose={() => {
          if (busy || confirm) return;
          setDetail(null);
          setSuggestion(null);
        }}
        title={detail
          ? `${detail.agentName || detail.entityHint || 'Agent'} - ${incidentClassificationLabel(detail.classification)}`
          : 'Incidente'}
        subtitle={detail ? formatIncidentDate(detail.lastSeenAt) : ''}
        maxWidth="640px"
        maxHeight="min(88vh, 720px)"
        footer={canAct ? (
          <div className="modal-actions agent-incident-actions">
            {detail?.status === 'open' ? (
              <button
                type="button"
                className="btn btn-outline btn-pill"
                disabled={!!busy}
                onClick={() => setConfirm('ack')}
              >
                Reconhecer
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-outline btn-pill"
              disabled={!!busy}
              onClick={() => setConfirm('resolve')}
            >
              Resolver
            </button>
            {suggestion ? (
              <button
                type="button"
                className="btn btn-primary btn-pill"
                disabled={!!busy}
                onClick={() => setConfirm('apply')}
              >
                Aplicar sucessor
              </button>
            ) : null}
          </div>
        ) : undefined}
      >
        {detail ? (
          <div className="agent-incident-detail">
            <div className="info-row">
              <span className="info-label">Status</span>
              <span className="badge-role" style={incidentStatusStyle(detail.status)}>
                {incidentStatusLabel(detail.status)}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">
                Agent
                {detail.agentId ? (
                  <Link
                    className="link-btn agent-incident-agent-link"
                    to={`${PATHS.agents}?q=${encodeURIComponent(detail.agentName || '')}`}
                  >
                    ver agent
                  </Link>
                ) : null}
              </span>
              <span className="info-value">{detail.agentName || detail.agentId || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Ticker / hint</span>
              <span className="info-value">{detail.entityHint || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Fonte</span>
              <span className="info-value">{detail.dataSourceSlug || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Host</span>
              <span className="info-value">{detail.sourceHost || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">HTTP</span>
              <span className="info-value">{detail.httpStatus || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Ocorrências</span>
              <span className="info-value">{detail.occurrences}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Primeira vista</span>
              <span className="info-value">{formatIncidentDate(detail.firstSeenAt)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Última vista</span>
              <span className="info-value">{formatIncidentDate(detail.lastSeenAt)}</span>
            </div>
            {detail.errorExcerpt ? (
              <div className="agent-incident-error-block">
                <strong>Erro</strong>
                <p>{detail.errorExcerpt}</p>
              </div>
            ) : null}
            {detailLoading ? (
              <p className="agent-incident-empty">Carregando sugestão...</p>
            ) : suggestion ? (
              <p className="agent-incident-suggestion">
                Sucessor sugerido: <strong>{suggestion.newHint}</strong>
                {suggestion.reason ? ` — ${suggestion.reason}` : ''}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={!!confirm && !!detail}
        onClose={() => {
          if (busy) return;
          setConfirm(null);
        }}
        title={confirm ? confirmCopy(confirm).title : 'Confirmar'}
        subtitle={detail?.agentName || detail?.entityHint || undefined}
        maxWidth="480px"
      >
        {confirm ? (
          <>
            <p>{confirmCopy(confirm).body}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                disabled={!!busy}
                onClick={() => setConfirm(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!!busy}
                onClick={() => void runAction(confirm)}
              >
                {busy ? 'Aplicando…' : confirmCopy(confirm).confirm}
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
};
