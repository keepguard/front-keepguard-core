import React, { useEffect, useRef, useState } from 'react';
import { User as UserIcon, Settings, UserCircle, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface UserMenuProps {
  onNavigateTab?: (tab: string) => void;
  onLogout?: () => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({ onNavigateTab, onLogout }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const getInitials = (name?: string, email?: string) => {
    if (name) return name.charAt(0).toUpperCase();
    if (email) return email.charAt(0).toUpperCase();
    return 'U';
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleNavigate = (tab: string) => {
    onNavigateTab?.(tab);
    setIsOpen(false);
  };

  const handleLogout = () => {
    setIsOpen(false);
    onLogout?.();
  };

  return (
    <div className="header-user-menu" ref={menuRef}>
      <button
        type="button"
        className="header-user-avatar header-user-avatar-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={user?.email || 'Minha Conta'}
      >
        {user ? getInitials(user.name, user.email) : <UserIcon size={16} />}
      </button>

      {isOpen && (
        <div className="user-menu-dropdown" role="menu">
          {user?.email && (
            <div className="user-menu-header" title={user.email}>
              {user.email}
            </div>
          )}
          <button
            type="button"
            className="user-menu-item"
            role="menuitem"
            onClick={() => handleNavigate('settings')}
          >
            <Settings size={16} />
            <span>Configuração</span>
          </button>
          <button
            type="button"
            className="user-menu-item"
            role="menuitem"
            onClick={() => handleNavigate('account')}
          >
            <UserCircle size={16} />
            <span>Conta</span>
          </button>
          <div className="user-menu-divider" />
          <button
            type="button"
            className="user-menu-item user-menu-item-danger"
            role="menuitem"
            onClick={handleLogout}
          >
            <LogOut size={16} />
            <span>Sair</span>
          </button>
        </div>
      )}
    </div>
  );
};
