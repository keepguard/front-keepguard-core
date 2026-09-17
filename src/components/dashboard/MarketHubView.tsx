import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import {
  getLatestMagicFormulaRanking,
  getLatestSectorSnapshot,
  type AnalystMagicFormulaRanking,
  type AnalystSectorSnapshot,
} from '../../services/analystService';
import { MagicFormulaPanel } from './MagicFormulaPanel';
import { MarketDeskView } from './MarketDeskView';
import { PeerComparisonTable } from './PeerComparisonTable';
import { SectorsPanel } from './SectorsPanel';

export type MarketPanel = 'desk' | 'magic' | 'compare' | 'sectors';

interface MarketHubViewProps {
  defaultTab?: MarketPanel;
}

const MARKET_TABS: ReadonlyArray<{ id: MarketPanel; label: string; tabId: string; panelId: string }> = [
  { id: 'desk', label: 'Dossiê', tabId: 'market-tab-desk', panelId: 'market-panel-desk' },
  {
    id: 'magic',
    label: 'Fórmula Mágica',
    tabId: 'market-tab-magic',
    panelId: 'market-panel-magic',
  },
  {
    id: 'compare',
    label: 'Comparador',
    tabId: 'market-tab-compare',
    panelId: 'market-panel-compare',
  },
  {
    id: 'sectors',
    label: 'Setores',
    tabId: 'market-tab-sectors',
    panelId: 'market-panel-sectors',
  },
];

const RANKING_EMPTY =
  'Ainda não há ranking da Fórmula Mágica. O lote diário roda às 21:30 em dias úteis.';

const SECTORS_EMPTY =
  'Ainda não há visão setorial consolidada para hoje. O lote diário roda às 21:30 em dias úteis.';

function mapServiceError(err: unknown, fallback: string): string {
  const status = (err as { status?: number }).status;
  if (status === 502 || status === 503 || status === 504) {
    return 'Não foi possível carregar os dados agora. Tente de novo.';
  }
  return err instanceof Error ? err.message : fallback;
}

/**
 * Hub Mercado no mesmo padrão de abas da LLM / Agents:
 * Dossiê + Fórmula Mágica + Comparador (lado a lado) + Setores.
 */
export const MarketHubView: React.FC<MarketHubViewProps> = ({ defaultTab }) => {
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromQuery = searchParams.get('tab') as MarketPanel | null;
  const initialPanel: MarketPanel =
    tabFromQuery && ['desk', 'magic', 'compare', 'sectors'].includes(tabFromQuery)
      ? tabFromQuery
      : defaultTab || 'desk';

  const [panel, setPanel] = useState<MarketPanel>(initialPanel);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Tickers para o comparador a partir da URL
  const tickersFromQuery = useMemo(() => {
    const raw = searchParams.get('tickers');
    if (!raw) return [];
    return raw.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
  }, [searchParams]);

  const [compareTickers, setCompareTickers] = useState<string[]>(tickersFromQuery);

  useEffect(() => {
    if (tabFromQuery && ['desk', 'magic', 'compare', 'sectors'].includes(tabFromQuery)) {
      setPanel(tabFromQuery);
    }
  }, [tabFromQuery]);

  useEffect(() => {
    if (tickersFromQuery.length > 0) {
      setCompareTickers(tickersFromQuery);
    }
  }, [tickersFromQuery]);

  // Estado da Fórmula Mágica
  const [ranking, setRanking] = useState<AnalystMagicFormulaRanking | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState('');
  const rankingLoaded = useRef(false);

  // Estado dos Setores
  const [sectors, setSectors] = useState<AnalystSectorSnapshot | null>(null);
  const [sectorsLoading, setSectorsLoading] = useState(false);
  const [sectorsError, setSectorsError] = useState('');
  const sectorsLoaded = useRef(false);

  const loadRanking = useCallback(async () => {
    setRankingLoading(true);
    setRankingError('');
    try {
      const magic = await getLatestMagicFormulaRanking();
      setRanking(magic);
      rankingLoaded.current = true;
      if (!magic) {
        setRankingError(RANKING_EMPTY);
      }
    } catch (err) {
      rankingLoaded.current = true;
      const message = mapServiceError(err, 'Falha ao carregar a Fórmula Mágica');
      setRankingError(message);
      addToast({ type: 'error', title: 'Fórmula Mágica', description: message });
    } finally {
      setRankingLoading(false);
    }
  }, [addToast]);

  const loadSectors = useCallback(async () => {
    setSectorsLoading(true);
    setSectorsError('');
    try {
      const data = await getLatestSectorSnapshot();
      setSectors(data);
      sectorsLoaded.current = true;
      if (!data) {
        setSectorsError(SECTORS_EMPTY);
      }
    } catch (err) {
      sectorsLoaded.current = true;
      const message = mapServiceError(err, 'Falha ao carregar a Visão por Setor');
      setSectorsError(message);
      addToast({ type: 'error', title: 'Visão por Setor', description: message });
    } finally {
      setSectorsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (panel === 'magic' && !rankingLoaded.current && !rankingLoading) {
      void loadRanking();
    } else if (panel === 'sectors' && !sectorsLoaded.current && !sectorsLoading) {
      void loadSectors();
    }
  }, [panel, rankingLoading, sectorsLoading, loadRanking, loadSectors]);

  const selectPanel = (id: MarketPanel, focus = false) => {
    setPanel(id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === 'desk') {
        next.delete('tab');
      } else {
        next.set('tab', id);
      }
      return next;
    });
    if (!focus) return;
    const index = MARKET_TABS.findIndex((tab) => tab.id === id);
    if (index >= 0) tabRefs.current[index]?.focus();
  };

  const handleCompareTickersChange = (newTickers: string[]) => {
    setCompareTickers(newTickers);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newTickers.length > 0) {
          next.set('tab', 'compare');
          next.set('tickers', newTickers.join(','));
        } else {
          next.delete('tickers');
        }
        return next;
      },
      { replace: true },
    );
  };

  const handleNavigateToCompare = (tickers: string[]) => {
    setCompareTickers(tickers);
    setPanel('compare');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'compare');
      next.set('tickers', tickers.join(','));
      return next;
    });
  };

  const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % MARKET_TABS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + MARKET_TABS.length) % MARKET_TABS.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = MARKET_TABS.length - 1;
    }

    if (next < 0) return;
    event.preventDefault();
    selectPanel(MARKET_TABS[next].id, true);
  };

  const handleSelectTickerFromSector = (ticker: string) => {
    setSearchParams({ ticker });
    selectPanel('desk');
  };

  const activeTab = MARKET_TABS.find((tab) => tab.id === panel) ?? MARKET_TABS[0];

  return (
    <div>
      <div className="llm-panel-tabs" role="tablist" aria-label="Seções de Mercado">
        {MARKET_TABS.map((tab, index) => {
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
        {panel === 'desk' ? <MarketDeskView onNavigateToCompare={handleNavigateToCompare} /> : null}

        {panel === 'magic' ? (
          <div className="market-magic-tab">
            {rankingLoading && !ranking ? (
              <p className="text-muted" role="status" aria-live="polite">
                Carregando ranking…
              </p>
            ) : null}
            {!rankingLoading && rankingError && !ranking ? (
              rankingError === RANKING_EMPTY ? (
                <p className="market-magic-pending" role="status">
                  {rankingError}
                </p>
              ) : (
                <div className="agent-test-result is-error" role="alert">
                  <p>{rankingError}</p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-pill"
                    onClick={() => {
                      rankingLoaded.current = false;
                      void loadRanking();
                    }}
                  >
                    Tentar de novo
                  </button>
                </div>
              )
            ) : null}
            {ranking ? <MagicFormulaPanel ranking={ranking} /> : null}
          </div>
        ) : null}

        {panel === 'compare' ? (
          <PeerComparisonTable
            initialTickers={compareTickers}
            onTickersChange={handleCompareTickersChange}
            onSelectTicker={handleSelectTickerFromSector}
          />
        ) : null}

        {panel === 'sectors' ? (
          <div className="market-sectors-tab">
            {sectorsLoading && !sectors ? (
              <p className="text-muted" role="status" aria-live="polite">
                Carregando visão setorial…
              </p>
            ) : null}
            {!sectorsLoading && sectorsError && !sectors ? (
              sectorsError === SECTORS_EMPTY ? (
                <p className="market-magic-pending" role="status">
                  {sectorsError}
                </p>
              ) : (
                <div className="agent-test-result is-error" role="alert">
                  <p>{sectorsError}</p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-pill"
                    onClick={() => {
                      sectorsLoaded.current = false;
                      void loadSectors();
                    }}
                  >
                    Tentar de novo
                  </button>
                </div>
              )
            ) : null}
            {sectors ? (
              <SectorsPanel snapshot={sectors} onSelectTicker={handleSelectTickerFromSector} />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};
