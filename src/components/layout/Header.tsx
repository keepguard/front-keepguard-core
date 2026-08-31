import React from 'react';
import { Menu, X } from 'lucide-react';
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
  const { isAuthenticated } = useAuth();

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

      {isAuthenticated && (
        <div className="header-actions">
          <UserMenu onNavigateTab={onNavigateTab} onLogout={onLogout} />
        </div>
      )}
    </header>
  );
};
