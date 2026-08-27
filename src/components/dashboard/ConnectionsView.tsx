import React, { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, Shield, Server } from 'lucide-react';
import { authService } from '../../services/authService';

type HealthStatus = 'healthy' | 'unhealthy' | 'checking';

interface ConnectionApp {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  check: () => Promise<unknown>;
}

const CONNECTION_APPS: ConnectionApp[] = [
  {
    id: 'bff-auth',
    name: 'BFF-Auth',
    description: 'Autenticação, sessões e tokens de acesso.',
    icon: <Shield size={18} />,
    check: () => authService.getHealth(),
  },
  {
    id: 'bff-core',
    name: 'BFF-Core',
    description: 'Cadastro, consentimentos e serviços de núcleo.',
    icon: <Server size={18} />,
    check: () => authService.getCoreHealth(),
  },
];

const statusLabel = (status: HealthStatus) => {
  if (status === 'healthy') return 'Online';
  if (status === 'unhealthy') return 'Offline';
  return 'Verificando...';
};

export const ConnectionsView: React.FC = () => {
  const [statuses, setStatuses] = useState<Record<string, HealthStatus>>({
    'bff-auth': 'checking',
    'bff-core': 'checking',
  });

  const checkApp = useCallback(async (app: ConnectionApp) => {
    setStatuses((prev) => ({ ...prev, [app.id]: 'checking' }));
    try {
      await app.check();
      setStatuses((prev) => ({ ...prev, [app.id]: 'healthy' }));
    } catch {
      setStatuses((prev) => ({ ...prev, [app.id]: 'unhealthy' }));
    }
  }, []);

  const checkAll = useCallback(async () => {
    await Promise.all(CONNECTION_APPS.map((app) => checkApp(app)));
  }, [checkApp]);

  useEffect(() => {
    checkAll();
  }, [checkAll]);

  return (
    <div className="connections-grid">
      {CONNECTION_APPS.map((app) => {
        const status = statuses[app.id] || 'checking';
        return (
          <div key={app.id} className="dash-card">
            <div className="dash-card-header">
              <div className="dash-card-icon">{app.icon}</div>
              <h3>{app.name}</h3>
            </div>
            <div className="dash-card-body">
              <p className="connections-app-description">{app.description}</p>
              <div className="connections-status-row">
                <span className={`status-indicator status-${status}`} />
                <span className={`connections-status-label status-text-${status}`}>
                  {statusLabel(status)}
                </span>
              </div>
              <button
                className="btn btn-secondary btn-block"
                onClick={() => checkApp(app)}
                disabled={status === 'checking'}
              >
                <RefreshCw size={15} className={status === 'checking' ? 'spin' : ''} />
                {status === 'checking' ? 'Verificando...' : 'Verificar conexão'}
              </button>
            </div>
          </div>
        );
      })}

      <div className="dash-card full-width">
        <div className="dash-card-header">
          <div className="dash-card-icon"><Activity size={18} /></div>
          <h3>Todas as aplicações</h3>
        </div>
        <div className="dash-card-body">
          <p className="connections-app-description">
            Recarregue o status de todos os serviços usados pelo painel de uma só vez.
          </p>
          <button className="btn btn-outline btn-pill" onClick={checkAll}>
            <RefreshCw size={15} />
            <span>Verificar todas</span>
          </button>
        </div>
      </div>
    </div>
  );
};
