import React, { useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import {
  reloadCatalog,
  runProactiveJob,
  type ProactiveReport,
} from '../../services/analystService';

function mapJobError(err: unknown, fallback: string): string {
  const status = (err as { status?: number }).status;
  const data = (err as { data?: { error?: string; message?: string } }).data;
  if (status === 403) {
    return data?.message || 'Somente ADMIN ou SYSTEM executam esta operação.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Não foi possível falar com o analista agora. O job pode ter seguindo no servidor.';
  }
  return err instanceof Error ? err.message : fallback;
}

function resultLabel(result: string): string {
  switch (result) {
    case 'SUCCESS':
      return 'Ok';
    case 'SKIPPED_IDEMPOTENT':
      return 'Já rodou hoje';
    case 'SKIPPED_NO_DATA':
      return 'Sem fatos';
    case 'ERROR':
      return 'Erro';
    default:
      return result || '—';
  }
}

export const MarketJobsPanel: React.FC = () => {
  const { addToast } = useToast();
  const [force, setForce] = useState(false);
  const [skipWait, setSkipWait] = useState(false);
  const [running, setRunning] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<ProactiveReport | null>(null);
  const [reloadMessage, setReloadMessage] = useState('');

  async function onRun(event: React.FormEvent) {
    event.preventDefault();
    setRunning(true);
    setError('');
    setReport(null);
    try {
      const next = await runProactiveJob({ force, skipWait });
      setReport(next);
      if (!next.lockAcquired) {
        addToast({
          type: 'info',
          title: 'Lote já em andamento',
          description: 'Outro job segura o lock deste dia útil. Aguarde terminar.',
        });
        return;
      }
      const ok = next.items.filter((item) => item.result === 'SUCCESS').length;
      addToast({
        type: 'success',
        title: `Lote ${next.businessDate}`,
        description: `${ok} análise(s) gravada(s) de ${next.items.length} ticker(s).`,
      });
    } catch (err) {
      setError(mapJobError(err, 'Falha ao disparar o lote'));
    } finally {
      setRunning(false);
    }
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

  const busy = running || reloading;

  return (
    <div className="market-ops-jobs">
      <p className="text-muted market-desk-hint">
        O lote analisa tickers com <code>hasRuns</code> no catálogo. Force ignora a idempotência do dia.
        Pular a espera da coleta dispara mesmo com fatos atrasados.
      </p>

      <form className="market-catalog-form" onSubmit={onRun}>
        <fieldset className="market-jobs-fieldset" disabled={busy}>
          <legend className="form-label">Lote diário</legend>
          <label className="market-catalog-toggle">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            <span>Forçar mesmo se o lote de hoje já rodou (<code>force=true</code>)</span>
          </label>
          <label className="market-catalog-toggle">
            <input
              type="checkbox"
              checked={skipWait}
              onChange={(e) => setSkipWait(e.target.checked)}
            />
            <span>Não esperar a coleta ficar pronta (<code>wait=false</code>)</span>
          </label>
        </fieldset>

        <div className="market-catalog-form-actions">
          <button type="submit" className="btn btn-primary btn-pill" disabled={busy}>
            <Play size={15} />
            <span>{running ? 'Rodando lote…' : 'Rodar lote agora'}</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-pill"
            disabled={busy}
            onClick={() => { void onReloadCache(); }}
          >
            <RefreshCw size={15} />
            <span>{reloading ? 'Atualizando cache…' : 'Atualizar cache do catálogo'}</span>
          </button>
        </div>
      </form>

      {reloadMessage ? (
        <p className="text-muted" role="status">{reloadMessage}</p>
      ) : null}

      {error ? (
        <div className="agent-test-result is-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {running && !report ? (
        <p className="text-muted" role="status" aria-live="polite">
          Processando o lote. Isso pode levar vários minutos.
        </p>
      ) : null}

      {report ? (
        <div className="hpanel-table-card">
          <p className="market-jobs-summary">
            {report.lockAcquired
              ? `Dia ${report.businessDate} · coleta ${report.collectionReady ? 'pronta' : 'não pronta'} · force ${report.force ? 'sim' : 'não'}`
              : `Dia ${report.businessDate} · lock ocupado — lote já em andamento.`}
          </p>
          {report.items.length > 0 ? (
            <table className="hpanel-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Resultado</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((item) => (
                  <tr key={`${item.ticker}-${item.runId || item.result}`}>
                    <td><span className="table-cell-title">{item.ticker}</span></td>
                    <td>{resultLabel(item.result)}</td>
                    <td>{item.error || (item.staleFacts ? 'Fatos defasados' : item.runId || '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : report.lockAcquired ? (
            <p className="text-muted">Nenhum ticker no lote. Ligue “lote diário” no catálogo.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
