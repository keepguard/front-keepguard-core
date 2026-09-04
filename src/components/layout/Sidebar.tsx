import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  Smartphone,
  Ban,
  ShieldAlert,
  Cable,
  ScrollText,
  Bot,
  KeyRound,
  Cpu,
  Database,
  Users,
  X,
  BookOpen,
  LineChart,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { canReadAudits, canAccessTenantDevices, hasAdminRole } from '../../utils/roles';
import { PATHS } from '../../navigation/routes';

interface SidebarProps {
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

function navClass(isActive: boolean) {
  return `sidebar-nav-item ${isActive ? 'active' : ''}`;
}

interface SidebarLinkProps {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
  onCloseMobile?: () => void;
}

function SidebarLink({ to, label, icon, end, onCloseMobile }: SidebarLinkProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => navClass(isActive)}
      onClick={onCloseMobile}
      title={label}
    >
      {icon}
      <span className="sidebar-nav-label">{label}</span>
    </NavLink>
  );
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpenMobile = false,
  onCloseMobile,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const { user, accessToken } = useAuth();
  const canAccessTenantDevicesTab = canAccessTenantDevices(user?.roles);
  const canSeeConnections = hasAdminRole(user?.roles);
  const canSeeGuardian = hasAdminRole(user?.roles);
  const canSeeClientSystem = hasAdminRole(user?.roles);
  const canSeeAgents = hasAdminRole(user?.roles);
  const canSeeDataSources = hasAdminRole(user?.roles);
  const canSeeKnowledge = hasAdminRole(user?.roles);
  const canSeeMarket = hasAdminRole(user?.roles);
  const canSeeAudits = canReadAudits(accessToken, user?.roles);
  const showAdminSection = canAccessTenantDevicesTab || canSeeConnections || canSeeAudits || canSeeGuardian || canSeeClientSystem || canSeeAgents || canSeeDataSources || canSeeKnowledge || canSeeMarket;

  return (
    <>
      {isOpenMobile && (
        <div
          className="sidebar-mobile-overlay"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`app-sidebar ${isOpenMobile ? 'mobile-open' : ''} ${isCollapsed ? 'collapsed' : ''}`}
        aria-label="Menu principal"
      >
        <div className="sidebar-mobile-header">
          <span className="sidebar-mobile-title">Menu de Navegação</span>
          <button className="sidebar-mobile-close-btn" onClick={onCloseMobile} title="Fechar Menu">
            <X size={20} />
          </button>
        </div>

        <div className="sidebar-scroll">
          <nav className="sidebar-section" aria-label="Minha conta">
            <div className="sidebar-section-header">
              <span className="sidebar-heading">Minha conta</span>
              <button
                type="button"
                className="sidebar-collapse-btn"
                onClick={onToggleCollapse}
                aria-label={isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
                title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
              >
                {isCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
              </button>
            </div>

            <SidebarLink
              to={PATHS.overview}
              end
              label="Visão Geral"
              icon={<Home size={18} className="sidebar-icon" />}
              onCloseMobile={onCloseMobile}
            />

            <SidebarLink
              to={PATHS.sessions}
              label="Minhas sessões"
              icon={<Smartphone size={18} className="sidebar-icon" />}
              onCloseMobile={onCloseMobile}
            />

            <SidebarLink
              to={PATHS.blacklist}
              label="Meus bloqueios"
              icon={<Ban size={18} className="sidebar-icon" />}
              onCloseMobile={onCloseMobile}
            />
          </nav>

          {showAdminSection && (
            <nav className="sidebar-section" aria-label="Administração">
              <span className="sidebar-heading">Administração</span>
              {canAccessTenantDevicesTab && (
                <SidebarLink
                  to={PATHS.tenantSessions}
                  label="Sessões da organização"
                  icon={<Users size={18} className="sidebar-icon" />}
                  onCloseMobile={onCloseMobile}
                />
              )}
              {canAccessTenantDevicesTab && (
                <SidebarLink
                  to={PATHS.adminBlacklist}
                  label="Bloqueios da organização"
                  icon={<ShieldAlert size={18} className="sidebar-icon" />}
                  onCloseMobile={onCloseMobile}
                />
              )}
              {canSeeConnections && (
                <SidebarLink
                  to={PATHS.connections}
                  label="Conexões"
                  icon={<Cable size={18} className="sidebar-icon" />}
                  onCloseMobile={onCloseMobile}
                />
              )}
              {canSeeGuardian && (
                <SidebarLink
                  to={PATHS.guardian}
                  label="Guardian"
                  icon={<Bot size={18} className="sidebar-icon" />}
                  onCloseMobile={onCloseMobile}
                />
              )}
              {canSeeClientSystem && (
                <SidebarLink
                  to={PATHS.clientSystem}
                  label="Client system"
                  icon={<KeyRound size={18} className="sidebar-icon" />}
                  onCloseMobile={onCloseMobile}
                />
              )}
              {canSeeAgents && (
                <SidebarLink
                  to={PATHS.agents}
                  label="Agents"
                  icon={<Cpu size={18} className="sidebar-icon" />}
                  onCloseMobile={onCloseMobile}
                />
              )}
              {canSeeDataSources && (
                <SidebarLink
                  to={PATHS.dataSources}
                  label="Fontes de dados"
                  icon={<Database size={18} className="sidebar-icon" />}
                  onCloseMobile={onCloseMobile}
                />
              )}
              {canSeeKnowledge && (
                <SidebarLink
                  to={PATHS.knowledge}
                  label="Conhecimento"
                  icon={<BookOpen size={18} className="sidebar-icon" />}
                  onCloseMobile={onCloseMobile}
                />
              )}
              {canSeeAudits && (
                <SidebarLink
                  to={PATHS.audits}
                  label="Auditoria"
                  icon={<ScrollText size={18} className="sidebar-icon" />}
                  onCloseMobile={onCloseMobile}
                />
              )}
            </nav>
          )}
          {canSeeMarket && (
            <nav className="sidebar-section" aria-label="Mercado">
              <span className="sidebar-heading">Mercado</span>
              <SidebarLink
                to={PATHS.marketAnalyze}
                label="Analisar ativo"
                icon={<LineChart size={18} className="sidebar-icon" />}
                onCloseMobile={onCloseMobile}
              />
            </nav>
          )}
        </div>
      </aside>
    </>
  );
};
