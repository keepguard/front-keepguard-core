import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Mail,
  Search,
} from 'lucide-react';
import { ListPager } from '../common/ListPager';
import { Modal } from '../common/Modal';
import { RefreshCombo } from '../common/RefreshCombo';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  executeIncidentAction,
  getIncident,
  listAlertRecipients,
  patchAlertRecipient,
  searchIncidents,
  upsertAlertRecipient,
  type AlertRecipient,
  type GuardianIncidentListItem,
  type IncidentDetail,
  type SuggestionDTO,
} from '../../services/guardianService';
import { useAppliedListUrl } from '../../hooks/useAppliedListUrl';
import { canWriteGuardian } from '../../utils/roles';

type SortKey = 'lastSeenAt' | 'createdAt' | 'severity' | 'status' | 'serviceName';
type SortDir = 'asc' | 'desc';

type Filters = {
  from: string;
  to: string;
  status: string;
  severity: string;
  q: string;
  k8sConclusion: string;
  correlationId: string;
  sort: SortKey;
  dir: SortDir;
};

const EMPTY_FILTERS: Filters = {
  from: '',
  to: '',
  status: '',
  severity: '',
  q: '',
  k8sConclusion: '',
  correlationId: '',
  sort: 'lastSeenAt',
  dir: 'desc',
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

function whenOf(item: GuardianIncidentListItem) {
  return item.lastSeenAt || item.createdAt;
}

function toIso(localValue: string): string | undefined {
  if (!localValue) return undefined;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function isAlphaSort(sort: SortKey) {
  return sort === 'serviceName' || sort === 'status' || sort === 'severity';
}

function statusLabel(status?: string) {
  switch ((status || '').toUpperCase()) {
    case 'AWAITING_HUMAN':
      return 'Aguardando humano';
    case 'ACTION_RUNNING':
      return 'Ação em andamento';
    case 'NOTIFIED':
      return 'Notificado';
    case 'DETECTED':
      return 'Detectado';
    case 'DIAGNOSING':
      return 'Diagnosticando';
    case 'DIAGNOSED':
      return 'Diagnosticado';
    case 'NORMALIZED':
      return 'Normalizado';
    case 'DISMISSED':
      return 'Dispensado';
    default:
      return status || '—';
  }
}

function statusStyle(status?: string): React.CSSProperties {
  switch ((status || '').toUpperCase()) {
    case 'NOTIFIED':
    case 'AWAITING_HUMAN':
      return { background: '#fff4e5', color: '#b36b00', borderColor: '#ffe0b2' };
    case 'ACTION_RUNNING':
    case 'DIAGNOSING':
      return { background: '#eef3ff', color: '#2b4cdb', borderColor: '#c9d4ff' };
    case 'NORMALIZED':
    case 'DISMISSED':
      return { background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' };
    case 'DETECTED':
      return { background: '#fdecea', color: '#c0392b', borderColor: '#f5c6cb' };
    default:
      return {};
  }
}

function severityStyle(severity?: string): React.CSSProperties {
  switch ((severity || '').toUpperCase()) {
    case 'CRITICAL':
      return { background: '#fdecea', color: '#c0392b', borderColor: '#f5c6cb' };
    case 'HIGH':
      return { background: '#fff4e5', color: '#b36b00', borderColor: '#ffe0b2' };
    case 'MEDIUM':
      return { background: '#eef3ff', color: '#2b4cdb', borderColor: '#c9d4ff' };
    case 'LOW':
    case 'INFO':
      return { background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' };
    default:
      return {};
  }
}

function investigationLabel(source?: string) {
  switch ((source || '').toUpperCase()) {
    case 'LLM':
      return 'IA (LLM)';
    case 'HEURISTIC_FALLBACK':
      return 'Heurística';
    default:
      return source || '—';
  }
}

function prettyJson(raw?: string) {
  if (!raw) return '—';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export const GuardianView: React.FC = () => {
  const { isAuthenticated, getAccessToken, user } = useAuth();
  const writable = canWriteGuardian(getAccessToken(), user?.roles);
  const { addToast } = useToast();
  const { filters, setFilters, applied, page, applyFilters, goToPage } = useAppliedListUrl(EMPTY_FILTERS);
  const [items, setItems] = useState<GuardianIncidentListItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [pendingSuggestion, setPendingSuggestion] = useState<SuggestionDTO | null>(null);
  const [recipients, setRecipients] = useState<AlertRecipient[]>([]);
  const [newEmail, setNewEmail] = useState('');
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
    if (hasRows) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const result = await searchIncidents(
        {
          page: nextPage,
          size: 20,
          namespace: 'keepguard',
          from: toIso(nextFilters.from),
          to: toIso(nextFilters.to),
          status: nextFilters.status || undefined,
          severity: nextFilters.severity || undefined,
          q: nextFilters.q.trim() || undefined,
          k8sConclusion: nextFilters.k8sConclusion.trim() || undefined,
          correlationId: nextFilters.correlationId.trim() || undefined,
          sort: nextFilters.sort,
          dir: nextFilters.dir,
        },
        token
      );
      setItems(result.content || []);
      setTotalPages(Math.max(result.totalPages || 1, 1));
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Falha ao listar incidentes',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addToast, getAccessToken]);

  const loadRecipients = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      setRecipients(await listAlertRecipients(token));
    } catch {
      setRecipients([]);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadRecipients();
  }, [isAuthenticated, loadRecipients]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadPage(page, applied);
  }, [applied, isAuthenticated, loadPage, page]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    applyFilters(filters);
  };

  const toggleSort = (key: SortKey) => {
    const nextDir: SortDir =
      applied.sort === key ? (applied.dir === 'asc' ? 'desc' : 'asc') : key === 'serviceName' || key === 'status' || key === 'severity' ? 'asc' : 'desc';
    applyFilters({ ...applied, sort: key, dir: nextDir });
  };

  const sortIcon = (key: SortKey) => {
    if (applied.sort !== key) return <ChevronsUpDown size={13} />;
    return applied.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
  };

  const openDetail = async (item: GuardianIncidentListItem) => {
    const token = getAccessToken();
    if (!token) return;
    setDetailLoading(true);
    setPendingSuggestion(null);
    setConfirmation('');
    try {
      setDetail(await getIncident(item.id, token));
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Falha ao abrir incidente',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    setDetail(await getIncident(id, token));
  };

  const applyCorrelation = (correlationId: string) => {
    applyFilters({ ...applied, correlationId });
    setDetail(null);
  };

  const runAction = async (suggestion: SuggestionDTO) => {
    const token = getAccessToken();
    if (!token || !detail) return;
    if (suggestion.risk === 'DESTRUCTIVE' && confirmation !== detail.incident.serviceName) {
      addToast({
        type: 'error',
        title: 'Confirmação obrigatória',
        description: `Digite o nome do serviço (${detail.incident.serviceName}) para ações destrutivas.`,
      });
      return;
    }
    try {
      await executeIncidentAction(
        detail.incident.id,
        suggestion.id,
        suggestion.risk === 'DESTRUCTIVE' ? confirmation : undefined,
        token
      );
      addToast({ type: 'success', title: 'Ação enviada', description: suggestion.label });
      setPendingSuggestion(null);
      setConfirmation('');
      await refreshDetail(detail.incident.id);
      await loadPage(page, applied);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Falha na ação',
        description: error instanceof Error ? error.message : 'O cluster recusou a operação.',
      });
    }
  };

  const addRecipient = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = getAccessToken();
    if (!token || !newEmail.trim()) return;
    try {
      await upsertAlertRecipient({ email: newEmail.trim(), enabled: true }, token);
      setNewEmail('');
      await loadRecipients();
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Não foi possível salvar o e-mail',
        description: error instanceof Error ? error.message : 'Verifique o formato.',
      });
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

  return (
    <div>
      <form className="audits-toolbar" onSubmit={handleSearch}>
        <div className="audits-filter-row guardian-filter-row-primary">
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
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            aria-label="Status"
          >
            <option value="">Todos os status</option>
            <option value="AWAITING_HUMAN">Aguardando humano</option>
            <option value="ACTION_RUNNING">Ação em andamento</option>
            <option value="NOTIFIED">Notificado</option>
            <option value="DETECTED">Detectado</option>
            <option value="NORMALIZED">Normalizado</option>
            <option value="DISMISSED">Dispensado</option>
          </select>
        </div>
        <div className="audits-filter-row guardian-filter-row-secondary">
          <div className="search-input-wrapper audits-search-field">
            <Search size={16} className="search-icon" />
            <input
              className="search-input"
              placeholder="Serviço, pod ou resumo"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
          </div>
          <input
            className="form-input"
            placeholder="Conclusão K8s"
            value={filters.k8sConclusion}
            onChange={(e) => setFilters((f) => ({ ...f, k8sConclusion: e.target.value }))}
          />
          <select
            className="form-input"
            value={filters.severity}
            onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
            aria-label="Severidade"
          >
            <option value="">Todas as severidades</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
            <option value="INFO">INFO</option>
          </select>
        </div>
        <div className="audits-filter-row guardian-filter-row-tertiary">
          <input
            className="form-input"
            placeholder="Correlation ID"
            value={filters.correlationId}
            onChange={(e) => setFilters((f) => ({ ...f, correlationId: e.target.value }))}
          />
        </div>
        <div className="audits-filter-row guardian-filter-row-sort">
          <div className="audits-sort-group">
            <select
              className="form-input audits-sort-select"
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortKey }))}
              aria-label="Ordenar por"
            >
              <option value="lastSeenAt">Última ocorrência</option>
              <option value="createdAt">Criado em</option>
              <option value="severity">Severidade</option>
              <option value="status">Status</option>
              <option value="serviceName">Serviço</option>
            </select>
            <select
              className="form-input audits-dir-select"
              value={filters.dir}
              onChange={(e) => setFilters((f) => ({ ...f, dir: e.target.value as SortDir }))}
              aria-label="Direção"
            >
              {isAlphaSort(filters.sort) ? (
                <>
                  <option value="asc">A–Z</option>
                  <option value="desc">Z–A</option>
                </>
              ) : (
                <>
                  <option value="desc">Mais recentes</option>
                  <option value="asc">Mais antigos</option>
                </>
              )}
            </select>
          </div>
        </div>
        {pager(true)}
      </form>

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table guardian-table">
          <colgroup>
            <col className="col-service" />
            <col className="col-status" />
            <col className="col-severity" />
            <col className="col-k8s" />
            <col className="col-count" />
            <col className="col-when" />
          </colgroup>
          <thead>
            <tr>
              <th>
                <button type="button" className="th-sort" onClick={() => toggleSort('serviceName')}>
                  Serviço {sortIcon('serviceName')}
                </button>
              </th>
              <th>
                <button type="button" className="th-sort" onClick={() => toggleSort('status')}>
                  Status {sortIcon('status')}
                </button>
              </th>
              <th>
                <button type="button" className="th-sort" onClick={() => toggleSort('severity')}>
                  Severidade {sortIcon('severity')}
                </button>
              </th>
              <th title="Conclusão Kubernetes">K8s</th>
              <th>Ocorr.</th>
              <th>
                <button type="button" className="th-sort" onClick={() => toggleSort('lastSeenAt')}>
                  Quando {sortIcon('lastSeenAt')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Carregando incidentes...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <Bot size={22} />
                    <span>Nenhum incidente para os filtros atuais.</span>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} onClick={() => void openDetail(item)} style={{ cursor: 'pointer' }}>
                  <td className="cell-service">
                    <span className="table-cell-title">
                      {item.serviceName}
                      {item.emailSent ? (
                        <Mail size={13} className="guardian-mail-dot" aria-label="E-mail enviado" />
                      ) : null}
                    </span>
                    {item.podName ? <div className="table-cell-muted">{item.podName}</div> : null}
                  </td>
                  <td>
                    <span className="badge-role" style={statusStyle(item.status)}>
                      {statusLabel(item.status)}
                    </span>
                  </td>
                  <td>
                    <span className="badge-role" style={severityStyle(item.severity)}>
                      {item.severity || '—'}
                    </span>
                  </td>
                  <td className="cell-k8s" title={item.k8sConclusion || 'Sem diagnóstico K8s'}>
                    {item.k8sConclusion || '—'}
                  </td>
                  <td className="cell-count">{item.occurrencesCount ?? '—'}</td>
                  <td className="cell-when">{formatDate(whenOf(item))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            className="mobile-domain-card"
            onClick={() => void openDetail(item)}
            style={{ textAlign: 'left', width: '100%', border: 'none', background: 'inherit' }}
          >
            <div className="mobile-card-top">
              <span className="mobile-domain-name">{item.serviceName}</span>
              <span className="badge-role" style={severityStyle(item.severity)}>
                {item.severity}
              </span>
            </div>
            <div className="mobile-card-subinfo">{formatDate(whenOf(item))}</div>
            <div className="mobile-card-meta">
              {statusLabel(item.status)} · {item.occurrencesCount} ocorr. · {item.k8sConclusion || 'sem conclusão K8s'}
            </div>
          </button>
        ))}
      </div>

      {pager(false)}

      <details className="hpanel-table-card guardian-recipients-card">
        <summary className="guardian-recipients-head">
          <h3>Destinatários de alerta</h3>
          <span className="table-cell-muted">{recipients.length} cadastrado{recipients.length === 1 ? '' : 's'}</span>
        </summary>
        {writable ? (
        <form onSubmit={addRecipient} className="guardian-recipients-form">
          <input
            className="form-input"
            placeholder="email@empresa.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary btn-pill">
            Adicionar
          </button>
        </form>
        ) : null}
        <ul className="guardian-recipient-list">
          {recipients.length === 0 ? (
            <li className="guardian-recipient-row">
              <span className="table-cell-muted">Nenhum destinatário cadastrado.</span>
            </li>
          ) : (
            recipients.map((recipient) => (
              <li key={recipient.id} className="guardian-recipient-row">
                <div>
                  <div className="guardian-recipient-email">{recipient.email}</div>
                  <div className="guardian-recipient-meta">{recipient.enabled ? 'Ativo' : 'Inativo'}</div>
                </div>
                {writable ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-pill"
                  onClick={() => {
                    const token = getAccessToken();
                    if (token) void patchAlertRecipient(recipient.id, !recipient.enabled, token).then(loadRecipients);
                  }}
                >
                  {recipient.enabled ? 'Desativar' : 'Ativar'}
                </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </details>

      <Modal
        isOpen={!!detail || detailLoading}
        onClose={() => {
          setDetail(null);
          setPendingSuggestion(null);
        }}
        title={detail?.incident.serviceName || 'Incidente'}
        subtitle={detail ? formatDate(whenOf(detail.incident)) : 'Carregando...'}
        maxWidth="760px"
      >
        {detailLoading && !detail ? (
          <p style={{ color: '#5f6368' }}>Carregando detalhe...</p>
        ) : detail ? (
          <div className="guardian-detail">
            <div className="info-row">
              <span className="info-label">Status</span>
              <span className="badge-role" style={statusStyle(detail.incident.status)}>
                {statusLabel(detail.incident.status)}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Severidade</span>
              <span className="badge-role" style={severityStyle(detail.incident.severity)}>
                {detail.incident.severity || '—'}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Pod</span>
              <span className="info-value text-mono">{detail.incident.podName || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Ocorrências</span>
              <span className="info-value">{detail.incident.occurrencesCount}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Conclusão K8s</span>
              <span className="info-value">{detail.incident.k8sConclusion || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Motivo</span>
              <span className="info-value">{detail.incident.errorReason || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Investigação</span>
              <span className="info-value">{investigationLabel(detail.investigationSource)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Streak saudável</span>
              <span className="info-value">{detail.healthyStreak ?? '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Correlation ID</span>
              <span className="info-value text-mono">{detail.correlationId || '—'}</span>
            </div>
            {detail.correlationId ? (
              <button
                type="button"
                className="btn btn-outline btn-pill"
                onClick={() => applyCorrelation(detail.correlationId!)}
              >
                Filtrar esta correlação
              </button>
            ) : null}

            <div>
              <strong style={{ fontSize: '0.85rem' }}>Resumo da IA</strong>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>
                {detail.aiSummary || detail.aiRootCause || 'Sem resumo da IA.'}
              </p>
            </div>
            {detail.aiRecommendedAction ? (
              <div>
                <strong style={{ fontSize: '0.85rem' }}>Ação recomendada</strong>
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>{detail.aiRecommendedAction}</p>
              </div>
            ) : null}
            {detail.capturedLogsSnippet ? (
              <div>
                <strong style={{ fontSize: '0.85rem' }}>Logs capturados</strong>
                <pre className="guardian-pre">{detail.capturedLogsSnippet}</pre>
              </div>
            ) : null}
            {detail.evidence && detail.evidence.length > 0 ? (
              <div>
                <strong style={{ fontSize: '0.85rem' }}>Evidências</strong>
                {detail.evidence.map((item) => (
                  <div key={item.id} style={{ marginTop: '0.45rem' }}>
                    <div className="table-cell-muted">
                      {item.kind} · {formatDate(item.createdAt)}
                    </div>
                    <pre className="guardian-pre">{prettyJson(item.payloadJson)}</pre>
                  </div>
                ))}
              </div>
            ) : null}
            {detail.timeline && detail.timeline.length > 0 ? (
              <div>
                <strong style={{ fontSize: '0.85rem' }}>Linha do tempo</strong>
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                  {detail.timeline.map((hop, index) => (
                    <li key={`${hop.eventType}-${index}`} style={{ fontSize: '0.85rem', color: '#5f6368' }}>
                      {formatDate(hop.createdAt)} · {hop.eventType} · {hop.detail || ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {detail.executions && detail.executions.length > 0 ? (
              <div>
                <strong style={{ fontSize: '0.85rem' }}>Ações executadas</strong>
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                  {detail.executions.map((execution) => (
                    <li key={execution.id} style={{ fontSize: '0.85rem', color: '#5f6368' }}>
                      {formatDate(execution.createdAt)} · {execution.outcome}
                      {execution.actorUserId ? ` · ${execution.actorUserId}` : ''}
                      {execution.errorMessage ? ` · ${execution.errorMessage}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {detail.deliveries && detail.deliveries.length > 0 ? (
              <div>
                <strong style={{ fontSize: '0.85rem' }}>E-mails</strong>
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                  {detail.deliveries.map((delivery, index) => (
                    <li key={`${delivery.email}-${index}`} style={{ fontSize: '0.85rem', color: '#5f6368' }}>
                      {delivery.email} · {delivery.outcome} · {delivery.kind} · {formatDate(delivery.sentAt)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {writable ? (
            <div className="guardian-actions">
              <strong style={{ fontSize: '0.85rem' }}>Ações no cluster</strong>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#5f6368' }}>
                Requer guardian:write. Ações destrutivas pedem o nome do serviço.
              </p>
              {(detail.suggestions || []).length === 0 ? (
                <span className="table-cell-muted">Nenhuma ação catalogada neste incidente.</span>
              ) : (
                (detail.suggestions || []).map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className="btn btn-secondary"
                    disabled={!suggestion.enabled && suggestion.actionType !== 'DISMISS'}
                    title={suggestion.disabledReason || suggestion.aiRationale}
                    onClick={() => {
                      setPendingSuggestion(suggestion);
                      if (suggestion.risk !== 'DESTRUCTIVE') {
                        void runAction(suggestion);
                      }
                    }}
                  >
                    {suggestion.label} · {suggestion.risk}
                    {!suggestion.enabled && suggestion.actionType !== 'DISMISS' ? ' (indisponível)' : ''}
                  </button>
                ))
              )}
              {pendingSuggestion?.risk === 'DESTRUCTIVE' ? (
                <div>
                  <input
                    className="form-input"
                    placeholder={`Digite ${detail.incident.serviceName}`}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => void runAction(pendingSuggestion)}
                  >
                    Confirmar {pendingSuggestion.label}
                  </button>
                </div>
              ) : null}
            </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default GuardianView;
