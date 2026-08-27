import React from 'react';
import { User as UserIcon, Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserMenu } from './UserMenu';

interface HeaderProps {
  isMobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
  onNavigateTab?: (tab: string) => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isMobileMenuOpen = false,
  onToggleMobileMenu,
  onNavigateTab,
  onLogout,
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
      </div>

      <div className="header-actions">
        {isAuthenticated ? (
          <UserMenu onNavigateTab={onNavigateTab} onLogout={onLogout} />
        ) : (
          <div className="header-user-avatar" title={user?.email || 'Minha Conta'}>
            {user ? getInitials(user.name, user.email) : <UserIcon size={16} />}
          </div>
        )}
      </div>
    </header>
  );
};
