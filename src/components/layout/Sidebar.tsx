import React from 'react';
import {
  Home,
  Globe,
  Mail,
  Server,
  Shield,
  Key,
  Smartphone,
  Layers,
  Sparkles,
  Bot,
  Activity,
  Cpu,
  X,
} from 'lucide-react';

interface SidebarProps {
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab = 'domains',
  onSelectTab,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const handleItemClick = (tabKey: string) => {
    if (onSelectTab) {
      onSelectTab(tabKey);
    }
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <>
      {/* Overlay translúcido no celular ao abrir a gaveta */}
      {isOpenMobile && (
        <div
          className="sidebar-mobile-overlay"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside className={`app-sidebar ${isOpenMobile ? 'mobile-open' : ''}`}>
        {/* Cabeçalho da Sidebar apenas no celular para fechar */}
        <div className="sidebar-mobile-header">
          <span className="sidebar-mobile-title">Menu de Navegação</span>
          <button className="sidebar-mobile-close-btn" onClick={onCloseMobile} title="Fechar Menu">
            <X size={20} />
          </button>
        </div>

        {/* Menu Principal */}
        <div className="sidebar-section">
          <button
            className={`sidebar-nav-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => handleItemClick('home')}
          >
            <Home size={18} className="sidebar-icon" />
            <span>Página Inicial</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'sites' ? 'active' : ''}`}
            onClick={() => handleItemClick('sites')}
          >
            <Layers size={18} className="sidebar-icon" />
            <span>Sites & Aplicações</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'domains' ? 'active' : ''}`}
            onClick={() => handleItemClick('domains')}
          >
            <Globe size={18} className="sidebar-icon" />
            <span>Domínios & Tenants</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'sessions' ? 'active' : ''}`}
            onClick={() => handleItemClick('sessions')}
          >
            <Smartphone size={18} className="sidebar-icon" />
            <span>Sessões Ativas</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => handleItemClick('security')}
          >
            <Shield size={18} className="sidebar-icon" />
            <span>Segurança & Tokens</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'emails' ? 'active' : ''}`}
            onClick={() => handleItemClick('emails')}
          >
            <Mail size={18} className="sidebar-icon" />
            <span>E-mails & 2FA</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'services' ? 'active' : ''}`}
            onClick={() => handleItemClick('services')}
          >
            <Server size={18} className="sidebar-icon" />
            <span>Mais serviços</span>
          </button>
        </div>

        {/* Aplicativos KeepGuard */}
        <div className="sidebar-section">
          <span className="sidebar-heading">Aplicativos do KeepGuard</span>

          <button
            className={`sidebar-nav-item ${activeTab === 'ai-creator' ? 'active' : ''}`}
            onClick={() => handleItemClick('ai-creator')}
          >
            <Sparkles size={18} className="sidebar-icon" />
            <span>Criador com IA</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'keys' ? 'active' : ''}`}
            onClick={() => handleItemClick('keys')}
          >
            <Key size={18} className="sidebar-icon" />
            <span>Chaves & Certificados</span>
          </button>
        </div>

        {/* Agentes de IA & Monitoramento */}
        <div className="sidebar-section">
          <span className="sidebar-heading">Agentes de Segurança & IA</span>

          <button
            className={`sidebar-nav-item ${activeTab === 'agent' ? 'active' : ''}`}
            onClick={() => handleItemClick('agent')}
          >
            <Bot size={18} className="sidebar-icon" />
            <span>Agente Guardião</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'telemetry' ? 'active' : ''}`}
            onClick={() => handleItemClick('telemetry')}
          >
            <Activity size={18} className="sidebar-icon" />
            <span>Telemetria & BFF</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'nodes' ? 'active' : ''}`}
            onClick={() => handleItemClick('nodes')}
          >
            <Cpu size={18} className="sidebar-icon" />
            <span>Cluster VPS Nodes</span>
          </button>
        </div>
      </aside>
    </>
  );
};
