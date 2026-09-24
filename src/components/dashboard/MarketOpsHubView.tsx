import React, { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MarketCatalogPanel } from './MarketCatalogPanel';
import { MarketJobsPanel } from './MarketJobsPanel';
import { MarketRunsPanel } from './MarketRunsPanel';

export type MarketOpsPanel = 'catalog' | 'jobs' | 'runs';

const OPS_TABS: ReadonlyArray<{ id: MarketOpsPanel; label: string; tabId: string; panelId: string }> = [
  { id: 'catalog', label: 'Catálogo', tabId: 'market-ops-tab-catalog', panelId: 'market-ops-panel-catalog' },
  { id: 'jobs', label: 'Jobs', tabId: 'market-ops-tab-jobs', panelId: 'market-ops-panel-jobs' },
  { id: 'runs', label: 'Análises', tabId: 'market-ops-tab-runs', panelId: 'market-ops-panel-runs' },
];

function panelFromSearch(tab: string | null): MarketOpsPanel {
  return tab && OPS_TABS.some((item) => item.id === tab) ? (tab as MarketOpsPanel) : 'catalog';
}

export const MarketOpsHubView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const panel = panelFromSearch(searchParams.get('tab'));
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectPanel = (id: MarketOpsPanel, focus = false) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', id);
      return next;
    }, { replace: true });
    if (!focus) return;
    const index = OPS_TABS.findIndex((tab) => tab.id === id);
    if (index >= 0) tabRefs.current[index]?.focus();
  };

  const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % OPS_TABS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + OPS_TABS.length) % OPS_TABS.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = OPS_TABS.length - 1;
    }
    if (next < 0) return;
    event.preventDefault();
    selectPanel(OPS_TABS[next].id, true);
  };

  const activeTab = OPS_TABS.find((tab) => tab.id === panel) ?? OPS_TABS[0];

  return (
    <div>
      <div className="llm-panel-tabs" role="tablist" aria-label="Operação do analista">
        {OPS_TABS.map((tab, index) => {
          const selected = panel === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[index] = el; }}
              id={tab.tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={tab.panelId}
              tabIndex={selected ? 0 : -1}
              className={`llm-panel-tab${selected ? ' is-active' : ''}`}
              onClick={() => selectPanel(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id={activeTab.panelId}
        role="tabpanel"
        aria-labelledby={activeTab.tabId}
        className="llm-panel-tabpanel"
      >
        {panel === 'catalog' ? <MarketCatalogPanel /> : null}
        {panel === 'jobs' ? <MarketJobsPanel /> : null}
        {panel === 'runs' ? <MarketRunsPanel /> : null}
      </div>
    </div>
  );
};
