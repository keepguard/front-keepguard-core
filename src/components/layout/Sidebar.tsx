import React from 'react';
import { NavLink } from 'react-router-dom';
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
import { PATHS } from '../../navigation/routes';

interface SidebarProps {
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

function navClass(isActive: boolean) {
  return `sidebar-nav-item ${isActive ? 'active' : ''}`;
}

export const Sidebar: React.FC<SidebarProps> = ({
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

  return (
    <>
      {isOpenMobile && (
        <div
          className="sidebar-mobile-overlay"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside className={`app-sidebar ${isOpenMobile ? 'mobile-open' : ''}`}>
        <div className="sidebar-mobile-header">
          <span className="sidebar-mobile-title">Menu de Navegação</span>
          <button className="sidebar-mobile-close-btn" onClick={onCloseMobile} title="Fechar Menu">
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-section" aria-label="Minha conta">
          <span className="sidebar-heading">Minha conta</span>

          <NavLink to={PATHS.overview} end className={({ isActive }) => navClass(isActive)} onClick={onCloseMobile}>
            <Home size={18} className="sidebar-icon" />
            <span>Visão Geral</span>
          </NavLink>

          <NavLink to={PATHS.sessions} className={({ isActive }) => navClass(isActive)} onClick={onCloseMobile}>
            <Smartphone size={18} className="sidebar-icon" />
            <span>Minhas sessões</span>
          </NavLink>

          <NavLink to={PATHS.blacklist} className={({ isActive }) => navClass(isActive)} onClick={onCloseMobile}>
            <Ban size={18} className="sidebar-icon" />
            <span>Meus bloqueios</span>
          </NavLink>
        </nav>

        {showAdminSection && (
          <nav className="sidebar-section" aria-label="Administração">
            <span className="sidebar-heading">Administração</span>
            {canAccessTenantDevicesTab && (
              <NavLink to={PATHS.tenantSessions} className={({ isActive }) => navClass(isActive)} onClick={onCloseMobile}>
                <Users size={18} className="sidebar-icon" />
                <span>Sessões da organização</span>
              </NavLink>
            )}
            {canAccessTenantDevicesTab && (
              <NavLink to={PATHS.adminBlacklist} className={({ isActive }) => navClass(isActive)} onClick={onCloseMobile}>
                <ShieldAlert size={18} className="sidebar-icon" />
                <span>Bloqueios da organização</span>
              </NavLink>
            )}
            {canSeeConnections && (
              <NavLink to={PATHS.connections} className={({ isActive }) => navClass(isActive)} onClick={onCloseMobile}>
                <Cable size={18} className="sidebar-icon" />
                <span>Conexões</span>
              </NavLink>
            )}
            {canSeeGuardian && (
              <NavLink to={PATHS.guardian} className={({ isActive }) => navClass(isActive)} onClick={onCloseMobile}>
                <Bot size={18} className="sidebar-icon" />
                <span>Guardian</span>
              </NavLink>
            )}
            {canSeeClientSystem && (
              <NavLink to={PATHS.clientSystem} className={({ isActive }) => navClass(isActive)} onClick={onCloseMobile}>
                <KeyRound size={18} className="sidebar-icon" />
                <span>Client system</span>
              </NavLink>
            )}
            {canSeeAgents && (
              <NavLink to={PATHS.agents} className={({ isActive }) => navClass(isActive)} onClick={onCloseMobile}>
                <Cpu size={18} className="sidebar-icon" />
                <span>Agents</span>
              </NavLink>
            )}
            {canSeeKnowledge && (
              <NavLink to={PATHS.knowledge} className={({ isActive }) => navClass(isActive)} onClick={onCloseMobile}>
                <BookOpen size={18} className="sidebar-icon" />
                <span>Conhecimento</span>
              </NavLink>
            )}
            {canSeeAudits && (
              <NavLink to={PATHS.audits} className={({ isActive }) => navClass(isActive)} onClick={onCloseMobile}>
                <ScrollText size={18} className="sidebar-icon" />
                <span>Auditoria</span>
              </NavLink>
            )}
          </nav>
        )}

        <nav className="sidebar-section" style={{ marginTop: 'auto' }} aria-label="Biblioteca de Templates">
          <span className="sidebar-heading">Biblioteca de Templates</span>

          <NavLink to={PATHS.templates} className={({ isActive }) => navClass(isActive)} onClick={onCloseMobile}>
            <Sparkles size={18} className="sidebar-icon text-primary" />
            <span>Galeria de Templates</span>
          </NavLink>
        </nav>
      </aside>
    </>
  );
};
