import React, { useCallback, useEffect, useState } from 'react';
import { CalendarRange, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { hasAdminRole } from '../../utils/roles';
import { listDigests, runDigest, type AnalystDigest, type DigestKind } from '../../services/analystService';
import { formatMoney, formatSignedPct } from './dossierFormat';
import { thesisDisplayLabel, RISK_LEVEL_LABEL } from './marketLabels';
import { formatDayFull } from '../../utils/dataFreshnessText';

const KIND_LABEL: Record<DigestKind, string> = { WEEKLY: 'Semanal', MONTHLY: 'Mensal' };

const EMPTY_HINT: Record<DigestKind, string> = {
  WEEKLY: 'O resumo semanal é gerado todo sábado às 07:00, com as análises de segunda a sexta.',
  MONTHLY: 'O resumo mensal é gerado no dia 1 de cada mês, às 07:00, com o mês anterior.',
};

function dayMonth(iso: string): string {
  const full = formatDayFull(iso);
  return full === '—' ? iso : full.slice(0, 5);
}

/** "Semana 21/09 a 25/09/2026" ou "setembro de 2026". */
function periodLabel(d: AnalystDigest): string {
  if (d.kind === 'MONTHLY') {
    const [year, month] = d.periodKey.split('-').map(Number);
    const label = new Date(year, (month || 1) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return `Semana ${dayMonth(d.fromDate)} a ${formatDayFull(d.toDate)}`;
}

function mapError(err: unknown, fallback: string): string {
  const status = (err as { status?: number }).status;
  if (status === 502 || status === 503 || status === 504) return 'Não foi possível carregar os resumos agora. Tente de novo.';
  return err instanceof Error ? err.message : fallback;
}

function TickerButton({ ticker, name, onSelect }: { ticker: string; name?: string; onSelect: (ticker: string) => void }) {
  return (
    <button type="button" className="digest-ticker" onClick={() => onSelect(ticker)} title={name || ticker}>
      {ticker}
    </button>
  );
}

function MoverList({ title, items, onSelect, emptyText }: {
  title: string;
  items: AnalystDigest['topGainers'];
  onSelect: (ticker: string) => void;
  emptyText: string;
}) {
  return (
    <section className="digest-card" aria-label={title}>
      <h3 className="digest-card-title">{title}</h3>
      {items.length === 0 ? (
        <p className="text-muted">{emptyText}</p>
      ) : (
        <ol className="digest-list">
          {items.map((item) => (
            <li key={item.ticker}>
              <TickerButton ticker={item.ticker} name={item.displayName} onSelect={onSelect} />
              <strong className={item.returnPct >= 0 ? 'digest-up' : 'digest-down'}>{formatSignedPct(item.returnPct)}</strong>
              <span className="text-muted">fechou a {formatMoney(item.lastClose)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function rankText(rank: number): string {
  return rank > 0 ? `${rank}º` : 'fora do ranking';
}

export interface DigestPanelProps {
  onSelectTicker: (ticker: string) => void;
}

/**
 * Resumo do período (semana ou mês): o que mudou nas análises do lote. Mesmo conteúdo para todo
 * perfil; só o admin/ops vê o botão de gerar e a contagem de textos padrão.
 */
export const DigestPanel: React.FC<DigestPanelProps> = ({ onSelectTicker }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isOps = hasAdminRole(user?.roles) || Boolean(user?.roles?.some((r) => r === 'ROLE_OPS'));
  const [kind, setKind] = useState<DigestKind>('WEEKLY');
  const [items, setItems] = useState<AnalystDigest[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async (nextKind: DigestKind, keepKey?: string) => {
    setLoading(true);
    setError('');
    try {
      const list = await listDigests(nextKind, 12);
      setItems(list);
      setSelectedKey(list.find((d) => d.periodKey === keepKey)?.periodKey ?? list[0]?.periodKey ?? '');
    } catch (err) {
      setItems([]);
      setSelectedKey('');
      setError(mapError(err, 'Falha ao carregar os resumos'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(kind);
  }, [kind, load]);

  const selected = items.find((d) => d.periodKey === selectedKey) ?? null;

  const generate = async (force: boolean) => {
    setGenerating(true);
    try {
      const d = await runDigest({ kind, period: force ? selected?.periodKey : undefined, force });
      addToast({ type: 'success', title: 'Resumo gerado', description: periodLabel(d) });
      await load(kind, d.periodKey);
    } catch (err) {
      addToast({ type: 'error', title: 'Não foi possível gerar o resumo', description: mapError(err, 'Falha ao gerar o resumo') });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="market-digest-tab">
      <div className="digest-toolbar">
        <div className="market-catalog-toolbar" role="group" aria-label="Tipo de resumo">
          {(['WEEKLY', 'MONTHLY'] as DigestKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`connections-summary-chip${kind === k ? ' is-active' : ''}`}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {items.length > 0 ? (
          <label className="digest-period">
            <span className="text-muted">Período</span>
            <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} aria-label="Período do resumo">
              {items.map((d) => (
                <option key={d.periodKey} value={d.periodKey}>{periodLabel(d)}</option>
              ))}
            </select>
          </label>
        ) : null}
        {isOps ? (
          <div className="digest-admin">
            <button type="button" className="btn btn-secondary btn-pill" disabled={generating} onClick={() => { void generate(false); }}>
              <CalendarRange size={14} aria-hidden="true" /> Gerar {kind === 'WEEKLY' ? 'semana atual' : 'mês anterior'}
            </button>
            {selected ? (
              <button type="button" className="btn btn-secondary btn-pill" disabled={generating} onClick={() => { void generate(true); }}>
                <RefreshCw size={14} className={generating ? 'spin' : undefined} aria-hidden="true" /> Refazer este período
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {loading ? <p className="text-muted" role="status" aria-live="polite">Carregando resumos…</p> : null}

      {!loading && error ? (
        <div className="agent-test-result is-error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-secondary btn-pill" onClick={() => { void load(kind); }}>Tentar de novo</button>
        </div>
      ) : null}

      {!loading && !error && !selected ? (
        <p className="market-magic-pending" role="status">Ainda não há resumo {KIND_LABEL[kind].toLowerCase()}. {EMPTY_HINT[kind]}</p>
      ) : null}

      {selected ? (
        <div className="hpanel-table-card market-table-card digest-body">
          <header className="market-table-header">
            <h2 className="market-table-title">{periodLabel(selected)}</h2>
            <p className="text-muted market-table-subtitle">{selected.summary.replace(/^(Semana|Mês)[^:]*:\s*/, '')}</p>
          </header>

          <dl className="fii-dossier-kpis digest-kpis">
            <div><dt>Ativos analisados</dt><dd>{selected.coverage.assets}</dd></div>
            <div><dt>Análises</dt><dd>{selected.coverage.runs}</dd></div>
            <div><dt>Dias de pregão</dt><dd>{selected.coverage.sessionDays}</dd></div>
            <div><dt>Mudanças de tese</dt><dd>{selected.thesisChanges.length}</dd></div>
          </dl>

          <div className="digest-grid">
            <MoverList title="Maiores altas" items={selected.topGainers} onSelect={onSelectTicker} emptyText="Nenhum ativo subiu no período." />
            <MoverList title="Maiores quedas" items={selected.topLosers} onSelect={onSelectTicker} emptyText="Nenhum ativo caiu no período." />
          </div>

          <section className="digest-card" aria-label="Mudanças de tese">
            <h3 className="digest-card-title">Mudanças de tese</h3>
            {selected.thesisChanges.length === 0 ? (
              <p className="text-muted">Nenhuma mudança de tese no período.</p>
            ) : (
              <ul className="digest-list">
                {selected.thesisChanges.map((c) => (
                  <li key={`${c.ticker}-${c.detectedAt}`}>
                    <TickerButton ticker={c.ticker} name={c.displayName} onSelect={onSelectTicker} />
                    <span>{thesisDisplayLabel(c.fromThesis)} → <strong>{thesisDisplayLabel(c.toThesis)}</strong></span>
                    {c.isMaterial ? <span className="fii-tone-pill RISKY">Material</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="digest-grid">
            <section className="digest-card" aria-label="Fórmula Mágica">
              <h3 className="digest-card-title">Fórmula Mágica (top 10)</h3>
              {!selected.magicFormula ? (
                <p className="text-muted">Sem ranking guardado para comparar neste período.</p>
              ) : (
                <>
                  <p className="text-muted">De {formatDayFull(selected.magicFormula.startDate)} para {formatDayFull(selected.magicFormula.endDate)}.</p>
                  <h4 className="digest-sub">Entraram</h4>
                  {selected.magicFormula.entered.length === 0 ? <p className="text-muted">Ninguém entrou.</p> : (
                    <ul className="digest-list">
                      {selected.magicFormula.entered.map((m) => (
                        <li key={m.ticker}><TickerButton ticker={m.ticker} onSelect={onSelectTicker} /><span>{rankText(m.rankFrom)} → <strong>{rankText(m.rankTo)}</strong></span></li>
                      ))}
                    </ul>
                  )}
                  <h4 className="digest-sub">Saíram</h4>
                  {selected.magicFormula.exited.length === 0 ? <p className="text-muted">Ninguém saiu.</p> : (
                    <ul className="digest-list">
                      {selected.magicFormula.exited.map((m) => (
                        <li key={m.ticker}><TickerButton ticker={m.ticker} onSelect={onSelectTicker} /><span>{rankText(m.rankFrom)} → <strong>{rankText(m.rankTo)}</strong></span></li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            <section className="digest-card" aria-label="Nível de risco">
              <h3 className="digest-card-title">Nível de risco</h3>
              <h4 className="digest-sub">Subiram</h4>
              {selected.riskUp.length === 0 ? <p className="text-muted">Nenhum ativo subiu de nível.</p> : (
                <ul className="digest-list">
                  {selected.riskUp.map((r) => (
                    <li key={r.ticker}><TickerButton ticker={r.ticker} name={r.displayName} onSelect={onSelectTicker} /><span>{RISK_LEVEL_LABEL[r.from] || r.from} → <strong>{RISK_LEVEL_LABEL[r.to] || r.to}</strong></span></li>
                  ))}
                </ul>
              )}
              <h4 className="digest-sub">Desceram</h4>
              {selected.riskDown.length === 0 ? <p className="text-muted">Nenhum ativo desceu de nível.</p> : (
                <ul className="digest-list">
                  {selected.riskDown.map((r) => (
                    <li key={r.ticker}><TickerButton ticker={r.ticker} name={r.displayName} onSelect={onSelectTicker} /><span>{RISK_LEVEL_LABEL[r.from] || r.from} → <strong>{RISK_LEVEL_LABEL[r.to] || r.to}</strong></span></li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <p className="text-muted digest-foot">
            Gerado em {new Date(selected.generatedAt).toLocaleString('pt-BR')} a partir das análises do lote diário.
            {isOps && selected.coverage.narrativeFallback > 0 ? ` ${selected.coverage.narrativeFallback} análise(s) com texto padrão.` : ''}
            {' '}Análise, não recomendação de investimento.
          </p>
        </div>
      ) : null}
    </div>
  );
};
