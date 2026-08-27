import React, { useEffect, useState } from 'react';
import {
  Laptop,
  Smartphone,
  Tablet,
  CheckCircle2,
  Trash2,
  Search,
  Calendar,
  LogOut,
  RefreshCw,
  Ban,
} from 'lucide-react';
import { authService } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getDeviceInfo } from '../../utils/deviceUtils';
import type { DeviceSession } from '../../types/auth';

export const DeviceSessionsCard: React.FC = () => {
  const { accessToken } = useAuth();
  const { addToast } = useToast();
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [blockingId, setBlockingId] = useState<string | null>(null);
  const [isRevokingAll, setIsRevokingAll] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRenewMap, setAutoRenewMap] = useState<Record<string, boolean>>({});

  const loadSessions = async (showLoadingSpinner = true) => {
    const currentToken = accessToken || localStorage.getItem('keepguard_access_token');
    if (!currentToken) return;
    if (showLoadingSpinner) {
      setLoading(true);
    }
    try {
      const data = await authService.listUserSessions(currentToken);
      let sessionList = data || [];

      // Fallback inteligente: se o backend retornar lista vazia, exibe o dispositivo atual
      if (sessionList.length === 0) {
        const currentDev = getDeviceInfo();
        sessionList = [
          {
            sessionId: 'sess_current',
            deviceId: currentDev.deviceId,
            deviceName: currentDev.deviceName,
            deviceType: currentDev.deviceType,
            ipAddress: 'Sessão Ativa (Local)',
            location: 'Conectado agora',
            isCurrent: true,
            isTrusted: true,
            lastActiveAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
        ];
      }

      setSessions(sessionList);
      
      const renewState: Record<string, boolean> = {};
      sessionList.forEach((s) => {
        renewState[s.deviceId] = true;
      });
      setAutoRenewMap(renewState);
    } catch (err: any) {
      console.error('Erro ao carregar sessões:', err);
      // Se for 401 ou token revogado, não exibe fallback local (deixa o deslogamento ocorrer)
      if (err?.status === 401 || err?.data?.error === 'TOKEN_REVOKED') {
        addToast({
          type: 'error',
          title: 'Sessão Encerrada',
          description: 'Sua sessão foi revogada ou expirou. Redirecionando para login...',
        });
        return;
      }

      // Fallback apenas em caso de instabilidade temporária de rede
      const currentDev = getDeviceInfo();
      setSessions([
        {
          sessionId: 'sess_current',
          deviceId: currentDev.deviceId,
          deviceName: currentDev.deviceName,
          deviceType: currentDev.deviceType,
          ipAddress: 'Sessão Ativa (Local)',
          location: 'Conectado agora',
          isCurrent: true,
          isTrusted: true,
          lastActiveAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      if (showLoadingSpinner) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadSessions(true);
  }, []);

  const handleToggleAutoRenew = (deviceId: string) => {
    setAutoRenewMap((prev) => ({
      ...prev,
      [deviceId]: !prev[deviceId],
    }));
  };

  const handleBlockAndRevoke = async (session: DeviceSession) => {
    if (!accessToken || session.isCurrent) return;
    const confirmed = window.confirm(
      `Encerrar e bloquear “${session.deviceName || session.deviceId}”? Este aparelho não poderá entrar de novo na sua conta.`
    );
    if (!confirmed) return;

    setBlockingId(session.deviceId);
    try {
      await authService.addMyDeviceToBlacklist(
        {
          deviceId: session.deviceId,
          deviceName: session.deviceName,
          reason: 'Bloqueado pelo titular da conta',
        },
        accessToken
      );
      addToast({
        type: 'success',
        title: 'Dispositivo bloqueado',
        description: 'A sessão foi encerrada e o aparelho não poderá fazer login novamente.',
      });
      setSessions((prev) => prev.filter((s) => s.deviceId !== session.deviceId));
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Falha ao bloquear',
        description: err?.message || 'Não foi possível adicionar o dispositivo à blacklist.',
      });
    } finally {
      setBlockingId(null);
    }
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

  const handleRevokeAllOtherSessions = async () => {
    if (!accessToken) return;
    setIsRevokingAll(true);
    try {
      await authService.revokeAllOtherSessions(accessToken);
      addToast({
        type: 'success',
        title: 'Sessões encerradas',
        description: 'Todas as outras sessões foram revogadas com sucesso.',
      });
      setSessions((prev) => prev.filter((s) => s.isCurrent));
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Erro ao revogar sessões',
        description: err?.message || 'Não foi possível desconectar as outras sessões.',
      });
    } finally {
      setIsRevokingAll(false);
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
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Conectado agora';
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
      {/* Toolbar no estilo Hostinger hPanel com Ação Global Real */}
      <div className="table-toolbar">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Pesquisar por dispositivo, IP ou localização..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <button
            className="btn btn-secondary btn-pill"
            onClick={() => loadSessions(true)}
            disabled={loading}
            title="Recarregar lista de dispositivos"
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Atualizar</span>
          </button>

          <button
            className="btn btn-danger btn-pill"
            onClick={handleRevokeAllOtherSessions}
            disabled={isRevokingAll || sessions.filter(s => !s.isCurrent).length === 0}
            title="Encerrar todas as outras sessões abertas"
          >
            <LogOut size={15} />
            <span>{isRevokingAll ? 'Encerrando...' : 'Desconectar outros dispositivos'}</span>
          </button>
        </div>
      </div>

      {/* 1. VISÃO DESKTOP (Tabela Completa > 768px) */}
      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <input type="checkbox" style={{ accentColor: '#673de6' }} />
              </th>
              <th>Dispositivo / Identificador ↑↓</th>
              <th>Status ↑↓</th>
              <th>Última Atividade ↑↓</th>
              <th>Sessão Segura</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  <div className="btn-spinner-content" style={{ justifyContent: 'center' }}>
                    <span className="spinner-small" style={{ borderTopColor: '#673de6', borderColor: '#dcd2f9' }} />
                    <span>Carregando dispositivos e sessões conectadas...</span>
                  </div>
                </td>
              </tr>
            ) : filteredSessions.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Nenhum dispositivo encontrado para a pesquisa.
                </td>
              </tr>
            ) : (
              filteredSessions.map((session) => (
                <tr key={session.deviceId}>
                  <td>
                    <input type="checkbox" style={{ accentColor: '#673de6' }} />
                  </td>
                  <td>
                    <div className="table-cell-title">
                      {getDeviceIcon(session.deviceType || '')}
                      <span>{session.deviceName || 'Dispositivo Conectado'}</span>
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
                        disabled={revokingId === session.deviceId || blockingId === session.deviceId || session.isCurrent}
                      >
                        {session.isCurrent ? 'Sessão Ativa' : 'Desconectar'}
                      </button>
                      {!session.isCurrent && (
                        <button
                          className="btn-table-outline"
                          title="Encerrar sessão e impedir novos logins neste aparelho"
                          onClick={() => handleBlockAndRevoke(session)}
                          disabled={blockingId === session.deviceId || revokingId === session.deviceId}
                        >
                          <Ban size={14} />
                          {blockingId === session.deviceId ? 'Bloqueando...' : 'Encerrar e bloquear'}
                        </button>
                      )}
                      <button
                        className="btn-table-icon"
                        title="Desconectar dispositivo"
                        onClick={() => handleRevokeSession(session.deviceId)}
                        disabled={session.isCurrent || blockingId === session.deviceId}
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

      {/* 2. VISÃO MOBILE (Cards Empilhados para Celular <= 768px) */}
      <div className="mobile-cards-container">
        {loading ? (
          <div className="mobile-loading-card">
            <span className="spinner-small" style={{ borderTopColor: '#673de6', borderColor: '#dcd2f9' }} />
            <span>Carregando dispositivos...</span>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="mobile-loading-card">
            <span>Nenhum dispositivo encontrado.</span>
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div key={session.deviceId} className="mobile-domain-card">
              <div className="mobile-card-top">
                <div className="mobile-card-identity">
                  {getDeviceIcon(session.deviceType || '')}
                  <span className="mobile-domain-name">{session.deviceName || 'Dispositivo'}</span>
                </div>
                <div className="status-badge-hostinger">
                  <CheckCircle2 size={15} className="status-icon" />
                  <span>{session.isCurrent ? 'Sessão Atual' : 'Ativo'}</span>
                </div>
              </div>

              <div className="mobile-card-subinfo">
                <span>{session.ipAddress} • {session.location || 'Localidade protegida'}</span>
              </div>

              <div className="mobile-card-meta">
                <div className="meta-item">
                  <Calendar size={14} className="text-muted" />
                  <span>Última ativ.: <strong>{formatDate(session.lastActiveAt)}</strong></span>
                </div>
                <div className="meta-item-switch">
                  <span>Auto-renovação:</span>
                  <label className="switch-wrapper">
                    <input
                      type="checkbox"
                      className="switch-input"
                      checked={autoRenewMap[session.deviceId] ?? true}
                      onChange={() => handleToggleAutoRenew(session.deviceId)}
                    />
                    <span className="switch-slider" />
                  </label>
                </div>
              </div>

              <div className="mobile-card-actions">
                <button
                  className="btn-table-outline"
                  style={{ flex: 1 }}
                  onClick={() => handleRevokeSession(session.deviceId)}
                  disabled={revokingId === session.deviceId || blockingId === session.deviceId || session.isCurrent}
                >
                  {session.isCurrent ? 'Sessão Ativa' : 'Desconectar'}
                </button>
                {!session.isCurrent && (
                  <button
                    className="btn-table-outline"
                    style={{ flex: 1 }}
                    onClick={() => handleBlockAndRevoke(session)}
                    disabled={blockingId === session.deviceId || revokingId === session.deviceId}
                  >
                    {blockingId === session.deviceId ? 'Bloqueando...' : 'Encerrar e bloquear'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
