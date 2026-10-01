import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { listCatalogTickers } from '../../services/analystService';

interface TickerComboboxProps {
  /** Chamado quando o usuário escolhe um ticker (clique ou Enter na opção ativa). */
  onSelect: (ticker: string) => void;
  placeholder?: string;
  'aria-label'?: string;
  /** Limpa o campo depois de selecionar (padrão true — uso típico é "disparar uma ação"). */
  clearOnSelect?: boolean;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Autocomplete de ticker contra o catálogo geral do Mercado (não restrito ao plano do
 * usuário) — mesmo padrão ARIA combobox já usado em TradeCandleChart/MarketDeskView,
 * mas extraído aqui porque a Carteira precisa aceitar um ticker fora do plano de Trade
 * (o usuário pode ter comprado um ativo que o InvestBot não cobre em pesquisa).
 */
export const TickerCombobox: React.FC<TickerComboboxProps> = ({
  onSelect,
  placeholder = 'Buscar ticker...',
  'aria-label': ariaLabel = 'Buscar ticker',
  clearOnSelect = true,
}) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim().toUpperCase()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listCatalogTickers({ query: debouncedQuery })
      .then((res) => {
        if (cancelled) return;
        setSuggestions((res.items?.map((i) => i.ticker) ?? res.tickers ?? []).slice(0, 8));
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const applyTicker = (ticker: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    onSelect(t);
    setOpen(false);
    setActiveIndex(0);
    if (clearOnSelect) setQuery('');
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (suggestions[activeIndex]) applyTicker(suggestions[activeIndex]);
      else if (/^[A-Z0-9]{4,8}$/.test(query.trim().toUpperCase())) applyTicker(query);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="search-input-wrapper market-ticker-search" ref={wrapRef}>
      <Search size={14} className="search-icon" />
      <input
        className="search-input"
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value.toUpperCase());
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        maxLength={8}
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="ticker-combobox-listbox"
      />
      {open && suggestions.length > 0 ? (
        <ul id="ticker-combobox-listbox" className="market-ticker-listbox" role="listbox">
          {suggestions.map((t, index) => (
            <li key={t} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`market-ticker-option${index === activeIndex ? ' is-active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyTicker(t);
                }}
              >
                <span className="market-ticker-option-symbol">{t}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && debouncedQuery && loading ? (
        <div className="market-ticker-listbox tchart-fav-empty-list">Buscando...</div>
      ) : null}
      {open && debouncedQuery && !loading && suggestions.length === 0 ? (
        <div className="market-ticker-listbox tchart-fav-empty-list">
          Nenhum ativo encontrado para "{debouncedQuery}".
        </div>
      ) : null}
    </div>
  );
};
