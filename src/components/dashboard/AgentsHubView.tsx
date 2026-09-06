import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PATHS } from '../../navigation/routes';
import { searchCollectorIncidents } from '../../services/agentService';
import { hasAdminOrManagerRole, hasAdminRole } from '../../utils/roles';
import { AgentIncidentsView } from './AgentIncidentsView';
import { AgentsView } from './AgentsView';

type Panel = 'agentes' | 'incidentes';

const ALL_TABS: ReadonlyArray<{ id: Panel; label: string; tabId: string; panelId: string; path: string }> = [
  { id: 'agentes', label: 'Agentes', tabId: 'agents-tab-agentes', panelId: 'agents-panel-agentes', path: PATHS.agents },
  {
    id: 'incidentes',
    label: 'Incidentes',
    tabId: 'agents-tab-incidentes',
    panelId: 'agents-panel-incidentes',
    path: PATHS.agentIncidents,
  },
];

function panelFromPath(pathname: string): Panel {
  return pathname === PATHS.agentIncidents || pathname.startsWith(`${PATHS.agentIncidents}/`)
    ? 'incidentes'
    : 'agentes';
}

function formatOpenCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/**
 * Hub de Agents + Incidentes no mesmo padrão de abas da página LLM.
 * Rotas `/agents` e `/agents/incidentes` compartilham este shell; a aba ativa segue o path.
 */
export const AgentsHubView: React.FC = () => {
  const { user, getAccessToken } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const canSeeAgents = hasAdminRole(user?.roles);
  const canSeeIncidents = hasAdminOrManagerRole(user?.roles);

  const tabs = useMemo(
    () => ALL_TABS.filter((tab) => (tab.id === 'agentes' ? canSeeAgents : canSeeIncidents)),
    [canSeeAgents, canSeeIncidents],
  );

  const [panel, setPanel] = useState<Panel>(() => panelFromPath(location.pathname));
  const [openIncidentCount, setOpenIncidentCount] = useState<number | null>(null);

  const refreshOpenIncidentCount = useCallback(async () => {
    if (!canSeeIncidents) {
      setOpenIncidentCount(null);
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    try {
      const result = await searchCollectorIncidents({ status: 'open', page: 0, size: 1 }, token);
      setOpenIncidentCount(Math.max(0, result.totalElements || 0));
    } catch {
      // Badge é sinal auxiliar; falha silenciosa evita toast no hub.
    }
  }, [canSeeIncidents, getAccessToken]);

  useEffect(() => {
    const fromPath = panelFromPath(location.pathname);
    const next = tabs.some((tab) => tab.id === fromPath) ? fromPath : (tabs[0]?.id ?? 'agentes');
    setPanel(next);
  }, [location.pathname, tabs]);

  useEffect(() => {
    void refreshOpenIncidentCount();
  }, [refreshOpenIncidentCount, panel]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshOpenIncidentCount();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshOpenIncidentCount]);

  const selectPanel = (id: Panel, focus = false) => {
    const tab = tabs.find((item) => item.id === id);
    if (!tab) return;
    setPanel(id);
    if (location.pathname !== tab.path) {
      navigate(tab.path);
    }
    if (!focus) return;
    const index = tabs.findIndex((item) => item.id === id);
    if (index >= 0) tabRefs.current[index]?.focus();
  };

  const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = tabs.length - 1;
    }

    if (next < 0) return;
    event.preventDefault();
    selectPanel(tabs[next].id, true);
  };

  const activeTab = tabs.find((tab) => tab.id === panel) ?? tabs[0];
  const showOpenBadge = openIncidentCount != null && openIncidentCount > 0;

  if (!activeTab) {
    return (
      <p role="status">
        Você não tem permissão para ver Agents nem Incidentes.
      </p>
    );
  }

  return (
    <div>
      {tabs.length > 1 ? (
        <div className="llm-panel-tabs" role="tablist" aria-label="Seções de Agents">
          {tabs.map((tab, index) => {
            const selected = panel === tab.id;
            const incidentsBadge = tab.id === 'incidentes' && showOpenBadge;
            const ariaLabel = incidentsBadge
              ? `Incidentes, ${openIncidentCount} aberto${openIncidentCount === 1 ? '' : 's'}`
              : undefined;
            return (
              <button
                key={tab.id}
                ref={(el) => { tabRefs.current[index] = el; }}
                id={tab.tabId}
                type="button"
                role="tab"
                aria-label={ariaLabel}
                aria-selected={selected}
                aria-controls={tab.panelId}
                tabIndex={selected ? 0 : -1}
                className={`llm-panel-tab${selected ? ' is-active' : ''}`}
                title={incidentsBadge ? `${openIncidentCount} incidente${openIncidentCount === 1 ? '' : 's'} aberto${openIncidentCount === 1 ? '' : 's'}` : undefined}
                onClick={() => selectPanel(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, index)}
              >
                {tab.label}
                {incidentsBadge ? (
                  <span className="llm-panel-tab-count" aria-hidden="true">
                    {formatOpenCount(openIncidentCount)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        id={activeTab.panelId}
        role="tabpanel"
        aria-labelledby={activeTab.tabId}
        className="llm-panel-tabpanel"
      >
        {panel === 'agentes' ? <AgentsView /> : null}
        {panel === 'incidentes' ? (
          <AgentIncidentsView
            onOpenCountChange={setOpenIncidentCount}
            onIncidentsMutated={refreshOpenIncidentCount}
          />
        ) : null}
      </div>
    </div>
  );
};
