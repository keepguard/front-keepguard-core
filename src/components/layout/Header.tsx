import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserMenu } from './UserMenu';
import { PATHS } from '../../navigation/routes';

interface HeaderProps {
  isMobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
  onLogout?: () => void;
  homeLink?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  isMobileMenuOpen = false,
  onToggleMobileMenu,
  onLogout,
  homeLink = false,
}) => {
  const { isAuthenticated } = useAuth();

  const logo = (
    <>
      <div className="logo-icon-box">
        <span>H</span>
      </div>
      <div className="logo-text-group">
        <span className="logo-title">KEEP<span className="logo-accent">GUARD</span></span>
      </div>
    </>
  );

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

        {homeLink ? (
          <Link to={PATHS.market} className="header-logo-group" aria-label="Ir para Mercado">
            {logo}
          </Link>
        ) : (
          <div className="header-logo-group">{logo}</div>
        )}
      </div>

      {isAuthenticated && (
        <div className="header-actions">
          <UserMenu onLogout={onLogout} />
        </div>
      )}
    </header>
  );
};
