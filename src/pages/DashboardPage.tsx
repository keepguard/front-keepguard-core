import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ChangePasswordModal } from '../components/auth/ChangePasswordModal';
import { DeviceSessionsCard } from '../components/dashboard/DeviceSessionsCard';
import { MyDeviceBlacklistCard } from '../components/dashboard/MyDeviceBlacklistCard';
import { AdminDeviceBlacklistCard } from '../components/dashboard/AdminDeviceBlacklistCard';
import { TemplateShowcaseView } from '../components/templates/TemplateShowcaseView';
import { hasAdminOrManagerRole } from '../utils/roles';
import {
  User,
  LogOut,
  RefreshCw,
  Clock,
  CheckCircle,
  Activity,
  Layers,
  Fingerprint,
  Shield,
  Key,
  Copy,
  Check,
  FileText,
  Lock,
  Ban,
  ShieldAlert,
} from 'lucide-react';

interface DashboardPageProps {
  activeTab?: string;
  onNavigateTab?: (tab: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  activeTab = 'overview',
  onNavigateTab,
}) => {
  const {
    user,
    accessToken,
    lastRefreshTime,
    refreshCount,
    logout,
    performRefreshToken,
  } = useAuth();

  const { addToast } = useToast();
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);
  const canManageTenantBlacklist = hasAdminOrManagerRole(user?.roles);

  useEffect(() => {
    if (activeTab === 'admin-blacklist' && !canManageTenantBlacklist && onNavigateTab) {
      onNavigateTab('blacklist');
    }
  }, [activeTab, canManageTenantBlacklist, onNavigateTab]);

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
      {/* 1. SE ABA: TEMPLATES / SHOWCASE */}
      {activeTab === 'templates' && <TemplateShowcaseView />}

      {/* 2. SE ABA: VISÃO GERAL (OVERVIEW) */}
      {activeTab === 'overview' && (
        <>
          <div className="dashboard-header">
            <div className="dashboard-title-group">
              <h1 className="dashboard-title">Visão Geral de Segurança</h1>
              <p className="dashboard-subtitle">
                Bem-vindo(a), <strong>{user?.name || user?.username}</strong>. Acompanhe a saúde da sua conta e credenciais ativas.
              </p>
            </div>

            <div className="dashboard-top-actions">
              <button
                className="btn btn-outline btn-pill"
                onClick={() => setIsChangePasswordOpen(true)}
              >
                <Key size={16} />
                <span>Alterar Senha</span>
              </button>
              
              <button
                className="btn btn-danger btn-pill"
                onClick={handleLogout}
              >
                <LogOut size={16} />
                <span>Sair</span>
              </button>
            </div>
          </div>

          {/* KPI Cards de Resumo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
            <div className="dash-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div className="dash-card-icon"><Shield size={18} /></div>
                <span style={{ fontSize: '0.88rem', color: '#5f6368', fontWeight: 600 }}>Status da Conta</span>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#00b090', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={22} />
                <span>Protegida</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#5f6368', marginTop: '0.35rem' }}>
                Tenant: <span className="text-mono" style={{ fontWeight: 600, color: '#1d2129' }}>{user?.tenantId?.substring(0, 8)}...</span>
              </div>
            </div>

            <div className="dash-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div className="dash-card-icon"><Activity size={18} /></div>
                <span style={{ fontSize: '0.88rem', color: '#5f6368', fontWeight: 600 }}>Auto-Refresh Ativo</span>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1d2129' }}>
                {refreshCount} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#5f6368' }}>ciclos</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#5f6368', marginTop: '0.35rem' }}>
                Última renovação: <strong>{formatRefreshTime(lastRefreshTime)}</strong>
              </div>
            </div>

            <div className="dash-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div className="dash-card-icon"><User size={18} /></div>
                <span style={{ fontSize: '0.88rem', color: '#5f6368', fontWeight: 600 }}>Permissão Principal</span>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#673de6' }}>
                {user?.roles?.[0] || 'ROLE_USER'}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#5f6368', marginTop: '0.35rem' }}>
                {user?.email}
              </div>
            </div>
          </div>

          {/* Tabela de Dispositivos Conectados */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1d2129' }}>Dispositivos & Sessões Conectadas</h2>
              {onNavigateTab && (
                <button className="link-btn bold" onClick={() => onNavigateTab('sessions')}>
                  Ver detalhes completos &rarr;
                </button>
              )}
            </div>
            <DeviceSessionsCard />
          </div>
        </>
      )}

      {/* 3. SE ABA: DISPOSITIVOS & SESSÕES (SESSIONS) */}
      {activeTab === 'sessions' && (
        <>
          <div className="dashboard-header">
            <div className="dashboard-title-group">
              <h1 className="dashboard-title">Dispositivos & Sessões Ativas</h1>
              <p className="dashboard-subtitle">
                Monitore os aparelhos conectados. Em sessões que não são a atual, use Encerrar e bloquear para impedir novos logins.
              </p>
            </div>
          </div>
          <DeviceSessionsCard />
        </>
      )}

      {/* 3b. SE ABA: DISPOSITIVOS BLOQUEADOS (BLACKLIST DO USUÁRIO) */}
      {activeTab === 'blacklist' && (
        <>
          <div className="dashboard-header">
            <div className="dashboard-title-group">
              <h1 className="dashboard-title">
                <Ban size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Dispositivos bloqueados
              </h1>
              <p className="dashboard-subtitle">
                Aparelhos que você bloqueou não entram mais na sua conta. Para bloquear um novo, use Encerrar e bloquear nas sessões ativas.
              </p>
            </div>
            {onNavigateTab && (
              <div className="dashboard-top-actions">
                <button className="btn btn-outline btn-pill" onClick={() => onNavigateTab('sessions')}>
                  Ir para sessões
                </button>
              </div>
            )}
          </div>
          <MyDeviceBlacklistCard />
        </>
      )}

      {/* 3c. SE ABA: BLACKLIST DO TENANT (ADMIN + MANAGER) */}
      {activeTab === 'admin-blacklist' && canManageTenantBlacklist && (
        <>
          <div className="dashboard-header">
            <div className="dashboard-title-group">
              <h1 className="dashboard-title">
                <ShieldAlert size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Blacklist do tenant
              </h1>
              <p className="dashboard-subtitle">
                Visível para ADMIN e MANAGER. Bloqueie ou libere aparelhos de qualquer usuário deste tenant.
              </p>
            </div>
          </div>
          <AdminDeviceBlacklistCard />
        </>
      )}

      {/* 4. SE ABA: SEGURANÇA & TOKENS (SECURITY) */}
      {activeTab === 'security' && (
        <>
          <div className="dashboard-header">
            <div className="dashboard-title-group">
              <h1 className="dashboard-title">Segurança & Credenciais JWT</h1>
              <p className="dashboard-subtitle">
                Monitore o mecanismo proativo de rotação de tokens JWT e gerencie sua senha de acesso.
              </p>
            </div>

            <div className="dashboard-top-actions">
              <button
                className="btn btn-primary btn-pill"
                onClick={() => setIsChangePasswordOpen(true)}
              >
                <Key size={16} />
                <span>Alterar Senha</span>
              </button>
            </div>
          </div>

          <div className="dashboard-grid">
            {/* Card de Sessão e Auto-Refresh */}
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

            {/* Card de Identidade & Tenant */}
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

          {/* Token Único em Memória */}
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
      )}

      {/* 5. SE ABA: IDENTIDADE & LGPD (IDENTITY) */}
      {activeTab === 'identity' && (
        <>
          <div className="dashboard-header">
            <div className="dashboard-title-group">
              <h1 className="dashboard-title">Identidade & Conformidade LGPD</h1>
              <p className="dashboard-subtitle">
                Dados cadastrais da conta e termos de consentimento legal registrados.
              </p>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="dash-card">
              <div className="dash-card-header">
                <div className="dash-card-icon"><User size={18} /></div>
                <h3>Dados do Titular da Conta</h3>
              </div>
              <div className="dash-card-body">
                <div className="info-row">
                  <span className="info-label">Nome Completo</span>
                  <span className="info-value">{user?.name || user?.username}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">E-mail Cadastrado</span>
                  <span className="info-value">{user?.email}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Código Único (UUID)</span>
                  <span className="info-value text-mono text-muted">{user?.codeUser || '—'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Tenant ID</span>
                  <span className="info-value text-mono text-muted">{user?.tenantId}</span>
                </div>
              </div>
            </div>

            <div className="dash-card">
              <div className="dash-card-header">
                <div className="dash-card-icon"><FileText size={18} /></div>
                <h3>Documentos & Consentimentos LGPD</h3>
              </div>
              <div className="dash-card-body">
                <div className="refresh-status-box">
                  <div className="refresh-status-icon">
                    <CheckCircle size={22} className="text-success" />
                  </div>
                  <div>
                    <strong>Consentimentos Válidos</strong>
                    <p>Você concordou com os Termos de Uso e Política de Privacidade durante o cadastro.</p>
                  </div>
                </div>

                <div className="info-row">
                  <span className="info-label">Termos de Uso</span>
                  <span className="badge-role" style={{ background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' }}>Aceito</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Política de Privacidade</span>
                  <span className="badge-role" style={{ background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' }}>Aceito</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal de Alteração de Senha */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
};
