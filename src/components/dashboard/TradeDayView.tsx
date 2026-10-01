import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { PATHS } from '../../navigation/routes';
import { useTradeDay } from '../../hooks/useTradeDay';
import { RefreshCombo } from '../common/RefreshCombo';
import { TradeDayTable } from './TradeDayTable';
import { ageLabel } from './dossierFormat';
import type { TradeMarketState } from '../../services/tradeService';

const STATE_LABEL: Record<TradeMarketState, string> = {
  OPEN: 'Pregão aberto',
  CLOSED: 'Pregão fechado',
  NO_UPDATES: 'Sem atualização recente',
};

const SEARCH_DEBOUNCE_MS = 350;

type SubTab = 'geral' | 'compra' | 'venda';

function useNowSeconds(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return Math.floor(now / 1000);
}

export function TradeDayView() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [subTab, setSubTab] = useState<SubTab>('geral');

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim().toUpperCase()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  const { rows, market, asOf, total, missing, loading, refreshing, snapshotError, opportunityError, refresh } =
    useTradeDay(debouncedQuery || undefined);
  const nowSec = useNowSeconds();
  const limparFiltro = () => setQuery('');

  const compraRows = useMemo(() => rows.filter((r) => r.opportunity?.direcao === 'compra'), [rows]);
  const vendaRows = useMemo(() => rows.filter((r) => r.opportunity?.direcao === 'venda'), [rows]);

  if (loading && rows.length === 0) {
    return (
      <div className="trade-view" aria-busy="true" aria-label="Carregando Trade Day">
        <div className="hpanel-table-card desktop-table-view">
          <div className="portfolio-skeleton" />
        </div>
      </div>
    );
  }

  if (rows.length === 0 && snapshotError) {
    const blocked = snapshotError.code === 'PRODUCT_RESTRICTED' || snapshotError.code === 'PAYMENT_PENDING';
    return (
      <div className="trade-state" role="alert">
        <p>{blocked ? 'Seu plano atual não libera o Trade.' : snapshotError.message}</p>
        {blocked ? (
          <Link to={PATHS.billing} className="btn btn-primary">Ver planos</Link>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={refresh}>Tentar de novo</button>
        )}
      </div>
    );
  }

  const state = market?.state;

  return (
    <div className="trade-view trade-day-view">
      <div className="table-toolbar">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="search"
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar ticker"
            aria-label="Filtrar por ticker"
          />
          {query ? (
            <button type="button" className="trade-search-clear" onClick={limparFiltro} aria-label="Limpar filtro">
              <X size={14} />
            </button>
          ) : null}
        </div>

        {state ? <span className={`trade-chip is-${state.toLowerCase()}`}>{STATE_LABEL[state]}</span> : null}
        {asOf ? (
          <span className="trade-asof" aria-live="polite">
            Atualizado {ageLabel(Math.max(0, nowSec - Math.floor(new Date(asOf).getTime() / 1000)))}
          </span>
        ) : null}

        <div className="table-toolbar-push-end">
          <RefreshCombo onRefresh={refresh} disabled={loading} refreshing={refreshing} />
        </div>
      </div>

      {opportunityError ? (
        <p className="trade-note is-warn" role="alert">
          Não foi possível carregar as oportunidades agora ({opportunityError}); os preços e candles continuam atualizados.
        </p>
      ) : null}
      {missing > 0 ? (
        <p className="trade-note">
          {missing} {missing === 1 ? 'ativo ainda não tem' : 'ativos ainda não têm'} cotação coletada.
        </p>
      ) : null}

      <div className="llm-panel-tabs" role="tablist" aria-label="Filtro de carteira do Trade Day">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'geral'}
          className={`llm-panel-tab${subTab === 'geral' ? ' is-active' : ''}`}
          onClick={() => setSubTab('geral')}
        >
          Geral <span className="trade-day-tab-count">{total}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'compra'}
          className={`llm-panel-tab${subTab === 'compra' ? ' is-active' : ''}`}
          onClick={() => setSubTab('compra')}
        >
          Compra <span className="trade-day-tab-count is-buy">{compraRows.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'venda'}
          className={`llm-panel-tab${subTab === 'venda' ? ' is-active' : ''}`}
          onClick={() => setSubTab('venda')}
        >
          Venda <span className="trade-day-tab-count is-sell">{vendaRows.length}</span>
        </button>
      </div>

      {subTab === 'geral' ? (
        <TradeDaySummary
          label="Ativos no plano"
          total={total}
          withOpportunity={compraRows.length + vendaRows.length}
        />
      ) : subTab === 'compra' ? (
        <TradeDaySummary label="Oportunidades de compra" total={compraRows.length} confidence={averageConfidence(compraRows)} />
      ) : (
        <TradeDaySummary label="Oportunidades de venda" total={vendaRows.length} confidence={averageConfidence(vendaRows)} />
      )}

      <TradeDayTable
        rows={subTab === 'geral' ? rows : subTab === 'compra' ? compraRows : vendaRows}
        emptyMessage={
          subTab === 'geral'
            ? (debouncedQuery ? `Nenhum ativo corresponde a "${debouncedQuery}".` : 'Você ainda não tem ativos no seu plano.')
            : subTab === 'compra'
              ? 'Nenhuma oportunidade de compra ativa agora.'
              : 'Nenhuma oportunidade de venda ativa agora.'
        }
      />
    </div>
  );
}

function averageConfidence(rows: { opportunity?: { confiancaEscolha: number } }[]): number | null {
  const withConf = rows.filter((r) => r.opportunity).map((r) => r.opportunity!.confiancaEscolha);
  if (withConf.length === 0) return null;
  return withConf.reduce((acc, v) => acc + v, 0) / withConf.length;
}

function TradeDaySummary({
  label,
  total,
  withOpportunity,
  confidence,
}: {
  label: string;
  total: number;
  withOpportunity?: number;
  confidence?: number | null;
}) {
  return (
    <div className="portfolio-summary-row trade-day-summary-row">
      <div className="portfolio-summary-card">
        <span className="table-cell-muted">{label}</span>
        <strong>{total}</strong>
      </div>
      {withOpportunity != null ? (
        <div className="portfolio-summary-card">
          <span className="table-cell-muted">Com oportunidade ativa</span>
          <strong>{withOpportunity}</strong>
        </div>
      ) : null}
      {confidence != null ? (
        <div className="portfolio-summary-card">
          <span className="table-cell-muted">Confiança média da escolha</span>
          <strong>{(confidence * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</strong>
        </div>
      ) : null}
    </div>
  );
}
