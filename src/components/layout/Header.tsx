import React from 'react';
import { Shield, Sparkles, Activity } from 'lucide-react';

interface HeaderProps {
  healthStatus?: 'healthy' | 'unhealthy' | 'checking';
  onCheckHealth?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  healthStatus = 'healthy',
  onCheckHealth,
}) => {
  return (
    <header className="app-header">
      <div className="header-logo-group">
        <div className="logo-icon-box">
          <Shield className="logo-shield" size={24} />
          <Sparkles className="logo-sparkle" size={12} />
        </div>
        <div className="logo-text-group">
          <span className="logo-title">KEEP<span className="logo-accent">GUARD</span></span>
          <span className="logo-badge">ENTERPRISE SEC</span>
        </div>
      </div>

      <div className="header-actions">
        <button
          className="health-badge-btn"
          onClick={onCheckHealth}
          title="Clique para verificar saúde do BFF-Auth"
        >
          <Activity size={14} className={healthStatus === 'checking' ? 'spin' : ''} />
          <span className={`status-indicator status-${healthStatus}`} />
          <span className="status-label">
            BFF-Auth: {healthStatus === 'healthy' ? 'Online' : healthStatus === 'unhealthy' ? 'Offline' : 'Verificando...'}
          </span>
        </button>
      </div>
    </header>
  );
};
