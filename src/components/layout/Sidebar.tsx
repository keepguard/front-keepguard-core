import React from 'react';
import {
  Home,
  Shield,
  Smartphone,
  UserCheck,
  Sparkles,
  Ban,
  ShieldAlert,
  Cable,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { hasAdminOrManagerRole, hasAdminRole } from '../../utils/roles';

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
  const { user } = useAuth();
  const canManageTenantBlacklist = hasAdminOrManagerRole(user?.roles);
  const canSeeConnections = hasAdminRole(user?.roles);
  const showAdminSection = canManageTenantBlacklist || canSeeConnections;

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
          <span className="sidebar-heading">Navegação Principal</span>

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
            <span>Sessões Ativas</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'blacklist' ? 'active' : ''}`}
            onClick={() => handleItemClick('blacklist')}
          >
            <Ban size={18} className="sidebar-icon" />
            <span>Dispositivos bloqueados</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => handleItemClick('security')}
          >
            <Shield size={18} className="sidebar-icon" />
            <span>Segurança & Tokens</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'identity' ? 'active' : ''}`}
            onClick={() => handleItemClick('identity')}
          >
            <UserCheck size={18} className="sidebar-icon" />
            <span>Identidade & LGPD</span>
          </button>
        </div>

        {showAdminSection && (
          <div className="sidebar-section">
            <span className="sidebar-heading">Administração</span>
            {canManageTenantBlacklist && (
              <button
                className={`sidebar-nav-item ${activeTab === 'admin-blacklist' ? 'active' : ''}`}
                onClick={() => handleItemClick('admin-blacklist')}
              >
                <ShieldAlert size={18} className="sidebar-icon" />
                <span>Blacklist do tenant</span>
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
