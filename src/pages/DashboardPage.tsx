import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ChangePasswordModal } from '../components/auth/ChangePasswordModal';
import { DeviceSessionsCard } from '../components/dashboard/DeviceSessionsCard';
import {
  User,
  Shield,
  Key,
  LogOut,
  RefreshCw,
  Clock,
  CheckCircle,
  Activity,
  Layers,
  Fingerprint,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const {
    user,
    accessToken,
    refreshToken,
    lastRefreshTime,
    refreshCount,
    logout,
    performRefreshToken,
  } = useAuth();

  const { addToast } = useToast();
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const formatRefreshTime = (date: Date | null) => {
    if (!date) return 'Login inicial';
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      const success = await performRefreshToken();
      if (success) {
        addToast({
          type: 'success',
          title: 'Token Renovado com Sucesso!',
          description: 'Um novo par de Access Token e Refresh Token foi gerado e validado no servidor.',
        });
      } else {
        addToast({
          type: 'error',
          title: 'Falha na renovação',
          description: 'Não foi possível renovar a sessão. Verifique suas credenciais.',
        });
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Erro ao renovar token',
        description: err?.message || 'Ocorreu um erro ao comunicar com o serviço de autenticação.',
      });
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    addToast({
      type: 'info',
      title: 'Sessão finalizada',
      description: 'Você saiu da sua conta com segurança.',
    });
  };

  return (
    <div className="dashboard-container animate-fade-in">
      <div className="dashboard-header">
        <div>
          <div className="dashboard-badge">
            <Shield size={14} className="text-primary" />
            <span>Área Logada Segura</span>
          </div>
          <h1 className="dashboard-title">
            Bem-vindo(a), <span className="text-gradient">{user?.name || user?.username}</span>
          </h1>
          <p className="dashboard-subtitle">
            Gerencie sua sessão ativa, credenciais e monitore a renovação automática de segurança.
          </p>
        </div>

        <div className="dashboard-top-actions">
          <button
            className="btn btn-outline"
            onClick={() => setIsChangePasswordOpen(true)}
          >
            <Key size={16} /> Alterar Senha
          </button>
          <button
            className="btn btn-danger"
            onClick={handleLogout}
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Card de Identidade do Usuário */}
        <div className="dash-card">
          <div className="dash-card-header">
            <div className="dash-card-icon"><User size={20} /></div>
            <h3>Identidade & Permissões</h3>
          </div>
          <div className="dash-card-body">
            <div className="info-row">
              <span className="info-label">Nome de Usuário</span>
              <span className="info-value">{user?.username}</span>
            </div>
            <div className="info-row">
              <span className="info-label">E-mail</span>
              <span className="info-value">{user?.email}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Código Único (UUID)</span>
              <span className="info-value text-mono text-muted">{user?.codeUser || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Aplicação (Tenant)</span>
              <span className="info-value text-mono text-muted">{user?.tenantId}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Perfis de Acesso (Roles)</span>
              <div className="roles-list">
                {user?.roles?.map((r, i) => (
                  <span key={i} className="badge-role">{r}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Card de Sessão e Auto-Refresh */}
        <div className="dash-card">
          <div className="dash-card-header">
            <div className="dash-card-icon"><Activity size={20} /></div>
            <h3>Sessão Ativa & Auto-Refresh</h3>
          </div>
          <div className="dash-card-body">
            <div className="refresh-status-box">
              <div className="refresh-status-icon">
                <CheckCircle size={24} className="text-success" />
              </div>
              <div>
                <strong>Monitor de Atividade Ativo</strong>
                <p>Enquanto você interage com a página, a sessão é renovada automaticamente em segundo plano a cada 45 segundos.</p>
              </div>
            </div>

            <div className="info-row">
              <span className="info-label"><Clock size={14} /> Último Refresh</span>
              <span className="info-value">
                {formatRefreshTime(lastRefreshTime)}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label"><Layers size={14} /> Total de Renovações</span>
              <span className="info-value"><strong>{refreshCount}</strong> ciclos</span>
            </div>

            <button
              id="btn-force-refresh"
              className="btn btn-secondary btn-block mt-4"
              onClick={handleManualRefresh}
              disabled={isManualRefreshing}
            >
              <RefreshCw size={16} className={isManualRefreshing ? 'spin' : ''} />
              {isManualRefreshing ? 'Renovando Sessão...' : 'Forçar Renovação de Token (POST /auth/refresh)'}
            </button>
          </div>
        </div>
      </div>

      {/* Seção de Dispositivos e Sessões Ativas */}
      <div className="mt-6">
        <DeviceSessionsCard />
      </div>

      {/* Seção de Inspeção de Tokens */}
      <div className="dash-card full-width mt-6">
        <div className="dash-card-header">
          <div className="dash-card-icon"><Fingerprint size={20} /></div>
          <h3>Tokens de Segurança em Memória</h3>
        </div>
        <div className="dash-card-body">
          <div className="token-display-group">
            <label className="form-label">Access Token (JWT)</label>
            <div className="token-code-box">
              <code>{accessToken || 'Nenhum token ativo'}</code>
            </div>
          </div>

          <div className="token-display-group mt-4">
            <label className="form-label">Refresh Token</label>
            <div className="token-code-box">
              <code>{refreshToken || 'Nenhum refresh token ativo'}</code>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Alteração de Senha */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
};
