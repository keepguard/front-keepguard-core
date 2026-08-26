import React from 'react';
import { User as UserIcon, Activity, Menu, X, ShieldCheck } from 'lucide-react';
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

        {/* Badge de Segurança & Tenant Real */}
        {isAuthenticated && user?.tenantId && (
          <div className="header-badge-promo hide-on-mobile" style={{ background: '#ede8ff', borderColor: '#dcd2f9', color: '#673de6' }}>
            <ShieldCheck size={15} />
            <span>Tenant: {user.tenantId.substring(0, 8)}...</span>
          </div>
        )}
      </div>

      <div className="header-actions">
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
