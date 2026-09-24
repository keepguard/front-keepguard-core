import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import { RunDetailModal } from './RunDetailModal';
import { RUN_TRIGGER_LABEL, RUN_OUTCOME_LABEL } from './marketLabels';
import {
  listAllRuns,
  type AnalystRun,
  type AnalystRunOutcome,
  type AnalystRunTrigger,
} from '../../services/analystService';

const PAGE_SIZE = 20;
const TICKER_DEBOUNCE_MS = 300;

function mapListError(err: unknown): string {
  const status = (err as { status?: number }).status;
  if (status === 403) return 'Sem permissão para ver o histórico de análises.';
  if (status === 502 || status === 503 || status === 504) {
    return 'Não foi possível falar com o analista agora. Tente de novo.';
  }
  return err instanceof Error ? err.message : 'Falha ao listar as análises';
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

function outcomeClass(outcome: string): string {
  if (outcome === 'SUCCESS') return 'market-verdict CHEAP';
  if (outcome === 'DEGRADED') return 'market-verdict FAIR';
  if (outcome === 'FAILED') return 'market-verdict EXPENSIVE';
  return 'market-verdict';
}

export const MarketRunsPanel: React.FC = () => {
  const [items, setItems] = useState<AnalystRun[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tickerInput, setTickerInput] = useState('');
  const [ticker, setTicker] = useState('');
  const [trigger, setTrigger] = useState<'' | AnalystRunTrigger>('');
  const [outcome, setOutcome] = useState<'' | AnalystRunOutcome>('');
  const [offset, setOffset] = useState(0);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Debounce só do texto do ticker; os selects já disparam a busca no onChange.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTicker(tickerInput.trim().toUpperCase());
      setOffset(0);
    }, TICKER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [tickerInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listAllRuns({
      ticker: ticker || undefined,
      trigger: trigger || undefined,
      outcome: outcome || undefined,
      limit: PAGE_SIZE,
      offset,
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items ?? []);
        setTotal(res.total ?? 0);
      })
      .catch((err) => { if (!cancelled) setError(mapListError(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker, trigger, outcome, offset, reloadTick]);

  const rangeLabel = useMemo(() => {
    if (total === 0) return '0 de 0';
    const from = offset + 1;
    const to = Math.min(offset + items.length, total);
    return `${from}–${to} de ${total}`;
  }, [offset, items.length, total]);

  return (
    <div className="market-ops-jobs">
      <div className="market-catalog-toolbar">
        <div className="search-input-wrapper audits-search-field">
          <Search size={16} className="search-icon" />
          <input
            className="search-input"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            placeholder="Filtrar por ticker"
            aria-label="Filtrar por ticker"
          />
        </div>
        <select
          className="form-input audits-compact-select"
          value={trigger}
          onChange={(e) => { setTrigger(e.target.value as '' | AnalystRunTrigger); setOffset(0); }}
          aria-label="Filtrar por origem"
        >
          <option value="">Manual e lote</option>
          <option value="ON_DEMAND">{RUN_TRIGGER_LABEL.ON_DEMAND}</option>
          <option value="SCHEDULED">{RUN_TRIGGER_LABEL.SCHEDULED}</option>
        </select>
        <select
          className="form-input audits-compact-select"
          value={outcome}
          onChange={(e) => { setOutcome(e.target.value as '' | AnalystRunOutcome); setOffset(0); }}
          aria-label="Filtrar por resultado"
        >
          <option value="">Todos os resultados</option>
          <option value="SUCCESS">{RUN_OUTCOME_LABEL.SUCCESS}</option>
          <option value="DEGRADED">{RUN_OUTCOME_LABEL.DEGRADED}</option>
          <option value="FAILED">{RUN_OUTCOME_LABEL.FAILED}</option>
        </select>
        <span className="connections-summary-chip is-wait" aria-live="polite">{rangeLabel}</span>
        <Tooltip label="Atualizar lista">
          <button
            type="button"
            className="btn-table-icon"
            onClick={() => setReloadTick((n) => n + 1)}
            disabled={loading}
            aria-label={loading ? 'Atualizando lista' : 'Atualizar lista'}
          >
            <RefreshCw size={15} className={loading ? 'spin' : undefined} />
          </button>
        </Tooltip>
      </div>

      {error ? (
        <div className="agent-test-result is-error" role="alert"><p>{error}</p></div>
      ) : null}

      <div className="hpanel-table-card">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Quando</th>
              <th>Origem</th>
              <th>Resultado</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {items.map((run) => (
              <tr
                key={run.id}
                className="hpanel-table-row-clickable"
                onClick={() => setSelectedRunId(run.id)}
                tabIndex={0}
                role="button"
                aria-label={`Ver detalhe da análise de ${run.ticker}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedRunId(run.id); } }}
              >
                <td><span className="table-cell-title">{run.ticker}</span></td>
                <td>{formatDateTime(run.analyzedAt)}</td>
                <td>{RUN_TRIGGER_LABEL[run.trigger] || run.trigger}</td>
                <td><span className={outcomeClass(run.outcome)}>{RUN_OUTCOME_LABEL[run.outcome] || run.outcome}</span></td>
                <td>{run.fallbackReason || (run.staleFacts ? 'Fatos defasados' : '—')}</td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr><td colSpan={5}><p className="text-muted" style={{ margin: 0 }}>Nenhuma análise encontrada com esses filtros.</p></td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="market-catalog-toolbar" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn-table-icon"
          disabled={loading || offset === 0}
          onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          aria-label="Página anterior"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          className="btn-table-icon"
          disabled={loading || offset + items.length >= total}
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
          aria-label="Próxima página"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {selectedRunId ? (
        <RunDetailModal runId={selectedRunId} onClose={() => setSelectedRunId(null)} />
      ) : null}
    </div>
  );
};
