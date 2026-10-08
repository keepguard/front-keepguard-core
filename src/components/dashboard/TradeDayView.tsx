import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { PATHS } from '../../navigation/routes';
import { useTradeDay, type TradeDayRow } from '../../hooks/useTradeDay';
import { useAgentProposals } from '../../hooks/useAgentProposals';
import { AutoRefreshButton } from '../common/AutoRefreshButton';
import { Tooltip } from '../common/Tooltip';
import { TradeDayTable } from './TradeDayTable';
import { AgentOrdersPanel } from './agent/AgentOrdersPanel';
import { ageLabel } from './dossierFormat';
import type { TradeMarketState } from '../../services/tradeService';

const STATE_LABEL: Record<TradeMarketState, string> = {
  OPEN: 'Pregão aberto',
  CLOSED: 'Pregão fechado',
  NO_UPDATES: 'Sem atualização recente',
};

const SEARCH_DEBOUNCE_MS = 350;
// Trade Day sempre atualiza sozinho — o Stop/Limite muda com o preço ao vivo durante o
// pregão, não pode depender do usuário lembrar de ligar auto-refresh (ver AutoRefreshButton).
const TRADE_DAY_AUTO_REFRESH_SECONDS = 60;
// Agent Ordens: a tabela vive no Redis do ms-mt5-operations e é barata — 15s só nessa aba
// (SPEC-002 §9). Nas outras abas os contadores do título seguem os 60s do Trade Day.
const AGENT_AUTO_REFRESH_SECONDS = 15;

// 'ajustar' (antiga "Precisa ajustar") foi substituída por 'agente', e 'carteira' saiu (repetia a
// página /carteira, que mostra as mesmas posições do MT5); valor antigo na URL cai em 'geral'.
type SubTab = 'geral' | 'compra' | 'venda' | 'agente';
const SUB_TABS: readonly SubTab[] = ['geral', 'compra', 'venda', 'agente'];

function subTabFromSearch(subtab: string | null): SubTab {
  return subtab && (SUB_TABS as readonly string[]).includes(subtab) ? (subtab as SubTab) : 'geral';
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const subTab = subTabFromSearch(searchParams.get('subtab'));
  const setSubTab = (id: SubTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('subtab', id);
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim().toUpperCase()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  const { rows, market, asOf, total, loading, refreshing, snapshotError, opportunityError, refresh } =
    useTradeDay(debouncedQuery || undefined);
  const agent = useAgentProposals();
  const agentCounts = agent.data?.contadores ?? null;
  const nowSec = useNowSeconds();
  const limparFiltro = () => setQuery('');

  // Sinal novo primeiro: é o único que o motor transforma em proposta (Agent Ordens).
  const compraRows = useMemo(() => sinaisDoLado(rows, 'compra'), [rows]);
  const vendaRows = useMemo(() => sinaisDoLado(rows, 'venda'), [rows]);
  const comprasNovas = useMemo(() => compraRows.filter((r) => sinalNovo(r)).length, [compraRows]);
  const vendasNovas = useMemo(() => vendaRows.filter((r) => sinalNovo(r)).length, [vendaRows]);
  const missingTickers = useMemo(() => rows.filter((r) => !r.item.quote).map((r) => r.ticker), [rows]);

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
        {/* Busca de ticker filtra o Trade Day no backend — não se aplica ao Agent Ordens. */}
        {subTab !== 'agente' ? (
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
        ) : null}

        {state ? <span className={`trade-chip is-${state.toLowerCase()}`}>{STATE_LABEL[state]}</span> : null}
        {asOf ? (
          <span className="trade-asof" aria-live="polite">
            Atualizado {ageLabel(Math.max(0, nowSec - Math.floor(new Date(asOf).getTime() / 1000)))}
          </span>
        ) : null}

        <div className="table-toolbar-push-end">
          {subTab === 'agente' ? (
            <AutoRefreshButton
              key="agente"
              onRefresh={agent.refresh}
              intervalSeconds={AGENT_AUTO_REFRESH_SECONDS}
              disabled={agent.loading}
              refreshing={agent.refreshing}
            />
          ) : (
            <AutoRefreshButton
              key="trade"
              onRefresh={() => {
                refresh();
                agent.refresh();
              }}
              intervalSeconds={TRADE_DAY_AUTO_REFRESH_SECONDS}
              disabled={loading}
              refreshing={refreshing}
            />
          )}
        </div>
      </div>

      {opportunityError && subTab !== 'agente' ? (
        <p className="trade-note is-warn" role="alert">
          Não foi possível carregar as oportunidades agora ({opportunityError}); os preços e candles continuam atualizados.
        </p>
      ) : null}
      {missingTickers.length > 0 && subTab !== 'agente' ? (
        <p className="trade-note">
          <Tooltip label={missingTickers.join(', ')} description="Ainda sem cotação coletada">
            <button type="button" className="trade-note-trigger">
              {missingTickers.length} {missingTickers.length === 1 ? 'ativo ainda não tem' : 'ativos ainda não têm'} cotação coletada.
            </button>
          </Tooltip>
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
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'agente'}
          className={`llm-panel-tab${subTab === 'agente' ? ' is-active' : ''}`}
          onClick={() => setSubTab('agente')}
        >
          Agent Ordens
          {agentCounts ? (
            <>
              <span className="trade-day-tab-count is-buy" title="Compra">
                {agentCounts.COMPRA ?? 0}<span className="sr-only"> de compra</span>
              </span>
              <span className="trade-day-tab-count is-sell" title="Venda">
                {agentCounts.VENDA ?? 0}<span className="sr-only"> de venda</span>
              </span>
              <span className="trade-day-tab-count is-stop" title="Stop">
                {agentCounts.STOP ?? 0}<span className="sr-only"> de stop</span>
              </span>
              {(agentCounts.EMERGENCIA ?? 0) > 0 ? (
                <span className="trade-day-tab-count is-emergency" title="Emergência">
                  {agentCounts.EMERGENCIA}<span className="sr-only"> de emergência</span>
                </span>
              ) : null}
            </>
          ) : null}
        </button>
      </div>

      {subTab === 'geral' ? (
        <TradeDaySummary
          label="Ativos no plano"
          total={total}
          withOpportunity={compraRows.length + vendaRows.length}
        />
      ) : subTab === 'compra' ? (
        <>
          <TradeDaySummary label="Oportunidades de compra" total={compraRows.length} today={comprasNovas} />
          <p className="trade-note">
            Só o sinal novo (disparado no último pregão fechado) vira proposta no Agent Ordens. Os demais são operações do setup que começaram em pregões
            anteriores — entrar agora não é o mesmo trade.
          </p>
        </>
      ) : subTab === 'venda' ? (
        <>
          <TradeDaySummary label="Oportunidades de venda" total={vendaRows.length} today={vendasNovas} />
          <p className="trade-note">
            Venda aqui é venda a descoberto (aposta na queda). O Agent Ordens só opera compra: estes sinais não viram
            proposta. Saída de posição comprada aparece no Agent Ordens como Venda.
          </p>
        </>
      ) : null}
      {subTab === 'agente' ? (
        <AgentOrdersPanel state={agent} />
      ) : (
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
      )}
    </div>
  );
}

function sinalNovo(r: TradeDayRow): boolean {
  return (r.opportunity?.diasAberta ?? 0) === 0;
}

function sinaisDoLado(rows: TradeDayRow[], direcao: 'compra' | 'venda'): TradeDayRow[] {
  return rows
    .filter((r) => r.opportunity?.direcao === direcao)
    .sort((a, b) => (a.opportunity?.diasAberta ?? 0) - (b.opportunity?.diasAberta ?? 0));
}

function TradeDaySummary({
  label,
  total,
  withOpportunity,
  today,
}: {
  label: string;
  total: number;
  withOpportunity?: number;
  today?: number;
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
      {today != null ? (
        <div className="portfolio-summary-card">
          <span className="table-cell-muted">Sinal novo (último pregão)</span>
          <strong>{today}</strong>
        </div>
      ) : null}
    </div>
  );
}
