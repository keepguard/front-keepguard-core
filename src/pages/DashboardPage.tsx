import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChangePasswordModal } from '../components/auth/ChangePasswordModal';
import { DeviceSessionsCard } from '../components/dashboard/DeviceSessionsCard';
import { MyDeviceBlacklistCard } from '../components/dashboard/MyDeviceBlacklistCard';
import { AdminDeviceBlacklistCard } from '../components/dashboard/AdminDeviceBlacklistCard';
import { TenantSessionsCard } from '../components/dashboard/TenantSessionsCard';
import { SecurityCredentialsView } from '../components/dashboard/SecurityCredentialsView';
import { ConnectionsView } from '../components/dashboard/ConnectionsView';
import { TemplateShowcaseView } from '../components/templates/TemplateShowcaseView';
import { assertTenantDevicesVisibility } from '../utils/roles';
import { AccountView } from '../components/dashboard/AccountView';
import { AuditsView } from '../components/dashboard/AuditsView';
import { GuardianView } from '../components/dashboard/GuardianView';
import { ClientSystemView } from '../components/dashboard/ClientSystemView';
import { AgentsView } from '../components/dashboard/AgentsView';
import { DataSourcesView } from '../components/dashboard/DataSourcesView';
import { KnowledgeView } from '../components/dashboard/KnowledgeView';
import { MarketAnalyzeView } from '../components/dashboard/MarketAnalyzeView';
import { useAuth, useTokenMeta } from '../context/AuthContext';
import { PATHS } from '../navigation/routes';
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
  KeyRound,
  Cpu,
  Database,
  Users,
  BookOpen,
  LineChart,
} from 'lucide-react';

const tenantDevicesVisibilityFailures = assertTenantDevicesVisibility();
if (tenantDevicesVisibilityFailures.length > 0 && import.meta.env.DEV) {
  console.warn('canAccessTenantDevices:', tenantDevicesVisibilityFailures);
}

function formatRefreshTime(date: Date | null) {
  if (!date) return 'Login inicial';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const DashboardShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="dashboard-container animate-fade-in">{children}</div>
);

export const OverviewPage: React.FC = () => {
  const { user } = useAuth();
  const { lastRefreshTime, refreshCount } = useTokenMeta();

  return (
    <DashboardShell>
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
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1d2129' }}>Minhas sessões</h2>
          <Link className="link-btn bold" to={PATHS.sessions}>
            Ver minhas sessões &rarr;
          </Link>
        </div>
        <DeviceSessionsCard />
      </div>
    </DashboardShell>
  );
};

export const SessionsPage: React.FC = () => (
  <DashboardShell>
    <div className="dashboard-header">
      <div className="dashboard-title-group">
        <h1 className="dashboard-title">Minhas sessões</h1>
        <p className="dashboard-subtitle">
          Aparelhos conectados à sua conta. Encerre sessões que não reconhece ou bloqueie dispositivos para impedir novos logins.
        </p>
      </div>
    </div>
    <DeviceSessionsCard />
  </DashboardShell>
);

export const UserBlacklistPage: React.FC = () => (
  <DashboardShell>
    <div className="dashboard-header">
      <div className="dashboard-title-group">
        <h1 className="dashboard-title">
          <Ban size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
          Meus dispositivos bloqueados
        </h1>
        <p className="dashboard-subtitle">
          Dispositivos que você bloqueou na sua conta. Eles não poderão fazer login novamente. Para bloquear um novo, use o ícone de bloqueio em Minhas sessões.
        </p>
      </div>
      <div className="dashboard-top-actions">
        <Link className="btn btn-outline btn-pill" to={PATHS.sessions}>
          Ir para minhas sessões
        </Link>
      </div>
    </div>
    <MyDeviceBlacklistCard />
  </DashboardShell>
);

export const AdminBlacklistPage: React.FC = () => (
  <DashboardShell>
    <div className="dashboard-header">
      <div className="dashboard-title-group">
        <h1 className="dashboard-title">
          <ShieldAlert size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
          Bloqueios da organização
        </h1>
        <p className="dashboard-subtitle">
          Dispositivos bloqueados administrativamente nesta organização — diferente dos bloqueios feitos pelo próprio usuário em Meus bloqueios.
          Visível para ADMIN, SYSTEM e MANAGER; MANAGER só age em contas ROLE_USER.
          {' '}
          <Link className="link-btn" to={PATHS.blacklist}>
            Ver meus bloqueios
          </Link>
        </p>
      </div>
    </div>
    <AdminDeviceBlacklistCard />
  </DashboardShell>
);

export const TenantSessionsPage: React.FC = () => (
  <DashboardShell>
    <div className="dashboard-header">
      <div className="dashboard-title-group">
        <h1 className="dashboard-title">
          <Users size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
          Sessões da organização
        </h1>
        <p className="dashboard-subtitle">
          Sessões de todos os usuários desta organização. ADMIN e SYSTEM veem todos; MANAGER só encerra sessões de ROLE_USER.
          {' '}
          <Link className="link-btn" to={PATHS.sessions}>
            Ver minhas sessões
          </Link>
        </p>
      </div>
    </div>
    <TenantSessionsCard />
  </DashboardShell>
);

export const SettingsPage: React.FC = () => (
  <DashboardShell>
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
  </DashboardShell>
);

export const AccountPage: React.FC = () => {
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  return (
    <DashboardShell>
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
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </DashboardShell>
  );
};

export const ConnectionsPage: React.FC = () => (
  <DashboardShell>
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
  </DashboardShell>
);

export const GuardianPage: React.FC = () => (
  <DashboardShell>
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
  </DashboardShell>
);

export const ClientSystemPage: React.FC = () => (
  <DashboardShell>
    <div className="dashboard-header">
      <div className="dashboard-title-group">
        <h1 className="dashboard-title">
          <KeyRound size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
          Client system
        </h1>
        <p className="dashboard-subtitle">
          OAuth clients de sistema do tenant autenticado. Visível para ADMIN e SYSTEM.
        </p>
      </div>
    </div>
    <ClientSystemView />
  </DashboardShell>
);

export const AgentsPage: React.FC = () => (
  <DashboardShell>
    <div className="dashboard-header">
      <div className="dashboard-title-group">
        <h1 className="dashboard-title">
          <Cpu size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
          Agents
        </h1>
        <p className="dashboard-subtitle">
          Jobs de coleta do srv-data-collector. Visível para ADMIN e SYSTEM.
        </p>
      </div>
    </div>
    <AgentsView />
  </DashboardShell>
);

export const DataSourcesPage: React.FC = () => (
  <DashboardShell>
    <div className="dashboard-header">
      <div className="dashboard-title-group">
        <h1 className="dashboard-title">
          <Database size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
          Fontes de dados
        </h1>
        <p className="dashboard-subtitle">
          Templates reutilizáveis para pré-preencher agents. Visível para ADMIN e SYSTEM.
        </p>
      </div>
    </div>
    <DataSourcesView />
  </DashboardShell>
);

export const KnowledgePage: React.FC = () => (
  <DashboardShell>
    <div className="dashboard-header">
      <div className="dashboard-title-group">
        <h1 className="dashboard-title">
          <BookOpen size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
          Conhecimento
        </h1>
        <p className="dashboard-subtitle">
          Pergunta única com briefing fundamentado nos fatos e trechos da empresa. Visível para ADMIN e SYSTEM.
        </p>
      </div>
    </div>
    <KnowledgeView />
  </DashboardShell>
);

export const MarketAnalyzePage: React.FC = () => (
  <DashboardShell>
    <div className="dashboard-header">
      <div className="dashboard-title-group">
        <h1 className="dashboard-title">
          <LineChart size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
          Analisar ativo
        </h1>
        <p className="dashboard-subtitle">
          Sinais determinísticos e narrativa fundamentada. Análise, não recomendação de investimento.
        </p>
      </div>
    </div>
    <MarketAnalyzeView />
  </DashboardShell>
);

export const AuditsPage: React.FC = () => (
  <DashboardShell>
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
  </DashboardShell>
);

export const TemplatesPage: React.FC = () => (
  <DashboardShell>
    <TemplateShowcaseView />
  </DashboardShell>
);
