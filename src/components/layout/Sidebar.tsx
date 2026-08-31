import React from 'react';
import {
  Home,
  Smartphone,
  Sparkles,
  Ban,
  ShieldAlert,
  Cable,
  ScrollText,
  Bot,
  KeyRound,
  Cpu,
  Users,
  X,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { canReadAudits, canAccessTenantDevices, hasAdminRole } from '../../utils/roles';

interface SidebarProps {
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab = 'overview',
  onSelectTab,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const { user, accessToken } = useAuth();
  const canAccessTenantDevicesTab = canAccessTenantDevices(user?.roles);
  const canSeeConnections = hasAdminRole(user?.roles);
  const canSeeGuardian = hasAdminRole(user?.roles);
  const canSeeClientSystem = hasAdminRole(user?.roles);
  const canSeeAgents = hasAdminRole(user?.roles);
  const canSeeKnowledge = hasAdminRole(user?.roles);
  const canSeeAudits = canReadAudits(accessToken, user?.roles);
  const showAdminSection = canAccessTenantDevicesTab || canSeeConnections || canSeeAudits || canSeeGuardian || canSeeClientSystem || canSeeAgents || canSeeKnowledge;

  const handleItemClick = (tabKey: string) => {
    if (onSelectTab) {
      onSelectTab(tabKey);
    }
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <>
      {/* Overlay translúcido no celular ao abrir a gaveta */}
      {isOpenMobile && (
        <div
          className="sidebar-mobile-overlay"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside className={`app-sidebar ${isOpenMobile ? 'mobile-open' : ''}`}>
        {/* Cabeçalho da Sidebar apenas no celular para fechar */}
        <div className="sidebar-mobile-header">
          <span className="sidebar-mobile-title">Menu de Navegação</span>
          <button className="sidebar-mobile-close-btn" onClick={onCloseMobile} title="Fechar Menu">
            <X size={20} />
          </button>
        </div>

        {/* Menu Principal Funcional */}
        <div className="sidebar-section">
          <span className="sidebar-heading">Minha conta</span>

          <button
            className={`sidebar-nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => handleItemClick('overview')}
          >
            <Home size={18} className="sidebar-icon" />
            <span>Visão Geral</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'sessions' ? 'active' : ''}`}
            onClick={() => handleItemClick('sessions')}
          >
            <Smartphone size={18} className="sidebar-icon" />
            <span>Minhas sessões</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'blacklist' ? 'active' : ''}`}
            onClick={() => handleItemClick('blacklist')}
          >
            <Ban size={18} className="sidebar-icon" />
            <span>Meus bloqueios</span>
          </button>
        </div>

        {showAdminSection && (
          <div className="sidebar-section">
            <span className="sidebar-heading">Administração</span>
            {canAccessTenantDevicesTab && (
              <button
                className={`sidebar-nav-item ${activeTab === 'tenant-sessions' ? 'active' : ''}`}
                onClick={() => handleItemClick('tenant-sessions')}
              >
                <Users size={18} className="sidebar-icon" />
                <span>Sessões da organização</span>
              </button>
            )}
            {canAccessTenantDevicesTab && (
              <button
                className={`sidebar-nav-item ${activeTab === 'admin-blacklist' ? 'active' : ''}`}
                onClick={() => handleItemClick('admin-blacklist')}
              >
                <ShieldAlert size={18} className="sidebar-icon" />
                <span>Bloqueios da organização</span>
              </button>
            )}
            {canSeeConnections && (
              <button
                className={`sidebar-nav-item ${activeTab === 'connections' ? 'active' : ''}`}
                onClick={() => handleItemClick('connections')}
              >
                <Cable size={18} className="sidebar-icon" />
                <span>Conexões</span>
              </button>
            )}
            {canSeeGuardian && (
              <button
                className={`sidebar-nav-item ${activeTab === 'guardian' ? 'active' : ''}`}
                onClick={() => handleItemClick('guardian')}
              >
                <Bot size={18} className="sidebar-icon" />
                <span>Guardian</span>
              </button>
            )}
            {canSeeClientSystem && (
              <button
                className={`sidebar-nav-item ${activeTab === 'client-system' ? 'active' : ''}`}
                onClick={() => handleItemClick('client-system')}
              >
                <KeyRound size={18} className="sidebar-icon" />
                <span>Client system</span>
              </button>
            )}
            {canSeeAgents && (
              <button
                className={`sidebar-nav-item ${activeTab === 'agents' ? 'active' : ''}`}
                onClick={() => handleItemClick('agents')}
              >
                <Cpu size={18} className="sidebar-icon" />
                <span>Agents</span>
              </button>
            )}
            {canSeeKnowledge && (
              <button
                className={`sidebar-nav-item ${activeTab === 'knowledge' ? 'active' : ''}`}
                onClick={() => handleItemClick('knowledge')}
              >
                <BookOpen size={18} className="sidebar-icon" />
                <span>Conhecimento</span>
              </button>
            )}
            {canSeeAudits && (
              <button
                className={`sidebar-nav-item ${activeTab === 'audits' ? 'active' : ''}`}
                onClick={() => handleItemClick('audits')}
              >
                <ScrollText size={18} className="sidebar-icon" />
                <span>Auditoria</span>
              </button>
            )}
          </div>
        )}

        {/* Templates e Design System Preservados */}
        <div className="sidebar-section" style={{ marginTop: 'auto' }}>
          <span className="sidebar-heading">Biblioteca de Templates</span>

          <button
            className={`sidebar-nav-item ${activeTab === 'templates' ? 'active' : ''}`}
            onClick={() => handleItemClick('templates')}
          >
            <Sparkles size={18} className="sidebar-icon text-primary" />
            <span>Galeria de Templates</span>
          </button>
        </div>
      </aside>
    </>
  );
};
