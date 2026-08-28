import React, { useEffect, useState } from 'react';
import { Ban, LockOpen, RefreshCw, Search, ShieldOff, Smartphone } from 'lucide-react';
import { authService } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { DeviceBlacklistEntry } from '../../types/auth';

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

export const MyDeviceBlacklistCard: React.FC = () => {
  const { accessToken } = useAuth();
  const { addToast } = useToast();
  const [items, setItems] = useState<DeviceBlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadList = async (showSpinner = true) => {
    const token = accessToken || localStorage.getItem('keepguard_access_token');
    if (!token) return;
    if (showSpinner) setLoading(true);
    try {
      const data = await authService.listMyDeviceBlacklist(token);
      setItems(data || []);
    } catch (err: any) {
      if (err?.status === 401) return;
      addToast({
        type: 'error',
        title: 'Não foi possível carregar a blacklist',
        description: err?.message || 'Tente novamente em instantes.',
      });
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    loadList(true);
  }, [accessToken]);

  const handleUnblock = async (entry: DeviceBlacklistEntry) => {
    const token = accessToken || localStorage.getItem('keepguard_access_token');
    if (!token || !entry.deviceId) return;
    const confirmed = window.confirm(
      `Desbloquear “${entry.deviceName || entry.deviceId}”? Esse aparelho poderá entrar de novo na sua conta.`
    );
    if (!confirmed) return;

    setRemovingId(entry.deviceId);
    try {
      await authService.removeMyDeviceFromBlacklist(entry.deviceId, token);
      setItems((prev) => prev.filter((item) => item.deviceId !== entry.deviceId));
      addToast({
        type: 'success',
        title: 'Dispositivo desbloqueado',
        description: 'Ele poderá fazer login novamente na sua conta.',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Falha ao desbloquear',
        description: err?.message || 'Não foi possível remover da blacklist.',
      });
    } finally {
      setRemovingId(null);
    }
  };

  const filtered = items.filter((item) => {
    const term = searchTerm.toLowerCase();
    return (
      (item.deviceName || '').toLowerCase().includes(term) ||
      (item.deviceId || '').toLowerCase().includes(term) ||
      (item.reason || '').toLowerCase().includes(term)
    );
  });

  return (
    <div>
      <div className="table-toolbar">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Pesquisar por nome, identificador ou motivo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          className="btn btn-secondary btn-pill"
          onClick={() => loadList(true)}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
          <span>Atualizar</span>
        </button>
      </div>

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Dispositivo</th>
              <th>Motivo</th>
              <th>Bloqueado em</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Carregando dispositivos bloqueados...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldOff size={22} />
                    <span>Nenhum aparelho bloqueado. Você pode bloquear a partir das sessões ativas.</span>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((entry) => (
                <tr key={entry.deviceId}>
                  <td>
                    <div className="table-cell-title" title={entry.deviceId}>
                      <Smartphone size={16} className="text-muted" />
                      <span>{entry.deviceName || 'Dispositivo bloqueado'}</span>
                    </div>
                  </td>
                  <td>{entry.reason || 'Bloqueado pelo usuário'}</td>
                  <td>{formatDate(entry.blockedAt)}</td>
                  <td>
                    <div className="table-actions-group" style={{ justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn-table-icon"
                        title="Desbloquear dispositivo"
                        aria-label="Desbloquear dispositivo"
                        onClick={() => handleUnblock(entry)}
                        disabled={removingId === entry.deviceId}
                      >
                        <LockOpen size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {loading ? (
          <div className="mobile-loading-card">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="mobile-loading-card">Nenhum aparelho bloqueado.</div>
        ) : (
          filtered.map((entry) => (
            <div key={entry.deviceId} className="mobile-domain-card">
              <div className="mobile-card-top">
                <div className="mobile-card-identity">
                  <Ban size={15} />
                  <span className="mobile-domain-name">{entry.deviceName || 'Dispositivo'}</span>
                </div>
              </div>
              <div className="mobile-card-subinfo">{entry.reason || 'Bloqueado pelo usuário'}</div>
              <div className="mobile-card-meta">
                <span>Em {formatDate(entry.blockedAt)}</span>
              </div>
              <div className="mobile-card-actions table-actions-group">
                <button
                  type="button"
                  className="btn-table-icon"
                  title="Desbloquear dispositivo"
                  aria-label="Desbloquear dispositivo"
                  onClick={() => handleUnblock(entry)}
                  disabled={removingId === entry.deviceId}
                >
                  <LockOpen size={15} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
