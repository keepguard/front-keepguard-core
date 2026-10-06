import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Wallet, X } from 'lucide-react';
import { PATHS } from '../../navigation/routes';
import { useTradeDay, type TradeDayRow } from '../../hooks/useTradeDay';
import { usePortfolioPositions } from '../../hooks/usePortfolioPositions';
import { useAgentProposals } from '../../hooks/useAgentProposals';
import { AutoRefreshButton } from '../common/AutoRefreshButton';
import { Tooltip } from '../common/Tooltip';
import { TradeDayTable } from './TradeDayTable';
import { AgentOrdersPanel } from './agent/AgentOrdersPanel';
import { ageLabel, formatMoney } from './dossierFormat';
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

// 'ajustar' (antiga "Precisa ajustar") foi substituída por 'agente'; o valor antigo na URL cai em 'geral'.
type SubTab = 'geral' | 'compra' | 'venda' | 'carteira' | 'agente';
const SUB_TABS: readonly SubTab[] = ['geral', 'compra', 'venda', 'carteira', 'agente'];

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
  // Filtro da aba Carteira é local (client-side): a carteira pode ter ticker fora do
  // universo do plano de Trade, então não reusa o `query` que filtra no backend.
  const [carteiraQuery, setCarteiraQuery] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim().toUpperCase()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  const { rows, market, asOf, total, loading, refreshing, snapshotError, opportunityError, refresh } =
    useTradeDay(debouncedQuery || undefined);
  const { data: positions, loading: portfolioLoading, refresh: refreshPortfolio } = usePortfolioPositions();
  const agent = useAgentProposals();
  const agentCounts = agent.data?.contadores ?? null;
  const nowSec = useNowSeconds();
  const limparFiltro = () => setQuery('');

  const compraRows = useMemo(() => rows.filter((r) => r.opportunity?.direcao === 'compra'), [rows]);
  const vendaRows = useMemo(() => rows.filter((r) => r.opportunity?.direcao === 'venda'), [rows]);
  const missingTickers = useMemo(() => rows.filter((r) => !r.item.quote).map((r) => r.ticker), [rows]);

  // Cruza a carteira real do usuário com o Trade Day: pra cada posição, acha a linha
  // correspondente (se o ticker também está no universo do plano) pra saber se tem
  // oportunidade de compra/venda ativa AGORA sobre um ativo que o usuário já possui.
  const rowByTicker = useMemo(() => new Map(rows.map((r) => [r.ticker, r])), [rows]);
  const carteiraRows = useMemo(
    () => (positions ?? []).map((pos) => ({ position: pos, tradeRow: rowByTicker.get(pos.ticker) })),
    [positions, rowByTicker],
  );
  const carteiraFiltered = useMemo(() => {
    const term = carteiraQuery.trim().toUpperCase();
    if (!term) return carteiraRows;
    return carteiraRows.filter((r) => r.position.ticker.includes(term));
  }, [carteiraRows, carteiraQuery]);
  const carteiraComCompra = useMemo(() => carteiraRows.filter((r) => r.tradeRow?.opportunity?.direcao === 'compra').length, [carteiraRows]);
  const carteiraComVenda = useMemo(() => carteiraRows.filter((r) => r.tradeRow?.opportunity?.direcao === 'venda').length, [carteiraRows]);

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
                refreshPortfolio();
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
          aria-selected={subTab === 'carteira'}
          className={`llm-panel-tab${subTab === 'carteira' ? ' is-active' : ''}`}
          onClick={() => setSubTab('carteira')}
        >
          Carteira <span className="trade-day-tab-count">{carteiraRows.length}</span>
          {carteiraComCompra > 0 ? <span className="trade-day-tab-count is-buy">{carteiraComCompra}</span> : null}
          {carteiraComVenda > 0 ? <span className="trade-day-tab-count is-sell">{carteiraComVenda}</span> : null}
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
        <TradeDaySummary label="Oportunidades de compra" total={compraRows.length} confidence={averageConfidence(compraRows)} />
      ) : subTab === 'venda' ? (
        <TradeDaySummary label="Oportunidades de venda" total={vendaRows.length} confidence={averageConfidence(vendaRows)} />
      ) : subTab === 'carteira' ? (
        <div className="portfolio-summary-row trade-day-summary-row">
          <div className="portfolio-summary-card">
            <span className="table-cell-muted">Ativos na carteira</span>
            <strong>{carteiraRows.length}</strong>
          </div>
          <div className="portfolio-summary-card">
            <span className="table-cell-muted">Com sinal de compra agora</span>
            <strong className="portfolio-pl-positive">{carteiraComCompra}</strong>
          </div>
          <div className="portfolio-summary-card">
            <span className="table-cell-muted">Com sinal de venda agora</span>
            <strong className="portfolio-pl-negative">{carteiraComVenda}</strong>
          </div>
        </div>
      ) : null}

      {subTab === 'carteira' ? (
        <div className="search-input-wrapper trade-day-carteira-search">
          <Search size={16} className="search-icon" />
          <input
            type="search"
            className="search-input"
            value={carteiraQuery}
            onChange={(e) => setCarteiraQuery(e.target.value)}
            placeholder="Filtrar ticker da carteira"
            aria-label="Filtrar por ticker na carteira"
          />
          {carteiraQuery ? (
            <button type="button" className="trade-search-clear" onClick={() => setCarteiraQuery('')} aria-label="Limpar filtro">
              <X size={14} />
            </button>
          ) : null}
        </div>
      ) : null}

      {subTab === 'carteira' ? (
        portfolioLoading && carteiraRows.length === 0 ? (
          <div className="hpanel-table-card desktop-table-view"><div className="portfolio-skeleton" /></div>
        ) : carteiraRows.length === 0 ? (
          <div className="trade-state">
            <p>Você ainda não registrou nenhuma compra ou venda na Carteira.</p>
            <Link to={PATHS.carteira} className="btn btn-primary">Ir para a Carteira</Link>
          </div>
        ) : (
          <TradeDayCarteiraTable
            rows={carteiraFiltered}
            emptyMessage={`Nenhum ativo da carteira corresponde a "${carteiraQuery}".`}
          />
        )
      ) : subTab === 'agente' ? (
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

interface CarteiraRow {
  position: { ticker: string; quantity: number; averagePrice: number; totalCost: number; realizedPl: number };
  tradeRow?: TradeDayRow;
}

/**
 * Tabela da aba Carteira: cruza a posição real (quantidade/preço médio) com o sinal do
 * Trade Day do mesmo ticker — é o que responde "tenho que comprar mais" (sinal de compra
 * num ticker que já tenho) ou "tenho que vender algo que tenho" (sinal de venda).
 */
function TradeDayCarteiraTable({ rows, emptyMessage }: { rows: CarteiraRow[]; emptyMessage: string }) {
  if (rows.length === 0) {
    return <div className="trade-state"><p>{emptyMessage}</p></div>;
  }

  return (
    <>
      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Quantidade</th>
              <th>Preço médio</th>
              <th>Último preço</th>
              <th>Sinal agora</th>
              <th>
                Stop (Disparo / Limite){' '}
                <Tooltip label="O que é Disparo/Limite" description="São os dois preços que a ordem Stop/Loss da corretora pede. Disparo = nível calculado pelo Turtle Soup (atualiza todo dia). Limite = um pouco além do disparo, pra aumentar a chance de execução.">
                  <button type="button" className="trade-day-stop-info" aria-label="O que são Disparo e Limite? São os dois preços que a ordem Stop/Loss da corretora pede. Disparo é o nível calculado pelo Turtle Soup, atualizado todo dia. Limite é um pouco além do disparo, pra aumentar a chance de execução.">
                    ?
                  </button>
                </Tooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ position, tradeRow }) => {
              const opportunity = tradeRow?.opportunity;
              const lastPrice = tradeRow?.item.quote?.last;
              return (
                <tr key={position.ticker}>
                  <td>
                    <div className="table-cell-title">
                      <Link to={`${PATHS.market}?ticker=${encodeURIComponent(position.ticker)}`}>{position.ticker}</Link>
                    </div>
                  </td>
                  <td>{position.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</td>
                  <td>{formatMoney(position.averagePrice)}</td>
                  <td>{lastPrice != null ? formatMoney(lastPrice) : '—'}</td>
                  <td>
                    {opportunity ? (
                      <span className={`portfolio-tx-badge is-${opportunity.direcao === 'compra' ? 'buy' : 'sell'}`}>
                        {opportunity.direcao === 'compra' ? 'Comprar mais' : 'Considerar vender'}
                      </span>
                    ) : (
                      <span className="table-cell-muted">Sem sinal agora</span>
                    )}
                  </td>
                  <td>
                    <StopCell opportunity={opportunity} lastPrice={lastPrice} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {rows.map(({ position, tradeRow }) => {
          const opportunity = tradeRow?.opportunity;
          const lastPrice = tradeRow?.item.quote?.last;
          return (
            <div key={position.ticker} className="mobile-domain-card">
              <div className="mobile-card-top">
                <div className="mobile-card-identity">
                  <Wallet size={15} />
                  <span className="mobile-domain-name">{position.ticker}</span>
                </div>
              </div>
              <div className="mobile-card-subinfo">
                {position.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} un. · PM {formatMoney(position.averagePrice)}
              </div>
              <div className="mobile-card-meta">
                {opportunity ? (
                  <span className={`portfolio-tx-badge is-${opportunity.direcao === 'compra' ? 'buy' : 'sell'}`}>
                    {opportunity.direcao === 'compra' ? 'Comprar mais' : 'Considerar vender'}
                  </span>
                ) : (
                  <span className="table-cell-muted">Sem sinal agora</span>
                )}
                <StopCell opportunity={opportunity} lastPrice={lastPrice} compact />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/**
 * Mostra o Stop do setup ativo pra esse ticker, com alerta quando o preço ao vivo já passou
 * do nível na direção errada (ex.: compra com preço abaixo do stop) — sinal de que a proteção
 * cadastrada na corretora já deveria ter sido acionada hoje, mesmo que o app (cálculo diário)
 * ainda não tenha atualizado o número. Achado em operação real: ver PROGRESS.md 2026-10-02.
 */
/**
 * Mostra Disparo + Limite no mesmo formato da ordem Stop/Loss da corretora — não só o
 * número de Stop isolado. A proteção de uma posição de COMPRA é uma ordem de VENDA
 * (dispara abaixo do preço, executa um pouco mais abaixo ainda); a proteção de uma posição
 * de VENDA é uma ordem de COMPRA (espelho). Ver setup.PrecoLimiteProtecao no backend.
 */
function StopCell({
  opportunity,
  lastPrice,
  compact,
}: {
  opportunity?: { direcao: string; stop: number; stopLimite: number };
  lastPrice?: number;
  compact?: boolean;
}) {
  if (!opportunity) {
    return compact ? null : <span className="table-cell-muted">—</span>;
  }
  const ladoProtecao = opportunity.direcao === 'compra' ? 'Venda' : 'Compra';
  const stopJaPassado =
    lastPrice != null &&
    (opportunity.direcao === 'compra' ? lastPrice < opportunity.stop : lastPrice > opportunity.stop);

  const disparo = formatMoney(opportunity.stop);
  const limite = formatMoney(opportunity.stopLimite);
  const linhas = (
    <>
      <span className="trade-day-stop-linha">Disparo {disparo}</span>
      <span className="trade-day-stop-linha table-cell-muted">Limite {limite}</span>
    </>
  );

  if (!stopJaPassado) {
    return (
      <div className={`trade-day-stop-values${compact ? ' is-compact' : ''}`}>
        {compact ? <span className="table-cell-muted trade-day-stop-side">{ladoProtecao} ·</span> : null}
        {linhas}
      </div>
    );
  }
  return (
    <Tooltip
      label="Stop já ultrapassado"
      description="O preço atual já passou do disparo calculado — se você já comprou/vendeu este ativo, considere agir agora em vez de programar a ordem, pois o número só atualiza amanhã."
    >
      <button
        type="button"
        className="trade-day-stop-alert"
        aria-label={`${ladoProtecao}: disparo ${disparo}, limite ${limite}, já ultrapassado pelo preço atual — considere agir agora`}
      >
        <span className="trade-day-stop-values">{linhas}</span> ⚠
      </button>
    </Tooltip>
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
