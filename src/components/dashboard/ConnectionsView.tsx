import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Activity } from 'lucide-react';
import {
  CONNECTION_GROUP_LABELS,
  CONNECTION_TARGETS,
  type ConnectionGroup,
  type ConnectionTarget,
} from '../../data/connectionsCatalog';
import { probeConnection, type ProbeResult, type ProbeStatus } from '../../services/connectionsHealth';

type StatusFilter = 'all' | 'healthy' | 'unhealthy';
type GroupFilter = 'all' | ConnectionGroup;

type RowState = ProbeResult & { status: ProbeStatus };

const statusLabel = (status: ProbeStatus) => {
  if (status === 'healthy') return 'Online';
  if (status === 'unhealthy') return 'Offline';
  return 'Verificando';
};

function formatLatency(ms?: number, status?: ProbeStatus): string {
  if (status === 'checking' || ms === undefined) return '—';
  if (ms < 1) return '<1 ms';
  return `${ms} ms`;
}

function formatCheckedAt(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function emptyRow(): RowState {
  return { status: 'checking', latencyMs: 0, checkedAt: 0 };
}

export const ConnectionsView: React.FC = () => {
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(CONNECTION_TARGETS.map((target) => [target.id, emptyRow()]))
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const checkTarget = useCallback(async (target: ConnectionTarget) => {
    setCheckingId(target.id);
    setRows((prev) => ({
      ...prev,
      [target.id]: { ...(prev[target.id] || emptyRow()), status: 'checking' },
    }));
    const result = await probeConnection(target);
    setRows((prev) => ({ ...prev, [target.id]: result }));
    setCheckingId((current) => (current === target.id ? null : current));
  }, []);

  const checkAll = useCallback(async () => {
    setCheckingId('all');
    setRows((prev) =>
      Object.fromEntries(CONNECTION_TARGETS.map((target) => [
        target.id,
        { ...(prev[target.id] || emptyRow()), status: 'checking' as const },
      ]))
    );
    const results = await Promise.all(
      CONNECTION_TARGETS.map(async (target) => [target.id, await probeConnection(target)] as const)
    );
    setRows(Object.fromEntries(results));
    setCheckingId(null);
  }, []);

  useEffect(() => {
    void checkAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const values = CONNECTION_TARGETS.map((target) => rows[target.id]?.status || 'checking');
    return {
      total: values.length,
      healthy: values.filter((status) => status === 'healthy').length,
      unhealthy: values.filter((status) => status === 'unhealthy').length,
      checking: values.filter((status) => status === 'checking').length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return CONNECTION_TARGETS.filter((target) => {
      const state = rows[target.id];
      if (groupFilter !== 'all' && target.group !== groupFilter) return false;
      if (statusFilter !== 'all' && state?.status !== statusFilter) return false;
      if (!term) return true;
      return (
        target.name.toLowerCase().includes(term) ||
        target.description.toLowerCase().includes(term) ||
        target.endpoint.toLowerCase().includes(term) ||
        CONNECTION_GROUP_LABELS[target.group].toLowerCase().includes(term)
      );
    });
  }, [groupFilter, rows, searchTerm, statusFilter]);

  const isRefreshingAll = checkingId === 'all';

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
        {counts.checking > 0 && (
          <span className="connections-summary-chip is-wait">{counts.checking} verificando</span>
        )}
      </div>

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
          onClick={() => void checkAll()}
          disabled={isRefreshingAll}
        >
          <RefreshCw size={15} className={isRefreshingAll ? 'spin' : ''} />
          Verificar todas
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
              <th style={{ textAlign: 'right' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="connections-empty">
                  Nenhum serviço corresponde ao filtro.
                </td>
              </tr>
            ) : filtered.map((target) => {
              const state = rows[target.id] || emptyRow();
              const busy = state.status === 'checking';
              return (
                <tr key={target.id}>
                  <td>
                    <div className="table-cell-title">{target.name}</div>
                    <div className="table-cell-muted">{target.description}</div>
                  </td>
                  <td>
                    <span className="connections-type-chip">{CONNECTION_GROUP_LABELS[target.group]}</span>
                  </td>
                  <td>
                    <code className="connections-endpoint">{target.endpoint}</code>
                  </td>
                  <td>
                    <span className={`connections-status-pill is-${state.status}`}>
                      <span className="connections-status-dot" />
                      {statusLabel(state.status)}
                    </span>
                  </td>
                  <td className="connections-latency">{formatLatency(state.latencyMs, state.status)}</td>
                  <td className="table-cell-muted">{formatCheckedAt(state.checkedAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn-table-icon"
                      onClick={() => void checkTarget(target)}
                      disabled={busy}
                      title={`Verificar ${target.name}`}
                    >
                      <RefreshCw size={15} className={busy ? 'spin' : ''} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="connections-mobile-list">
        {filtered.length === 0 ? (
          <p className="connections-empty">Nenhum serviço corresponde ao filtro.</p>
        ) : filtered.map((target) => {
          const state = rows[target.id] || emptyRow();
          const busy = state.status === 'checking';
          return (
            <article key={target.id} className="connections-mobile-card">
              <header>
                <div>
                  <strong>{target.name}</strong>
                  <p>{target.description}</p>
                </div>
                <span className={`connections-status-pill is-${state.status}`}>
                  <span className="connections-status-dot" />
                  {statusLabel(state.status)}
                </span>
              </header>
              <dl>
                <div>
                  <dt>Tipo</dt>
                  <dd>{CONNECTION_GROUP_LABELS[target.group]}</dd>
                </div>
                <div>
                  <dt>Latência</dt>
                  <dd>{formatLatency(state.latencyMs, state.status)}</dd>
                </div>
              </dl>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={() => void checkTarget(target)}
                disabled={busy}
              >
                <RefreshCw size={15} className={busy ? 'spin' : ''} />
                Verificar
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
};
