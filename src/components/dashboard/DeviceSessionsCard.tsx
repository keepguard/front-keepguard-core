import React, { useEffect, useState } from 'react';
import { Laptop, Smartphone, Tablet, Shield, Trash2, LogOut, CheckCircle2, RefreshCw } from 'lucide-react';
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

  const loadSessions = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const data = await authService.listUserSessions(accessToken);
      setSessions(data || []);
    } catch (err: any) {
      console.error('Erro ao carregar sessões:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [accessToken]);

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

  const handleRevokeOtherSessions = async () => {
    if (!accessToken) return;
    setRevokingId('ALL_OTHERS');
    try {
      await authService.revokeAllOtherSessions(accessToken);
      addToast({
        type: 'success',
        title: 'Outras sessões encerradas',
        description: 'Todos os outros dispositivos conectados foram deslogados.',
      });
      setSessions((prev) => prev.filter((s) => s.isCurrent));
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Falha ao desconectar',
        description: err?.message || 'Não foi possível desconectar outros dispositivos.',
      });
    } finally {
      setRevokingId(null);
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'MOBILE':
        return <Smartphone className="w-5 h-5 text-indigo-400" />;
      case 'TABLET':
        return <Tablet className="w-5 h-5 text-purple-400" />;
      default:
        return <Laptop className="w-5 h-5 text-cyan-400" />;
    }
  };

  const hasOtherSessions = sessions.some((s) => !s.isCurrent);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-white">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Dispositivos & Sessões Ativas</h3>
            <p className="text-xs text-slate-400">Controle onde sua conta está conectada no momento</p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadSessions}
          disabled={loading}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          title="Atualizar sessões"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && sessions.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-sm">Carregando aparelhos conectados...</div>
      ) : sessions.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-sm">Nenhuma sessão ativa encontrada.</div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.deviceId || session.sessionId}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                session.isCurrent
                  ? 'bg-indigo-950/20 border-indigo-500/30 shadow-sm'
                  : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/70'
              }`}
            >
              <div className="flex items-center space-x-3.5">
                <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700">
                  {getDeviceIcon(session.deviceType)}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-semibold text-white">{session.deviceName || 'Dispositivo Web'}</p>
                    {session.isCurrent && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Dispositivo Atual
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {session.ipAddress ? `IP: ${session.ipAddress}` : 'Conexão recente'} • Ativo em:{' '}
                    {new Date(session.lastActiveAt).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              {!session.isCurrent && (
                <button
                  type="button"
                  onClick={() => handleRevokeSession(session.deviceId)}
                  disabled={revokingId === session.deviceId}
                  className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition flex items-center space-x-1 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Desconectar</span>
                </button>
              )}
            </div>
          ))}

          {hasOtherSessions && (
            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleRevokeOtherSessions}
                disabled={revokingId === 'ALL_OTHERS'}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-red-950/40 border border-slate-700 hover:border-red-500/40 text-slate-300 hover:text-red-400 text-xs font-medium transition flex items-center space-x-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Desconectar todas as outras sessões</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
