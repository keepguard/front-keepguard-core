import React from 'react';
import { Gift, Bot, Search, User as UserIcon, Activity, Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  healthStatus?: 'healthy' | 'unhealthy' | 'checking';
  onCheckHealth?: () => void;
  isMobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  healthStatus = 'healthy',
  onCheckHealth,
  isMobileMenuOpen = false,
  onToggleMobileMenu,
}) => {
  const { user, isAuthenticated } = useAuth();

  const getInitials = (name?: string, email?: string) => {
    if (name) return name.charAt(0).toUpperCase();
    if (email) return email.charAt(0).toUpperCase();
    return 'U';
  };

  return (
    <header className="app-header">
      <div className="header-left">
        {/* Botão Menu Hambúrguer visível no celular para usuários autenticados */}
        {isAuthenticated && (
          <button
            className="mobile-menu-toggle-btn"
            onClick={onToggleMobileMenu}
            aria-label="Abrir menu de navegação"
            title="Menu"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}

        <div className="header-logo-group">
          <div className="logo-icon-box">
            <span>H</span>
          </div>
          <div className="logo-text-group">
            <span className="logo-title">KEEP<span className="logo-accent">GUARD</span></span>
          </div>
        </div>

        <a href="#promo" className="header-badge-promo hide-on-mobile" onClick={(e) => e.preventDefault()}>
          <Gift size={15} />
          <span>Indique e ganhe até $225</span>
        </a>
      </div>

      <div className="header-actions">
        <button
          className="header-btn-action hide-on-mobile"
          title="Agente IA Integrado"
        >
          <Bot size={16} className="text-primary" />
          <span>Agente</span>
        </button>

        <button
          className="header-btn-action hide-on-mobile"
          title="Pesquisar recursos"
        >
          <Search size={16} />
        </button>

        <button
          className="health-badge-btn"
          onClick={onCheckHealth}
          title="Clique para verificar integridade do BFF-Auth"
        >
          <Activity size={14} className={healthStatus === 'checking' ? 'spin' : ''} />
          <span className={`status-indicator status-${healthStatus}`} />
          <span className="status-label">
            BFF: {healthStatus === 'healthy' ? 'Online' : healthStatus === 'unhealthy' ? 'Offline' : '...'}
          </span>
        </button>

        <div className="header-user-avatar" title={user?.email || 'Minha Conta'}>
          {user ? getInitials(user.name, user.email) : <UserIcon size={16} />}
        </div>
      </div>
    </header>
  );
};
