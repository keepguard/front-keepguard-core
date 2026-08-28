import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Activity } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  CONNECTION_GROUP_LABELS,
  isConnectionGroup,
  type ConnectionGroup,
} from '../../data/connectionsCatalog';
import {
  getConnectionsHealth,
  type ConnectionServiceStatus,
  type ConnectionsHealthSnapshot,
} from '../../services/connectionsHealth';

type StatusFilter = 'all' | 'healthy' | 'unhealthy';
type GroupFilter = 'all' | ConnectionGroup;

const statusLabel = (status: ConnectionServiceStatus['status'] | 'checking') => {
  if (status === 'healthy') return 'Online';
  if (status === 'unhealthy') return 'Offline';
  return 'Verificando';
};

function formatLatency(ms?: number, checking?: boolean): string {
  if (checking || ms === undefined) return '—';
  if (ms < 1) return '<1 ms';
  return `${ms} ms`;
}

function formatClock(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function remainingFromExpiresAt(expiresAt?: string): number {
  if (!expiresAt) return 0;
  const expires = new Date(expiresAt).getTime();
  if (Number.isNaN(expires)) return 0;
  return Math.max(0, Math.ceil((expires - Date.now()) / 1000));
}

export const ConnectionsView: React.FC = () => {
  const { accessToken } = useAuth();
  const [snapshot, setSnapshot] = useState<ConnectionsHealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');

  const load = useCallback(async () => {
    if (!accessToken) {
      setError('Sessão expirada. Entre novamente.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getConnectionsHealth(accessToken);
      setSnapshot(data);
      setRemainingSeconds(data.ttlSeconds);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 403) {
        setError('Acesso restrito a administradores.');
      } else if (status === 429) {
        setError('Muitas consultas. Aguarde um momento para verificar de novo.');
      } else {
        setError((err as Error).message || 'Não foi possível carregar as conexões.');
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!snapshot?.expiresAt) return;
    const tick = () => setRemainingSeconds(remainingFromExpiresAt(snapshot.expiresAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [snapshot?.expiresAt, snapshot?.checkedAt]);

  const services = snapshot?.services || [];

  const counts = useMemo(() => ({
    total: services.length,
    healthy: services.filter((item) => item.status === 'healthy').length,
    unhealthy: services.filter((item) => item.status === 'unhealthy').length,
  }), [services]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return services.filter((item) => {
      const group = isConnectionGroup(item.group) ? item.group : 'infra';
      if (groupFilter !== 'all' && group !== groupFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!term) return true;
      return (
        item.name.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        item.endpoint.toLowerCase().includes(term) ||
        CONNECTION_GROUP_LABELS[group].toLowerCase().includes(term)
      );
    });
  }, [groupFilter, searchTerm, services, statusFilter]);

  const freshnessLabel = snapshot
    ? snapshot.cached
      ? `Atualizado às ${formatClock(snapshot.checkedAt)} · próxima coleta em ${remainingSeconds}s`
      : `Coletado agora às ${formatClock(snapshot.checkedAt)} · válido por ${remainingSeconds}s`
    : null;

  return (
    <div className="connections-page">
      <div className="connections-summary">
        <button
          type="button"
          className={`connections-summary-chip ${statusFilter === 'all' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          <Activity size={14} />
          {counts.total} serviços
        </button>
        <button
          type="button"
          className={`connections-summary-chip is-ok ${statusFilter === 'healthy' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('healthy')}
        >
          {counts.healthy} online
        </button>
        <button
          type="button"
          className={`connections-summary-chip is-off ${statusFilter === 'unhealthy' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('unhealthy')}
        >
          {counts.unhealthy} offline
        </button>
        {loading && (
          <span className="connections-summary-chip is-wait">Verificando</span>
        )}
      </div>

      {freshnessLabel && (
        <p className="connections-freshness">{freshnessLabel}</p>
      )}
      {error && <p className="connections-error">{error}</p>}

      <div className="table-toolbar connections-toolbar">
        <div className="connections-toolbar-filters">
          <div className="search-input-wrapper">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Filtrar por serviço, tipo ou endpoint..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <select
            className="filter-select"
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value as GroupFilter)}
            aria-label="Filtrar por tipo"
          >
            <option value="all">Todos os tipos</option>
            {(Object.keys(CONNECTION_GROUP_LABELS) as ConnectionGroup[]).map((group) => (
              <option key={group} value={group}>{CONNECTION_GROUP_LABELS[group]}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-pill"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
          Atualizar
        </button>
      </div>

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Serviço</th>
              <th>Tipo</th>
              <th>Health</th>
              <th>Status</th>
              <th>Latência</th>
              <th>Verificado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="connections-empty">
                  {loading ? 'Carregando serviços...' : 'Nenhum serviço corresponde ao filtro.'}
                </td>
              </tr>
            ) : filtered.map((item) => {
              const group = isConnectionGroup(item.group) ? item.group : 'infra';
              return (
                <tr key={item.id}>
                  <td>
                    <div className="table-cell-title">{item.name}</div>
                    <div className="table-cell-muted">{item.description}</div>
                  </td>
                  <td>
                    <span className="connections-type-chip">{CONNECTION_GROUP_LABELS[group]}</span>
                  </td>
                  <td>
                    <code className="connections-endpoint">{item.endpoint}</code>
                  </td>
                  <td>
                    <span className={`connections-status-pill is-${item.status}`}>
                      <span className="connections-status-dot" />
                      {statusLabel(item.status)}
                    </span>
                  </td>
                  <td className="connections-latency">{formatLatency(item.latencyMs, loading)}</td>
                  <td className="table-cell-muted">{formatClock(snapshot?.checkedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="connections-mobile-list">
        {filtered.length === 0 ? (
          <p className="connections-empty">
            {loading ? 'Carregando serviços...' : 'Nenhum serviço corresponde ao filtro.'}
          </p>
        ) : filtered.map((item) => {
          const group = isConnectionGroup(item.group) ? item.group : 'infra';
          return (
            <article key={item.id} className="connections-mobile-card">
              <header>
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.description}</p>
                </div>
                <span className={`connections-status-pill is-${item.status}`}>
                  <span className="connections-status-dot" />
                  {statusLabel(item.status)}
                </span>
              </header>
              <dl>
                <div>
                  <dt>Tipo</dt>
                  <dd>{CONNECTION_GROUP_LABELS[group]}</dd>
                </div>
                <div>
                  <dt>Latência</dt>
                  <dd>{formatLatency(item.latencyMs, loading)}</dd>
                </div>
                <div>
                  <dt>Verificado</dt>
                  <dd>{formatClock(snapshot?.checkedAt)}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </div>
  );
};
