import React, { useState } from 'react';
import {
  User,
  RefreshCw,
  Clock,
  CheckCircle,
  Activity,
  Layers,
  Fingerprint,
  Copy,
  Check,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export const SecurityCredentialsView: React.FC = () => {
  const {
    user,
    accessToken,
    lastRefreshTime,
    refreshCount,
    performRefreshToken,
  } = useAuth();
  const { addToast } = useToast();
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const formatRefreshTime = (date: Date | null) => {
    if (!date) return 'Login inicial';
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const handleCopyToken = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    addToast({
      type: 'info',
      title: 'Token JWT Copiado!',
      description: 'Access Token copiado para a área de transferência.',
      duration: 3000,
    });
    setTimeout(() => setCopiedToken(false), 2500);
  };

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      const success = await performRefreshToken();
      if (success) {
        addToast({
          type: 'success',
          title: 'Token Renovado com Sucesso!',
          description: 'Um novo par de Access Token foi gerado e validado no servidor.',
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

  return (
    <>
      <div className="dashboard-grid">
        <div className="dash-card">
          <div className="dash-card-header">
            <div className="dash-card-icon"><Activity size={18} /></div>
            <h3>Sessão Ativa & Auto-Refresh Proativo</h3>
          </div>
          <div className="dash-card-body">
            <div className="refresh-status-box">
              <div className="refresh-status-icon">
                <CheckCircle size={22} className="text-success" />
              </div>
              <div>
                <strong>Monitor de Atividade Ativo</strong>
                <p>Enquanto você interage com a plataforma, o token é renovado automaticamente a cada 45 segundos no BFF-Auth.</p>
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

            <div style={{ marginTop: '1.25rem' }}>
              <button
                id="btn-force-refresh"
                className="btn btn-secondary btn-block"
                onClick={handleManualRefresh}
                disabled={isManualRefreshing}
              >
                <RefreshCw size={16} className={isManualRefreshing ? 'spin' : ''} />
                {isManualRefreshing ? 'Renovando Token...' : 'Forçar Renovação (POST /auth/refresh)'}
              </button>
            </div>
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-header">
            <div className="dash-card-icon"><User size={18} /></div>
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
      </div>

      <div className="dash-card full-width" style={{ marginTop: '1.5rem' }}>
        <div className="dash-card-header">
          <div className="dash-card-icon"><Fingerprint size={18} /></div>
          <div>
            <h3 style={{ margin: 0 }}>Token de Autenticação JWT Ativo (Bearer Token)</h3>
            <span style={{ fontSize: '0.8rem', color: '#5f6368' }}>
              Utilizado para autorização segura e rotação contínua de sessão no BFF-Auth
            </span>
          </div>
        </div>
        <div className="dash-card-body">
          <div className="token-display-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Lock size={14} className="text-primary" />
                <span className="form-label" style={{ fontSize: '0.85rem' }}>JSON Web Token (Assinado via RS256)</span>
              </div>
              <button
                className="link-btn bold"
                onClick={() => handleCopyToken(accessToken || '')}
                disabled={!accessToken}
              >
                {copiedToken ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                <span>{copiedToken ? 'Copiado!' : 'Copiar Token'}</span>
              </button>
            </div>
            <div className="token-code-box">
              <code>{accessToken || 'Nenhum token ativo'}</code>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
