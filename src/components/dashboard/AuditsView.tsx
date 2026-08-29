import React, { useEffect, useState } from 'react';
import { RefreshCw, ScrollText, Search } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getAudit, searchAudits, type AuditDetail, type AuditEvent } from '../../services/auditService';
import { assertAuditReadVisibility } from '../../utils/roles';

const visibilityFailures = assertAuditReadVisibility();
if (visibilityFailures.length > 0 && import.meta.env.DEV) {
  console.warn('canReadAudits:', visibilityFailures);
}

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

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from: toLocalInput(from), to: toLocalInput(to) };
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
};

export const AuditsView: React.FC = () => {
  const { accessToken } = useAuth();
  const { addToast } = useToast();
  const initialRange = defaultRange();
  const [filters, setFilters] = useState<Filters>({
    from: initialRange.from,
    to: initialRange.to,
    outcome: '',
    actorCodeUser: '',
    action: '',
    resourceType: '',
    resourceId: '',
    correlationId: '',
    sourceService: '',
  });
  const [applied, setApplied] = useState<Filters>(filters);
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const token = accessToken || localStorage.getItem('keepguard_access_token') || '';

  const loadPage = async (nextPage = page, nextFilters = applied) => {
    if (!token) return;
    setLoading(true);
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
        },
        token
      );
      setItems(result.content || []);
      setPage(result.page ?? nextPage);
      setTotalPages(Math.max(result.totalPages || 1, 1));
      setTotalElements(result.totalElements || 0);
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
    }
  };

  useEffect(() => {
    loadPage(0, applied);
  }, [accessToken]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setApplied(filters);
    loadPage(0, filters);
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

  return (
    <div>
      <form className="table-toolbar" onSubmit={handleSearch} style={{ flexWrap: 'wrap' }}>
        <input
          className="form-input"
          type="datetime-local"
          value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          aria-label="De"
        />
        <input
          className="form-input"
          type="datetime-local"
          value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          aria-label="Até"
        />
        <select
          className="form-input"
          style={{ maxWidth: 140 }}
          value={filters.outcome}
          onChange={(e) => setFilters((f) => ({ ...f, outcome: e.target.value }))}
          aria-label="Resultado"
        >
          <option value="">Todos os resultados</option>
          <option value="SUCCESS">Sucesso</option>
          <option value="FAILURE">Falha</option>
          <option value="DENIED">Negado</option>
        </select>
        <div className="search-input-wrapper" style={{ minWidth: 160, flex: 1 }}>
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
          style={{ maxWidth: 140 }}
          placeholder="Ação"
          value={filters.action}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
        />
        <input
          className="form-input"
          style={{ maxWidth: 140 }}
          placeholder="Tipo do recurso"
          value={filters.resourceType}
          onChange={(e) => setFilters((f) => ({ ...f, resourceType: e.target.value }))}
        />
        <input
          className="form-input"
          style={{ maxWidth: 140 }}
          placeholder="ID do recurso"
          value={filters.resourceId}
          onChange={(e) => setFilters((f) => ({ ...f, resourceId: e.target.value }))}
        />
        <input
          className="form-input"
          style={{ maxWidth: 180 }}
          placeholder="Correlation ID"
          value={filters.correlationId}
          onChange={(e) => setFilters((f) => ({ ...f, correlationId: e.target.value }))}
        />
        <input
          className="form-input"
          style={{ maxWidth: 140 }}
          placeholder="Origem"
          value={filters.sourceService}
          onChange={(e) => setFilters((f) => ({ ...f, sourceService: e.target.value }))}
        />
        <button type="submit" className="btn btn-secondary btn-pill" disabled={loading}>
          <Search size={15} />
          <span>Filtrar</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-pill"
          onClick={() => loadPage(page, applied)}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
        </button>
      </form>

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Quem</th>
              <th>Ação</th>
              <th>Recurso</th>
              <th>Resultado</th>
              <th>Origem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Carregando eventos de auditoria...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <ScrollText size={22} />
                    <span>Nenhum evento de auditoria para os filtros atuais.</span>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((event) => (
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
        {items.map((event) => (
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
        <span style={{ fontSize: '0.85rem', color: '#5f6368' }}>
          {totalElements} evento{totalElements === 1 ? '' : 's'} · página {page + 1} de {totalPages}
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-outline btn-pill"
            disabled={loading || page <= 0}
            onClick={() => loadPage(page - 1, applied)}
          >
            Anterior
          </button>
          <button
            className="btn btn-outline btn-pill"
            disabled={loading || page >= totalPages - 1}
            onClick={() => loadPage(page + 1, applied)}
          >
            Próxima
          </button>
        </div>
      </div>

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
