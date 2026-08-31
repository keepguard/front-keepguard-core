import React, { useEffect, useState } from 'react';
import { LogOut, RefreshCw, Search, Smartphone } from 'lucide-react';
import { authService } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { DeviceSession } from '../../types/auth';
import { canWriteTenantDevice } from '../../utils/roles';

function formatDate(isoDate?: string) {
  if (!isoDate) return '—';
  try {
    return new Date(isoDate).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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

export const TenantSessionsCard: React.FC = () => {
  const { accessToken } = useAuth();
  const { addToast } = useToast();
  const [items, setItems] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [filters, setFilters] = useState({ userId: '', deviceId: '' });
  const [applied, setApplied] = useState(filters);
  const [revokingKey, setRevokingKey] = useState<string | null>(null);

  const token = accessToken || localStorage.getItem('keepguard_access_token') || '';

  const loadPage = async (nextPage = page, nextFilters = applied) => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await authService.searchTenantSessions(
        {
          userId: nextFilters.userId || undefined,
          deviceId: nextFilters.deviceId || undefined,
          page: nextPage,
          size: 20,
        },
        token
      );
      setItems(result.content);
      setPage(result.page);
      setTotalPages(Math.max(result.totalPages, 1));
      setTotalElements(result.totalElements);
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        addToast({
          type: 'error',
          title: 'Acesso restrito',
          description: 'Somente ADMIN, SYSTEM e MANAGER consultam as sessões do tenant.',
        });
        return;
      }
      addToast({
        type: 'error',
        title: 'Falha ao consultar sessões',
        description: err?.message || 'Tente novamente em instantes.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage(0, applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setApplied(filters);
    loadPage(0, filters);
  };

  const handleRevoke = async (session: DeviceSession) => {
    if (!session.codeUser || !session.deviceId) {
      addToast({
        type: 'warning',
        title: 'Dados incompletos',
        description: 'Não foi possível identificar o usuário desta sessão.',
      });
      return;
    }
    if (!canWriteTenantDevice(session.writable)) {
      addToast({
        type: 'error',
        title: 'Acesso restrito',
        description: 'MANAGER não pode revogar sessão de ADMIN, SYSTEM ou outro MANAGER.',
      });
      return;
    }
    const confirmed = window.confirm(
      `Encerrar a sessão de “${session.deviceName || session.deviceId}” do usuário ${session.codeUser}?`
    );
    if (!confirmed) return;

    const key = `${session.codeUser}:${session.deviceId}`;
    setRevokingKey(key);
    try {
      await authService.revokeTenantUserSession(session.codeUser, session.deviceId, token);
      addToast({
        type: 'success',
        title: 'Sessão encerrada',
        description: 'O dispositivo foi desconectado.',
      });
      loadPage(page, applied);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Falha ao encerrar sessão',
        description: err?.message || 'Não foi possível revogar a sessão.',
      });
    } finally {
      setRevokingKey(null);
    }
  };

  return (
    <div>
      <form className="table-toolbar" onSubmit={handleSearch} style={{ flexWrap: 'wrap' }}>
        <div className="search-input-wrapper" style={{ minWidth: 180, flex: 1 }}>
          <Search size={16} className="search-icon" />
          <input
            className="search-input"
            placeholder="Usuário (UUID)"
            value={filters.userId}
            onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))}
          />
        </div>
        <input
          className="form-input"
          style={{ maxWidth: 180 }}
          placeholder="Device ID"
          value={filters.deviceId}
          onChange={(e) => setFilters((f) => ({ ...f, deviceId: e.target.value }))}
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
              <th>Usuário</th>
              <th>Dispositivo</th>
              <th>IP</th>
              <th>Última atividade</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Carregando sessões do tenant...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <Smartphone size={22} />
                    <span>Nenhuma sessão ativa para os filtros atuais.</span>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((session) => {
                const key = `${session.codeUser}:${session.deviceId}`;
                return (
                  <tr key={key}>
                    <td>
                      <span className="id-compact" title={session.codeUser || undefined}>
                        {compactId(session.codeUser)}
                      </span>
                    </td>
                    <td>
                      <div className="table-cell-title" title={session.deviceId}>
                        <Smartphone size={14} />
                        <span>{session.deviceName || 'Dispositivo'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="id-compact">{session.ipAddress || '—'}</span>
                    </td>
                    <td>{formatDate(session.lastActiveAt)}</td>
                    <td>
                      <div className="table-actions-group" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn-table-icon"
                          title={
                            session.writable === false
                              ? 'Sem permissão para revogar esta sessão'
                              : 'Encerrar sessão'
                          }
                          aria-label="Encerrar sessão"
                          onClick={() => handleRevoke(session)}
                          disabled={revokingKey === key || !canWriteTenantDevice(session.writable)}
                        >
                          <LogOut size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
        <span style={{ fontSize: '0.85rem', color: '#5f6368' }}>
          {totalElements} sessão{totalElements === 1 ? '' : 'ões'} · página {page + 1} de {totalPages}
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
    </div>
  );
};
