import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Plus, Scale, Sparkles, Trophy, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import {
  compareAssets,
  listCatalogTickers,
  listKnownTickers,
  type ComparisonMatrix,
  type ComparisonMetric,
  type MarketAssetItem,
} from '../../services/analystService';
import { thesisDisplayLabel, thesisTone } from './marketLabels';

interface PeerComparisonTableProps {
  initialTickers?: string[];
  onTickersChange?: (tickers: string[]) => void;
  onSelectTicker?: (ticker: string) => void;
}

const PRESET_COMPARISONS: ReadonlyArray<{ label: string; tickers: string[] }> = [
  { label: 'Bancos: ITUB4 vs BBAS3', tickers: ['ITUB4', 'BBAS3'] },
  { label: 'Petróleo: PETR4 vs PRIO3', tickers: ['PETR4', 'PRIO3'] },
  { label: 'Elétricas: TAEE11 vs ALUP11', tickers: ['TAEE11', 'ALUP11'] },
  { label: 'Siderurgia: VALE3 vs CSNA3', tickers: ['VALE3', 'CSNA3'] },
];

const CATEGORY_NAMES: Record<string, string> = {
  VALUATION: 'Valuation & Múltiplos',
  RENTABILIDADE: 'Rentabilidade & Eficiência',
  SAUDE_FINANCEIRA: 'Saúde Financeira & Endividamento',
  CRESCIMENTO: 'Crescimento',
  DIVIDENDOS: 'Proventos & Dividendos',
};

function formatCategoryTitle(raw: string): string {
  return CATEGORY_NAMES[raw] || raw.replace(/_/g, ' ').toUpperCase();
}

function formatBRL(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const PeerComparisonTable: React.FC<PeerComparisonTableProps> = ({
  initialTickers,
  onTickersChange,
  onSelectTicker,
}) => {
  const { addToast } = useToast();
  const searchInputId = useId();
  const [selectedTickers, setSelectedTickers] = useState<string[]>(() => {
    if (initialTickers && initialTickers.length > 0) {
      return Array.from(new Set(initialTickers.map((t) => t.trim().toUpperCase()))).slice(0, 4);
    }
    return [];
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Catálogo de tickers para busca/autocompletar
  const [catalogItems, setCatalogItems] = useState<MarketAssetItem[]>([]);
  const [knownTickers, setKnownTickers] = useState<string[]>([]);

  // Estado da matriz comparativa
  const [matrix, setMatrix] = useState<ComparisonMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Carregar catálogo de sugestões
  useEffect(() => {
    let active = true;
    void Promise.all([
      listCatalogTickers().catch(() => ({ tickers: [], items: [] })),
      listKnownTickers().catch(() => ({ tickers: [] })),
    ]).then(([catalogRes, knownRes]) => {
      if (!active) return;
      if (catalogRes.items && catalogRes.items.length > 0) {
        setCatalogItems(catalogRes.items);
      }
      const combined = Array.from(
        new Set([...(catalogRes.tickers || []), ...(knownRes.tickers || [])]),
      );
      setKnownTickers(combined);
    });
    return () => {
      active = false;
    };
  }, []);

  // Sincronizar initialTickers quando a prop mudar
  useEffect(() => {
    if (initialTickers && initialTickers.length > 0) {
      const sanitized = Array.from(new Set(initialTickers.map((t) => t.trim().toUpperCase()))).slice(0, 4);
      setSelectedTickers((prev) => {
        if (prev.join(',') === sanitized.join(',')) return prev;
        return sanitized;
      });
    }
  }, [initialTickers]);

  // Notificar pai sobre alterações nos tickers
  const updateTickers = useCallback(
    (newTickers: string[]) => {
      setSelectedTickers(newTickers);
      onTickersChange?.(newTickers);
    },
    [onTickersChange],
  );

  // Buscar comparação na API quando houver entre 2 e 4 tickers
  const fetchComparison = useCallback(async (tickers: string[]) => {
    if (tickers.length < 2) {
      setMatrix(null);
      setError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await compareAssets(tickers);
      setMatrix(data);
    } catch (err: unknown) {
      setMatrix(null);
      const errStatus = (err as { status?: number }).status;
      let msg = 'Erro ao comparar os ativos. Tente novamente.';
      if (errStatus === 400) {
        msg = 'Selecione entre 2 e 4 ativos válidos.';
      } else if (errStatus === 404) {
        msg = 'Nenhum dos ativos possui dados recentes de análise.';
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setError(msg);
      addToast({ type: 'error', title: 'Comparador', description: msg });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (selectedTickers.length >= 2) {
      void fetchComparison(selectedTickers);
    } else {
      setMatrix(null);
      setError('');
    }
  }, [selectedTickers, fetchComparison]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtrar sugestões
  const filteredSuggestions = useMemo(() => {
    const query = searchTerm.trim().toUpperCase();
    if (!query) return [];

    const availableItems = catalogItems.filter(
      (item) => !selectedTickers.includes(item.ticker.toUpperCase()),
    );

    const matches = availableItems.filter(
      (item) =>
        item.ticker.toUpperCase().includes(query) ||
        (item.displayName && item.displayName.toUpperCase().includes(query)),
    );

    if (matches.length > 0) return matches.slice(0, 6);

    // Fallback para knownTickers se catalogItems for vazio
    return knownTickers
      .filter((t) => !selectedTickers.includes(t) && t.includes(query))
      .slice(0, 6)
      .map((t) => ({
        ticker: t,
        displayName: t,
        assetType: 'Ação' as const,
        sectorId: '',
        sectorLabel: '',
      }));
  }, [searchTerm, selectedTickers, catalogItems, knownTickers]);

  const handleAddTicker = (ticker: string) => {
    const upper = ticker.trim().toUpperCase();
    if (!upper || selectedTickers.includes(upper)) return;
    if (selectedTickers.length >= 4) {
      addToast({
        type: 'warning',
        title: 'Limite atingido',
        description: 'É possível comparar no máximo 4 ativos simultaneamente.',
      });
      return;
    }
    const next = [...selectedTickers, upper];
    updateTickers(next);
    setSearchTerm('');
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
    searchInputRef.current?.focus();
  };

  const handleRemoveTicker = (tickerToRemove: string) => {
    const next = selectedTickers.filter((t) => t !== tickerToRemove);
    updateTickers(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredSuggestions.length > 0) {
        setIsDropdownOpen(true);
        setHighlightedIndex((prev) => (prev + 1) % filteredSuggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredSuggestions.length > 0) {
        setIsDropdownOpen(true);
        setHighlightedIndex((prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredSuggestions.length) {
        handleAddTicker(filteredSuggestions[highlightedIndex].ticker);
      } else if (searchTerm.trim()) {
        handleAddTicker(searchTerm.trim().toUpperCase());
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    } else if (e.key === 'Backspace' && !searchTerm && selectedTickers.length > 0) {
      // Remove o último chip ao pressionar Backspace em campo vazio
      handleRemoveTicker(selectedTickers[selectedTickers.length - 1]);
    }
  };

  // Agrupar métricas por categoria preservando a ordem vinda da API
  const metricsByCategory = useMemo(() => {
    if (!matrix?.metrics) return new Map<string, ComparisonMetric[]>();
    const grouped = new Map<string, ComparisonMetric[]>();
    for (const metric of matrix.metrics) {
      const cat = metric.category || 'OUTROS';
      const existing = grouped.get(cat) || [];
      existing.push(metric);
      grouped.set(cat, existing);
    }
    return grouped;
  }, [matrix]);

  const allAssetsNoData = Boolean(
    matrix &&
      matrix.assets.length > 0 &&
      matrix.assets.every((a) => a.status === 'NO_DATA' || a.status === 'NOT_FOUND'),
  );

  return (
    <div className="market-compare-container">
      {/* SELETOR DE TICKERS E CHIPS */}
      <section className="hpanel-table-card market-compare-selector-card" aria-label="Seleção de ativos para comparação">
        <div className="market-compare-selector-header">
          <div className="market-compare-title-group">
            <h2 className="market-compare-title">
              <Scale size={20} className="market-compare-title-icon" aria-hidden="true" />
              Comparador Lado a Lado
            </h2>
            <p className="market-compare-subtitle">
              Compare múltiplos de valuation, rentabilidade e saúde financeira de 2 a 4 ativos simultâneos.
            </p>
          </div>
          <div className="market-compare-count-badge" aria-live="polite">
            {selectedTickers.length} de 4 ativos
          </div>
        </div>

        <div className="market-compare-search-area">
          <div className="market-compare-chips-input-wrap">
            {/* CHIPS SELECIONADOS */}
            {selectedTickers.map((ticker) => (
              <span key={ticker} className="market-compare-chip">
                <span className="market-compare-chip-ticker">{ticker}</span>
                <button
                  type="button"
                  className="market-compare-chip-remove"
                  onClick={() => handleRemoveTicker(ticker)}
                  aria-label={`Remover ${ticker} da comparação`}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            ))}

            {/* INPUT COM AUTOCOMPLETE */}
            {selectedTickers.length < 4 ? (
              <div className="market-compare-input-box">
                <label htmlFor={searchInputId} className="sr-only">
                  Adicionar ticker para comparar
                </label>
                <input
                  id={searchInputId}
                  ref={searchInputRef}
                  type="text"
                  className="market-compare-input"
                  placeholder={
                    selectedTickers.length === 0
                      ? 'Buscar ou digitar ticker (ex: VALE3, ITUB4)...'
                      : 'Adicionar mais um ativo...'
                  }
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setIsDropdownOpen(true);
                    setHighlightedIndex(-1);
                  }}
                  onFocus={() => {
                    if (searchTerm.trim()) setIsDropdownOpen(true);
                  }}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                  maxLength={6}
                />
              </div>
            ) : null}
          </div>

          {/* DROPDOWN DE SUGESTÕES */}
          {isDropdownOpen && filteredSuggestions.length > 0 ? (
            <div
              ref={dropdownRef}
              className="market-compare-dropdown"
              role="listbox"
              id="market-compare-suggestions"
              aria-label="Sugestões de ativos"
            >
              {filteredSuggestions.map((item, idx) => (
                <div
                  key={item.ticker}
                  role="option"
                  aria-selected={idx === highlightedIndex}
                  className={`market-compare-dropdown-item${
                    idx === highlightedIndex ? ' is-highlighted' : ''
                  }`}
                  onClick={() => handleAddTicker(item.ticker)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  <div className="market-compare-dropdown-main">
                    <span className="market-compare-dropdown-ticker">{item.ticker}</span>
                    {item.displayName && item.displayName !== item.ticker ? (
                      <span className="market-compare-dropdown-name">{item.displayName}</span>
                    ) : null}
                  </div>
                  {item.sectorLabel ? (
                    <span className="market-compare-dropdown-sector">{item.sectorLabel}</span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* SUGESTÕES RÁPIDAS (PRESETS) */}
        {selectedTickers.length < 2 ? (
          <div className="market-compare-presets-wrap">
            <span className="market-compare-presets-label">
              <Sparkles size={14} aria-hidden="true" />
              Sugestões rápidas de comparação:
            </span>
            <div className="market-compare-presets-chips">
              {PRESET_COMPARISONS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="btn btn-secondary btn-pill market-compare-preset-btn"
                  onClick={() => updateTickers(preset.tickers)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* ALERTA SETORIAL (CROSS SECTOR) */}
      {matrix?.crossSectorAlert ? (
        <div className="market-compare-cross-sector-alert" role="alert">
          <AlertTriangle size={18} className="market-compare-alert-icon" aria-hidden="true" />
          <div>
            <strong>Atenção: Comparação entre setores com dinâmicas contábeis distintas.</strong>
            <p>
              {matrix.sectorAlertMessage ||
                'Empresas financeiras (ex: bancos) e indústrias operam com modelos contábeis diferentes. Métricas como P/VP, Margens e Dívida Líquida/EBITDA não possuem comparabilidade direta.'}
            </p>
          </div>
        </div>
      ) : null}

      {/* DESTAQUES DA ANÁLISE COMPARATIVA */}
      {matrix?.summary?.highlights && matrix.summary.highlights.length > 0 ? (
        <section className="hpanel-table-card market-compare-highlights-card" aria-label="Destaques da Análise">
          <h3 className="market-compare-highlights-title">
            <Trophy size={16} className="text-amber-500" aria-hidden="true" />
            Destaques da Análise Comparativa
          </h3>
          <ul className="market-compare-highlights-list">
            {matrix.summary.highlights.map((h, i) => (
              <li key={i} className="market-compare-highlight-item">
                {h}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ESTADO DE LOADING */}
      {loading ? (
        <div className="hpanel-table-card market-compare-loading-card" aria-busy="true" aria-live="polite">
          <p className="text-muted" style={{ marginBottom: '1rem' }}>
            Calculando matriz comparativa e elegendo melhores métricas...
          </p>
          <div className="market-skeleton" style={{ height: '50px', marginBottom: '0.5rem' }} />
          <div className="market-skeleton" style={{ height: '35px', marginBottom: '0.5rem' }} />
          <div className="market-skeleton" style={{ height: '35px', marginBottom: '0.5rem' }} />
          <div className="market-skeleton" style={{ height: '35px', marginBottom: '0.5rem' }} />
          <div className="market-skeleton" style={{ height: '35px' }} />
        </div>
      ) : null}

      {/* ESTADO DE ERRO */}
      {!loading && error ? (
        <div className="agent-test-result is-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="btn btn-secondary btn-pill"
            onClick={() => void fetchComparison(selectedTickers)}
          >
            Tentar de novo
          </button>
        </div>
      ) : null}

      {/* ESTADO VAZIO (< 2 ATIVOS) */}
      {!loading && !error && selectedTickers.length < 2 ? (
        <div className="hpanel-table-card market-compare-empty-card">
          <div className="market-compare-empty-icon-box">
            <Scale size={32} className="text-muted" aria-hidden="true" />
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            Nenhum par selecionado
          </h3>
          <p className="text-muted" style={{ maxWidth: '460px', margin: '0 auto 1.25rem' }}>
            Selecione ao menos 2 ativos acima ou clique em uma das sugestões rápidas para gerar a matriz comparativa lado a lado.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary btn-pill"
              onClick={() => updateTickers(['ITUB4', 'BBAS3'])}
            >
              <Plus size={14} /> Comparar ITUB4 vs BBAS3
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-pill"
              onClick={() => updateTickers(['PETR4', 'PRIO3'])}
            >
              <Plus size={14} /> Comparar PETR4 vs PRIO3
            </button>
          </div>
        </div>
      ) : null}

      {/* ESTADO TODOS ATIVOS SEM DADOS (NO_DATA) */}
      {!loading && !error && allAssetsNoData ? (
        <div className="hpanel-table-card market-compare-empty-card" role="status">
          <div className="market-compare-empty-icon-box" style={{ background: '#fef3c7' }}>
            <AlertTriangle size={32} style={{ color: '#d97706' }} aria-hidden="true" />
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.5rem', color: '#92400e' }}>
            Nenhum dos ativos possui dados recentes
          </h3>
          <p className="text-muted" style={{ maxWidth: '480px', margin: '0 auto 1.25rem' }}>
            Os ativos selecionados ({selectedTickers.join(', ')}) não possuem relatórios de análise recentes gravados no sistema.
            Selecione outros ativos da sua watchlist ou utilize uma das comparações recomendadas abaixo:
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary btn-pill"
              onClick={() => updateTickers(['ITUB4', 'BBAS3'])}
            >
              <Plus size={14} /> Comparar ITUB4 vs BBAS3
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-pill"
              onClick={() => updateTickers(['PETR4', 'PRIO3'])}
            >
              <Plus size={14} /> Comparar PETR4 vs PRIO3
            </button>
          </div>
        </div>
      ) : null}

      {/* TABELA COMPARATIVA LADO A LADO */}
      {!loading && !error && matrix && matrix.assets.length > 0 && !allAssetsNoData ? (
        <div className="hpanel-table-card market-compare-table-card">
          <div className="market-compare-scroll-wrapper" tabIndex={0} aria-label="Tabela de comparação com rolagem horizontal">
            <table className="market-compare-table">
              <thead>
                <tr>
                  <th scope="col" className="market-compare-th-metric market-compare-sticky-col">
                    Métrica
                  </th>
                  {matrix.assets.map((asset) => (
                    <th key={asset.ticker} scope="col" className="market-compare-th-asset">
                      <div className="market-compare-asset-header">
                        <div className="market-compare-asset-ticker-row">
                          <button
                            type="button"
                            className="market-compare-asset-link-btn"
                            onClick={() => onSelectTicker?.(asset.ticker)}
                            title={`Abrir Dossiê de ${asset.ticker}`}
                          >
                            <span className="market-compare-asset-ticker">{asset.ticker}</span>
                          </button>
                          {asset.sectorLabel ? (
                            <span className="market-compare-asset-sector" title={`Setor: ${asset.sectorLabel}`}>
                              {asset.sectorLabel}
                            </span>
                          ) : null}
                        </div>
                        <div className="market-compare-asset-name" title={asset.companyName}>
                          {asset.companyName || asset.ticker}
                        </div>
                        <div className="market-compare-asset-price-row">
                          <span className="market-compare-asset-price">
                            {formatBRL(asset.currentPrice)}
                          </span>
                        </div>
                        {asset.thesisCode ? (
                          <div className="market-compare-asset-thesis-row">
                            <span
                              className={`market-ticker-thesis-chip market-thesis-${thesisTone(asset.thesisCode)}`}
                            >
                              {thesisDisplayLabel(asset.thesisCode)}
                            </span>
                          </div>
                        ) : null}
                        {asset.status === 'NO_DATA' || asset.status === 'NOT_FOUND' ? (
                          <div className="market-compare-asset-not-found">
                            Sem run recente gravado
                          </div>
                        ) : null}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {Array.from(metricsByCategory.entries()).map(([catKey, metrics]) => (
                  <React.Fragment key={catKey}>
                    {/* CABEÇALHO DA CATEGORIA */}
                    <tr className="market-compare-cat-row">
                      <td
                        colSpan={matrix.assets.length + 1}
                        className="market-compare-cat-cell market-compare-sticky-col"
                      >
                        {formatCategoryTitle(catKey)}
                      </td>
                    </tr>

                    {/* LINHAS DE MÉTRICAS */}
                    {metrics.map((metric) => {
                      const bestCount = matrix.assets.filter(
                        (a) => metric.values?.[a.ticker]?.isBest,
                      ).length;
                      const isTie = bestCount > 1;

                      return (
                        <tr key={metric.metricCode} className="market-compare-metric-row">
                          <th
                            scope="row"
                            className="market-compare-td-metric market-compare-sticky-col"
                            title={metric.description || metric.name}
                          >
                            <span className="market-compare-metric-name">{metric.name}</span>
                            {metric.unit ? (
                              <span className="market-compare-metric-unit">({metric.unit})</span>
                            ) : null}
                          </th>

                          {matrix.assets.map((asset) => {
                            const val = metric.values?.[asset.ticker];
                            if (!val || val.text === '—') {
                              return (
                                <td key={asset.ticker} className="market-compare-td-val is-empty">
                                  <span
                                    className="market-compare-val-text text-muted"
                                    title={val?.gap ? `Motivo: ${val.gap}` : 'Sem dados recentes'}
                                  >
                                    —
                                  </span>
                                </td>
                              );
                            }

                            return (
                              <td
                                key={asset.ticker}
                                className={`market-compare-td-val${val.isBest ? ' is-best' : ''}`}
                              >
                                {val.isBest ? (
                                  <div
                                    className={`market-compare-best-badge${isTie ? ' is-tie' : ''}`}
                                    title={
                                      isTie
                                        ? `Empate técnico: ${asset.ticker} com ${val.text}`
                                        : `Melhor índice: ${asset.ticker} com ${val.text}`
                                    }
                                    aria-label={`${
                                      isTie ? 'Empate técnico no melhor índice' : 'Melhor índice'
                                    } da métrica ${metric.name}: ${asset.ticker} com ${val.text}`}
                                  >
                                    <Trophy
                                      size={13}
                                      className="market-compare-trophy-icon"
                                      aria-hidden="true"
                                    />
                                    <span className="market-compare-val-text font-bold">
                                      {val.text}
                                    </span>
                                    {isTie ? (
                                      <span className="market-compare-tie-tag">Empate</span>
                                    ) : null}
                                  </div>
                                ) : (
                                  <span className="market-compare-val-text">{val.text}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
};
