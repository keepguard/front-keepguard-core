import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Tooltip } from '../common/Tooltip';
import {
  getProactiveJobStatus,
  listCatalogTickers,
  reloadCatalog,
  runProactiveJob,
  type ProactiveJobStatus,
  type ProactiveTickerResult,
} from '../../services/analystService';

const POLL_MS = 5000;

function mapJobError(err: unknown, fallback: string): string {
  const status = (err as { status?: number }).status;
  const data = (err as { data?: { error?: string; message?: string } }).data;
  if (status === 403) {
    return data?.message || 'Somente ADMIN ou SYSTEM executam esta operação.';
  }
  if (data?.error === 'NO_BATCH_ASSETS') {
    return data.message || 'Nenhum ativo com lote diário ligado. Ligue o lote de ao menos um ativo na aba Catálogo.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Não foi possível falar com o analista agora. Tente de novo.';
  }
  return err instanceof Error ? err.message : fallback;
}

type ResultFilter = 'ALL' | 'SUCCESS' | 'SKIPPED_IDEMPOTENT' | 'SKIPPED_NO_DATA' | 'ERROR';

const RESULT_LABEL: Record<Exclude<ResultFilter, 'ALL'>, string> = {
  SUCCESS: 'Ok',
  SKIPPED_IDEMPOTENT: 'Já rodou hoje',
  SKIPPED_NO_DATA: 'Sem fatos',
  ERROR: 'Erro',
};

function resultLabel(result: string): string {
  return RESULT_LABEL[result as keyof typeof RESULT_LABEL] ?? (result || '—');
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function elapsedLabel(startedAt: string | undefined, now: number): string {
  if (!startedAt) return '';
  const secs = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return `${Math.floor(secs / 60)} min ${String(secs % 60).padStart(2, '0')} s`;
}

export const MarketJobsPanel: React.FC = () => {
  const { addToast } = useToast();
  const [force, setForce] = useState(false);
  const [skipWait, setSkipWait] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);
  const [starting, setStarting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<ProactiveJobStatus | null>(null);
  const [batchCount, setBatchCount] = useState<number | null>(null);
  const [reloadMessage, setReloadMessage] = useState('');
  const [filter, setFilter] = useState<ResultFilter>('ALL');
  const [now, setNow] = useState(() => Date.now());
  const previousStatus = useRef<string | undefined>(undefined);

  const running = job?.status === 'RUNNING';
  const report = job?.report;

  const refreshStatus = useCallback(async () => {
    try {
      setJob(await getProactiveJobStatus());
    } catch (err) {
      setError(mapJobError(err, 'Falha ao consultar o andamento do lote'));
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    listCatalogTickers()
      .then((res) => setBatchCount((res.items ?? []).filter((item) => item.isActive !== false && item.hasRuns).length))
      .catch(() => setBatchCount(null));
  }, [refreshStatus]);

  // Enquanto o lote roda: consulta o andamento e atualiza o cronômetro.
  useEffect(() => {
    if (!running) return undefined;
    const poll = window.setInterval(() => { void refreshStatus(); }, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [running, refreshStatus]);

  // Avisa quando o lote termina (só se o painel viu o estado RUNNING antes).
  useEffect(() => {
    const prev = previousStatus.current;
    previousStatus.current = job?.status;
    if (prev !== 'RUNNING' || !job) return;
    if (job.status === 'FAILED') {
      setError(job.error || 'O lote falhou.');
    } else if (job.status === 'DONE' && job.report) {
      if (!job.report.lockAcquired) {
        addToast({ type: 'info', title: 'Lote já em andamento', description: 'Outro processo segura o lock deste dia útil. Aguarde terminar.' });
        return;
      }
      const ok = job.report.items.filter((item) => item.result === 'SUCCESS').length;
      addToast({
        type: 'success',
        title: `Lote ${job.report.businessDate} concluído`,
        description: `${ok} análise(s) gravada(s) de ${job.report.items.length} ticker(s).`,
      });
    }
  }, [job, addToast]);

  async function start() {
    setStarting(true);
    setError('');
    setConfirmForce(false);
    setFilter('ALL');
    try {
      setJob(await runProactiveJob({ force, skipWait }));
      setNow(Date.now());
    } catch (err) {
      setError(mapJobError(err, 'Falha ao disparar o lote'));
    } finally {
      setStarting(false);
    }
  }

  function onRun(event: React.FormEvent) {
    event.preventDefault();
    if (force) {
      setConfirmForce(true);
      return;
    }
    void start();
  }

  async function onReloadCache() {
    setReloading(true);
    setError('');
    setReloadMessage('');
    try {
      const res = await reloadCatalog();
      setReloadMessage(`${res.total} ativo(s) no cache.`);
      addToast({
        type: 'success',
        title: 'Cache atualizado',
        description: res.message || `${res.total} ativos recarregados do Mongo para o Redis.`,
      });
    } catch (err) {
      setError(mapJobError(err, 'Falha ao recarregar o catálogo'));
    } finally {
      setReloading(false);
    }
  }

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const item of report?.items ?? []) out[item.result] = (out[item.result] ?? 0) + 1;
    return out;
  }, [report]);

  const visibleItems: ProactiveTickerResult[] = useMemo(
    () => (report?.items ?? []).filter((item) => filter === 'ALL' || item.result === filter),
    [report, filter],
  );

  const busy = starting || running || reloading;
  const noBatch = batchCount === 0;

  return (
    <div className="market-ops-jobs">
      <form className="market-catalog-form" onSubmit={onRun}>
        <fieldset className="market-jobs-fieldset" disabled={busy}>
          <legend className="form-label">Lote diário</legend>
          <div className="market-toolbar-switch">
            <label className="switch-wrapper">
              <input
                className="switch-input"
                type="checkbox"
                checked={force}
                onChange={(e) => { setForce(e.target.checked); setConfirmForce(false); }}
                aria-labelledby="market-job-force-label"
              />
              <span className="switch-slider" />
            </label>
            <span>
              <span id="market-job-force-label">Rodar mesmo se o lote de hoje já rodou</span>
              <span className="text-muted market-catalog-hint"> Reanalisa todos os ativos do lote; cada um custa uma análise.</span>
            </span>
          </div>
          <div className="market-toolbar-switch">
            <label className="switch-wrapper">
              <input
                className="switch-input"
                type="checkbox"
                checked={skipWait}
                onChange={(e) => setSkipWait(e.target.checked)}
                aria-labelledby="market-job-wait-label"
              />
              <span className="switch-slider" />
            </label>
            <span>
              <span id="market-job-wait-label">Não esperar a coleta ficar pronta</span>
              <span className="text-muted market-catalog-hint"> Dispara mesmo com fatos atrasados. Sem isto, o lote pode esperar até 1 h pela coleta.</span>
            </span>
          </div>
        </fieldset>

        {noBatch ? (
          <p className="text-muted market-catalog-hint" role="status">
            Nenhum ativo com lote diário ligado. Ligue o lote de ao menos um ativo na aba Catálogo.
          </p>
        ) : null}

        {confirmForce ? (
          <div className="agent-test-result is-error" role="alertdialog" aria-label="Confirmar reanálise do lote">
            <p style={{ margin: 0 }}>
              Reanalisar {batchCount ?? 'todos os'} ativo(s) do lote agora? Cada ticker custa uma análise, mesmo já analisado hoje.
            </p>
            <div className="market-catalog-toolbar" style={{ margin: '0.5rem 0 0' }}>
              <button type="button" className="btn btn-primary btn-pill" onClick={() => { void start(); }}>Reanalisar</button>
              <button type="button" className="btn btn-secondary btn-pill" onClick={() => setConfirmForce(false)}>Cancelar</button>
            </div>
          </div>
        ) : null}

        <div className="market-catalog-toolbar" style={{ marginBottom: 0 }}>
          <button type="submit" className="btn btn-primary btn-pill" disabled={busy || noBatch || confirmForce}>
            <Play size={15} />
            <span>{starting ? 'Iniciando…' : running ? 'Lote em andamento…' : 'Rodar lote agora'}</span>
          </button>
          <Tooltip label="Atualizar cache do catálogo" description="Recarrega os ativos do Mongo para o Redis.">
            <button
              type="button"
              className="btn-table-icon"
              disabled={busy}
              onClick={() => { void onReloadCache(); }}
              aria-label="Atualizar cache do catálogo"
            >
              <RefreshCw size={15} className={reloading ? 'spin' : undefined} />
            </button>
          </Tooltip>
        </div>
      </form>

      {reloadMessage ? <p className="text-muted" role="status">{reloadMessage}</p> : null}

      {error ? (
        <div className="agent-test-result is-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {running ? (
        <p className="text-muted" role="status" aria-live="polite">
          Lote em andamento desde {formatTime(job?.startedAt)} ({elapsedLabel(job?.startedAt, now)}). Pode sair desta tela: o lote segue no servidor.
        </p>
      ) : null}

      {!running && !report && job?.status === 'IDLE' ? (
        <p className="text-muted" role="status">Nenhum lote disparado por aqui desde o último reinício do analista.</p>
      ) : null}

      {report ? (
        <div className="hpanel-table-card">
          <p className="market-jobs-summary">
            {report.lockAcquired
              ? `Dia ${report.businessDate} · coleta ${report.collectionReady ? 'pronta' : 'não pronta'} · ${report.force ? 'reanálise forçada' : 'lote normal'}${job?.finishedAt ? ` · terminou às ${formatTime(job.finishedAt)}` : ''}`
              : `Dia ${report.businessDate} · lock ocupado — lote já em andamento.`}
          </p>
          {report.items.length > 0 ? (
            <>
              <div className="market-catalog-toolbar" role="group" aria-label="Filtrar resultado do lote" style={{ margin: '0 0 0.75rem' }}>
                {(['ALL', 'ERROR', 'SKIPPED_NO_DATA', 'SKIPPED_IDEMPOTENT', 'SUCCESS'] as ResultFilter[]).map((key) => {
                  const total = key === 'ALL' ? report.items.length : (counts[key] ?? 0);
                  if (key !== 'ALL' && total === 0) return null;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`connections-summary-chip${filter === key ? ' is-active' : ''}${key === 'ERROR' && filter === key ? ' is-off' : ''}`}
                      aria-pressed={filter === key}
                      onClick={() => setFilter(key)}
                    >
                      {key === 'ALL' ? 'Todos' : RESULT_LABEL[key]} · {total}
                    </button>
                  );
                })}
              </div>
              <div className="market-jobs-table-scroll">
                <table className="hpanel-table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Resultado</th>
                      <th>Detalhe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item) => (
                      <tr key={`${item.ticker}-${item.runId || item.result}`}>
                        <td><span className="table-cell-title">{item.ticker}</span></td>
                        <td>{resultLabel(item.result)}</td>
                        <td>{item.error || (item.staleFacts ? 'Fatos defasados' : item.runId || '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : report.lockAcquired ? (
            <p className="text-muted">Nenhum ticker no lote. Ligue “lote diário” no catálogo.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
