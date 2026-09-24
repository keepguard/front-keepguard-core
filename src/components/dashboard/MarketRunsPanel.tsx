import React, { useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import { ListPager } from '../common/ListPager';
import { RunDetailModal } from './RunDetailModal';
import { RUN_TRIGGER_LABEL, RUN_OUTCOME_LABEL } from './marketLabels';
import {
  listAllRuns,
  type AnalystRun,
  type AnalystRunOutcome,
  type AnalystRunTrigger,
} from '../../services/analystService';

const PAGE_SIZE = 20;

type Filters = {
  ticker: string;
  trigger: '' | AnalystRunTrigger;
  outcome: '' | AnalystRunOutcome;
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = { ticker: '', trigger: '', outcome: '', from: '', to: '' };

/** datetime-local (hora local do navegador) -> RFC3339 para a API. */
function toIso(localValue: string): string | undefined {
  if (!localValue) return undefined;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

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
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listAllRuns({
      ticker: applied.ticker.trim().toUpperCase() || undefined,
      trigger: applied.trigger || undefined,
      outcome: applied.outcome || undefined,
      from: toIso(applied.from),
      to: toIso(applied.to),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items ?? []);
        setTotal(res.total ?? 0);
      })
      .catch((err) => { if (!cancelled) setError(mapListError(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applied, page, reloadTick]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setApplied(filters);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filterActions = (
    <div className="audits-filter-actions">
      <button type="submit" className="btn btn-secondary btn-pill audits-filter-submit" disabled={loading}>
        <Search size={15} />
        <span>Buscar</span>
      </button>
      <Tooltip label="Atualizar">
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
  );

  return (
    <div className="market-ops-jobs">
      <form className="audits-toolbar" onSubmit={handleSearch}>
        <div className="audits-filter-row audits-filter-row-primary">
          <input
            className="form-input"
            type="datetime-local"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            aria-label="De (opcional)"
            title="De (opcional)"
          />
          <input
            className="form-input"
            type="datetime-local"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            aria-label="Até (opcional)"
            title="Até (opcional)"
          />
          <select
            className="form-input audits-compact-select"
            value={filters.trigger}
            onChange={(e) => setFilters((f) => ({ ...f, trigger: e.target.value as Filters['trigger'] }))}
            aria-label="Filtrar por origem"
          >
            <option value="">Manual e lote</option>
            <option value="ON_DEMAND">{RUN_TRIGGER_LABEL.ON_DEMAND}</option>
            <option value="SCHEDULED">{RUN_TRIGGER_LABEL.SCHEDULED}</option>
          </select>
          <select
            className="form-input audits-compact-select"
            value={filters.outcome}
            onChange={(e) => setFilters((f) => ({ ...f, outcome: e.target.value as Filters['outcome'] }))}
            aria-label="Filtrar por resultado"
          >
            <option value="">Todos os resultados</option>
            <option value="SUCCESS">{RUN_OUTCOME_LABEL.SUCCESS}</option>
            <option value="DEGRADED">{RUN_OUTCOME_LABEL.DEGRADED}</option>
            <option value="FAILED">{RUN_OUTCOME_LABEL.FAILED}</option>
          </select>
        </div>
        <div className="audits-filter-row audits-filter-row-secondary">
          <input
            className="form-input"
            placeholder="Ticker"
            value={filters.ticker}
            onChange={(e) => setFilters((f) => ({ ...f, ticker: e.target.value }))}
            aria-label="Filtrar por ticker"
          />
        </div>
        <ListPager
          loading={loading}
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          leading={filterActions}
        />
      </form>

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

      {selectedRunId ? (
        <RunDetailModal runId={selectedRunId} onClose={() => setSelectedRunId(null)} />
      ) : null}
    </div>
  );
};
