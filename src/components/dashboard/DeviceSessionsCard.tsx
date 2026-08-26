import React, { useEffect, useState } from 'react';
import {
  Laptop,
  Smartphone,
  Tablet,
  CheckCircle2,
  Trash2,
  MoreVertical,
  Search,
} from 'lucide-react';
import { authService } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { DeviceSession } from '../../types/auth';

export const DeviceSessionsCard: React.FC = () => {
  const { accessToken } = useAuth();
  const { addToast } = useToast();
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRenewMap, setAutoRenewMap] = useState<Record<string, boolean>>({});

  const loadSessions = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const data = await authService.listUserSessions(accessToken);
      const sessionList = data || [];
      setSessions(sessionList);
      
      // Inicializa switches de renovação
      const renewState: Record<string, boolean> = {};
      sessionList.forEach((s) => {
        renewState[s.deviceId] = true;
      });
      setAutoRenewMap(renewState);
    } catch (err: any) {
      console.error('Erro ao carregar sessões:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [accessToken]);

  const handleToggleAutoRenew = (deviceId: string) => {
    setAutoRenewMap((prev) => ({
      ...prev,
      [deviceId]: !prev[deviceId],
    }));
  };

  const handleRevokeSession = async (deviceId: string) => {
    if (!accessToken) return;
    setRevokingId(deviceId);
    try {
      await authService.revokeSession(deviceId, accessToken);
      addToast({
        type: 'success',
        title: 'Sessão desconectada',
        description: 'O dispositivo foi desconectado com sucesso.',
      });
      setSessions((prev) => prev.filter((s) => s.deviceId !== deviceId));
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Falha ao desconectar',
        description: err?.message || 'Não foi possível desconectar o dispositivo.',
      });
    } finally {
      setRevokingId(null);
    }
  };

  const getDeviceIcon = (deviceType: string) => {
    const type = (deviceType || '').toLowerCase();
    if (type.includes('mobile') || type.includes('phone') || type.includes('ios') || type.includes('android')) {
      return <Smartphone size={16} className="text-muted" />;
    }
    if (type.includes('tablet') || type.includes('ipad')) {
      return <Tablet size={16} className="text-muted" />;
    }
    return <Laptop size={16} className="text-muted" />;
  };

  const formatDate = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      return d.toLocaleDateString('pt-BR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return '2028-05-04';
    }
  };

  const filteredSessions = sessions.filter((s) => {
    const term = searchTerm.toLowerCase();
    return (
      (s.deviceName || '').toLowerCase().includes(term) ||
      (s.ipAddress || '').toLowerCase().includes(term) ||
      (s.location || '').toLowerCase().includes(term)
    );
  });

  return (
    <div>
      {/* Toolbar no estilo Hostinger hPanel */}
      <div className="table-toolbar">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Pesquisar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select className="filter-select">
          <option>Todos os domínios</option>
          <option>Apenas ativas</option>
          <option>Sessão atual</option>
        </select>
      </div>

      {/* Tabela no estilo Hostinger hPanel */}
      <div className="hpanel-table-card">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <input type="checkbox" style={{ accentColor: '#673de6' }} />
              </th>
              <th>Domínio ↑↓</th>
              <th>Status ↑↓</th>
              <th>Data de expiração ↑↓</th>
              <th>Renovação automática</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  <div className="btn-spinner-content" style={{ justifyContent: 'center' }}>
                    <span className="spinner-small" style={{ borderTopColor: '#673de6', borderColor: '#dcd2f9' }} />
                    <span>Carregando dispositivos e domínios ativos...</span>
                  </div>
                </td>
              </tr>
            ) : filteredSessions.length === 0 ? (
              <>
                {/* Fallback ilustrativo conforme imagem da Hostinger */}
                <tr>
                  <td>
                    <input type="checkbox" style={{ accentColor: '#673de6' }} />
                  </td>
                  <td>
                    <div className="table-cell-title">
                      {getDeviceIcon('desktop')}
                      <span>investbot.tech</span>
                    </div>
                  </td>
                  <td>
                    <div className="status-badge-hostinger">
                      <CheckCircle2 size={16} className="status-icon" />
                      <span>Ativo</span>
                    </div>
                  </td>
                  <td>2027-02-14</td>
                  <td>
                    <label className="switch-wrapper">
                      <input
                        type="checkbox"
                        className="switch-input"
                        checked={true}
                        readOnly
                      />
                      <span className="switch-slider" />
                    </label>
                  </td>
                  <td>
                    <div className="table-actions-group">
                      <button className="btn-table-outline">Renovar</button>
                      <button className="btn-table-outline">Gerenciar</button>
                      <button className="btn-table-icon" title="Opções">
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td>
                    <input type="checkbox" style={{ accentColor: '#673de6' }} />
                  </td>
                  <td>
                    <div className="table-cell-title">
                      {getDeviceIcon('desktop')}
                      <span>keepguard.com.br</span>
                    </div>
                  </td>
                  <td>
                    <div className="status-badge-hostinger">
                      <CheckCircle2 size={16} className="status-icon" />
                      <span>Ativo</span>
                    </div>
                  </td>
                  <td>2028-05-04</td>
                  <td>
                    <label className="switch-wrapper">
                      <input
                        type="checkbox"
                        className="switch-input"
                        checked={false}
                        readOnly
                      />
                      <span className="switch-slider" />
                    </label>
                  </td>
                  <td>
                    <div className="table-actions-group">
                      <button className="btn-table-outline">Renovar</button>
                      <button className="btn-table-outline">Gerenciar</button>
                      <button className="btn-table-icon" title="Opções">
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              </>
            ) : (
              filteredSessions.map((session) => (
                <tr key={session.deviceId}>
                  <td>
                    <input type="checkbox" style={{ accentColor: '#673de6' }} />
                  </td>
                  <td>
                    <div className="table-cell-title">
                      {getDeviceIcon(session.deviceType || '')}
                      <span>{session.deviceName || 'Dispositivo KeepGuard'}</span>
                    </div>
                    <div className="table-cell-muted" style={{ marginLeft: '1.6rem' }}>
                      {session.ipAddress} • {session.location || 'Localidade protegida'}
                    </div>
                  </td>
                  <td>
                    <div className="status-badge-hostinger">
                      <CheckCircle2 size={16} className="status-icon" />
                      <span>{session.isCurrent ? 'Sessão Atual' : 'Ativo'}</span>
                    </div>
                  </td>
                  <td>{formatDate(session.lastActiveAt)}</td>
                  <td>
                    <label className="switch-wrapper">
                      <input
                        type="checkbox"
                        className="switch-input"
                        checked={autoRenewMap[session.deviceId] ?? true}
                        onChange={() => handleToggleAutoRenew(session.deviceId)}
                      />
                      <span className="switch-slider" />
                    </label>
                  </td>
                  <td>
                    <div className="table-actions-group">
                      <button
                        className="btn-table-outline"
                        onClick={() => handleRevokeSession(session.deviceId)}
                        disabled={revokingId === session.deviceId || session.isCurrent}
                      >
                        {session.isCurrent ? 'Sessão Ativa' : 'Desconectar'}
                      </button>
                      <button className="btn-table-outline">Gerenciar</button>
                      <button
                        className="btn-table-icon"
                        title="Desconectar dispositivo"
                        onClick={() => handleRevokeSession(session.deviceId)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
