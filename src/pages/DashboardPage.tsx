import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ChangePasswordModal } from '../components/auth/ChangePasswordModal';
import { DeviceSessionsCard } from '../components/dashboard/DeviceSessionsCard';
import { MyDeviceBlacklistCard } from '../components/dashboard/MyDeviceBlacklistCard';
import { AdminDeviceBlacklistCard } from '../components/dashboard/AdminDeviceBlacklistCard';
import { SecurityCredentialsView } from '../components/dashboard/SecurityCredentialsView';
import { ConnectionsView } from '../components/dashboard/ConnectionsView';
import { TemplateShowcaseView } from '../components/templates/TemplateShowcaseView';
import { canReadAudits, hasAdminOrManagerRole, hasAdminRole } from '../utils/roles';
import { AccountView } from '../components/dashboard/AccountView';
import { AuditsView } from '../components/dashboard/AuditsView';
import { GuardianView } from '../components/dashboard/GuardianView';
import {
  User,
  CheckCircle,
  Activity,
  Shield,
  Ban,
  ShieldAlert,
  Cable,
  ScrollText,
  Settings,
  Bot,
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
  } = useAuth();

  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const canManageTenantBlacklist = hasAdminOrManagerRole(user?.roles);
  const canSeeConnections = hasAdminRole(user?.roles);
  const canSeeGuardian = hasAdminRole(user?.roles);
  const canSeeAudits = canReadAudits(accessToken, user?.roles);

  useEffect(() => {
    if (activeTab === 'admin-blacklist' && !canManageTenantBlacklist && onNavigateTab) {
      onNavigateTab('blacklist');
    }
    if (activeTab === 'connections' && !canSeeConnections && onNavigateTab) {
      onNavigateTab('overview');
    }
    if (activeTab === 'guardian' && !canSeeGuardian && onNavigateTab) {
      onNavigateTab('overview');
    }
    if (activeTab === 'audits' && !canSeeAudits && onNavigateTab) {
      onNavigateTab('overview');
    }
    if (activeTab === 'identity' && onNavigateTab) {
      onNavigateTab('account');
    }
    if (activeTab === 'security' && onNavigateTab) {
      onNavigateTab('overview');
    }
  }, [activeTab, canManageTenantBlacklist, canSeeConnections, canSeeGuardian, canSeeAudits, onNavigateTab]);

  const formatRefreshTime = (date: Date | null) => {
    if (!date) return 'Login inicial';
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="dashboard-container animate-fade-in">
      {activeTab === 'templates' && <TemplateShowcaseView />}

      {activeTab === 'overview' && (
        <>
          <div className="dashboard-header">
            <div className="dashboard-title-group">
              <h1 className="dashboard-title">Visão Geral de Segurança</h1>
              <p className="dashboard-subtitle">
                Bem-vindo(a), <strong>{user?.name || user?.username}</strong>. Acompanhe a saúde da sua conta e credenciais ativas.
              </p>
            </div>
          </div>

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

      {activeTab === 'sessions' && (
        <>
          <div className="dashboard-header">
            <div className="dashboard-title-group">
              <h1 className="dashboard-title">Dispositivos & Sessões Ativas</h1>
              <p className="dashboard-subtitle">
                Monitore os aparelhos conectados. Em sessões que não são a atual, use o ícone de bloqueio para impedir novos logins.
              </p>
            </div>
          </div>
          <DeviceSessionsCard />
        </>
      )}

      {activeTab === 'blacklist' && (
        <>
          <div className="dashboard-header">
            <div className="dashboard-title-group">
              <h1 className="dashboard-title">
                <Ban size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Dispositivos bloqueados
              </h1>
              <p className="dashboard-subtitle">
                Aparelhos que você bloqueou não entram mais na sua conta. Para bloquear um novo, use o ícone de bloqueio nas sessões ativas.
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

      {activeTab === 'admin-blacklist' && canManageTenantBlacklist && (
        <>
          <div className="dashboard-header">
            <div className="dashboard-title-group">
              <h1 className="dashboard-title">
                <ShieldAlert size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Blacklist
              </h1>
              <p className="dashboard-subtitle">
                Visível para ADMIN e MANAGER. Bloqueie ou libere aparelhos de qualquer usuário deste tenant.
              </p>
            </div>
          </div>
          <AdminDeviceBlacklistCard />
        </>
      )}

      {activeTab === 'settings' && (
        <>
          <div className="dashboard-header">
            <div className="dashboard-title-group">
              <h1 className="dashboard-title">
                <Settings size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Configuração
              </h1>
              <p className="dashboard-subtitle">
                Monitore o mecanismo proativo de rotação de tokens JWT e as credenciais da sessão.
              </p>
            </div>
          </div>
          <SecurityCredentialsView />
        </>
      )}

      {activeTab === 'account' && (
        <>
          <div className="dashboard-header">
            <div className="dashboard-title-group">
              <h1 className="dashboard-title">
                <User size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Conta
              </h1>
              <p className="dashboard-subtitle">
                Identidade, preferências e segurança do seu acesso.
              </p>
            </div>
          </div>

          <AccountView onChangePassword={() => setIsChangePasswordOpen(true)} />
        </>
      )}

      {activeTab === 'connections' && canSeeConnections && (
        <>
          <div className="dashboard-header">
            <div className="dashboard-title-group">
              <h1 className="dashboard-title">
                <Cable size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Conexões
              </h1>
              <p className="dashboard-subtitle">
                Status das aplicações, workers e infraestrutura. A coleta é autenticada e o intervalo vem do servidor.
              </p>
            </div>
          </div>
          <ConnectionsView />
        </>
      )}

      {activeTab === 'guardian' && canSeeGuardian && (
        <>
          <div className="dashboard-header">
            <div className="dashboard-title-group">
              <h1 className="dashboard-title">
                <Bot size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Guardian
              </h1>
              <p className="dashboard-subtitle">
                Incidentes investigados por IA. Ações no cluster só após confirmação de ADMIN ou SYSTEM.
              </p>
            </div>
          </div>
          <GuardianView />
        </>
      )}

      {activeTab === 'audits' && canSeeAudits && (
        <>
          <div className="dashboard-header">
            <div className="dashboard-title-group">
              <h1 className="dashboard-title">
                <ScrollText size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Auditoria
              </h1>
              <p className="dashboard-subtitle">
                Trilha imutável de eventos de segurança deste tenant. Visível para ADMIN, SYSTEM ou quem tiver audit:read.
              </p>
            </div>
          </div>
          <AuditsView />
        </>
      )}

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
};
