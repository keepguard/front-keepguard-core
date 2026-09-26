import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight, Copy, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { hasAdminRole } from '../../utils/roles';
import {
  listDigests,
  runDigest,
  type AnalystDigest,
  type AnalystDigestMover,
  type AnalystDigestThesisChange,
  type DigestKind,
} from '../../services/analystService';
import { formatMoney, formatSignedPct } from './dossierFormat';
import { RISK_LEVEL_LABEL, thesisDisplayLabel, thesisTone } from './marketLabels';
import { formatDayFull } from '../../utils/dataFreshnessText';

const KIND_LABEL: Record<DigestKind, string> = { WEEKLY: 'Semanal', MONTHLY: 'Mensal' };

const EMPTY_HINT: Record<DigestKind, string> = {
  WEEKLY: 'O resumo semanal é gerado todo sábado às 07:00, com os pregões de segunda a sexta.',
  MONTHLY: 'O resumo mensal é gerado no dia 1 de cada mês, às 07:00, com o mês anterior.',
};

function dayMonth(iso: string): string {
  const full = formatDayFull(iso);
  return full === '—' ? iso : full.slice(0, 5);
}

/** "21/09 a 25/09/2026" ou "Setembro de 2026". */
function periodLabel(d: AnalystDigest): string {
  if (d.kind === 'MONTHLY') {
    const [year, month] = d.periodKey.split('-').map(Number);
    const label = new Date(year, (month || 1) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return `${dayMonth(d.fromDate)} a ${formatDayFull(d.toDate)}`;
}

function mapError(err: unknown, fallback: string): string {
  const status = (err as { status?: number }).status;
  if (status === 502 || status === 503 || status === 504) return 'Não foi possível carregar os resumos agora. Tente de novo.';
  return err instanceof Error ? err.message : fallback;
}

const TONE_RANK: Record<'good' | 'warn' | 'bad', number> = { good: 2, warn: 1, bad: 0 };

interface ThesisMove {
  ticker: string;
  displayName?: string;
  from: string;
  to: string;
  count: number;
  material: boolean;
}

/** Junta as mudanças de cada ativo no período em uma só: da primeira tese à última. */
function netThesisMoves(changes: AnalystDigestThesisChange[]): { better: ThesisMove[]; worse: ThesisMove[]; other: ThesisMove[]; returned: string[] } {
  const byTicker = new Map<string, AnalystDigestThesisChange[]>();
  [...changes]
    .sort((a, b) => a.detectedAt.localeCompare(b.detectedAt))
    .forEach((c) => byTicker.set(c.ticker, [...(byTicker.get(c.ticker) ?? []), c]));

  const out = { better: [] as ThesisMove[], worse: [] as ThesisMove[], other: [] as ThesisMove[], returned: [] as string[] };
  byTicker.forEach((list, ticker) => {
    const first = list[0];
    const last = list[list.length - 1];
    if (first.fromThesis === last.toThesis) {
      out.returned.push(ticker);
      return;
    }
    const move: ThesisMove = {
      ticker,
      displayName: last.displayName,
      from: first.fromThesis,
      to: last.toThesis,
      count: list.length,
      material: list.some((c) => c.isMaterial),
    };
    const delta = TONE_RANK[thesisTone(move.to)] - TONE_RANK[thesisTone(move.from)];
    (delta > 0 ? out.better : delta < 0 ? out.worse : out.other).push(move);
  });
  return out;
}

function TickerButton({ ticker, name, onSelect }: { ticker: string; name?: string; onSelect: (ticker: string) => void }) {
  return (
    <button type="button" className="digest-ticker" onClick={() => onSelect(ticker)} title={name ? `${name} · abrir dossiê` : 'Abrir dossiê'}>
      {ticker}
    </button>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'up' | 'down' }) {
  return (
    <article className="digest-tile">
      <span className="digest-tile-label">{label}</span>
      <strong className={`digest-tile-value${tone ? ` is-${tone}` : ''}`}>{value}</strong>
      {sub ? <span className="digest-tile-sub">{sub}</span> : null}
    </article>
  );
}

function MoverList({ title, icon, items, tone, onSelect, emptyText }: {
  title: string;
  icon: React.ReactNode;
  items: AnalystDigestMover[];
  tone: 'up' | 'down';
  onSelect: (ticker: string) => void;
  emptyText: string;
}) {
  const max = Math.max(...items.map((i) => Math.abs(i.returnPct)), 0.0001);
  return (
    <section className="digest-card" aria-label={title}>
      <h3 className="digest-card-title">{icon}{title}</h3>
      {items.length === 0 ? (
        <p className="text-muted">{emptyText}</p>
      ) : (
        <ol className="digest-movers">
          {items.map((item, index) => (
            <li key={item.ticker} className="digest-mover">
              <span className="digest-mover-rank" aria-hidden="true">{index + 1}</span>
              <span className="digest-mover-id">
                <TickerButton ticker={item.ticker} name={item.displayName} onSelect={onSelect} />
                <span className="digest-mover-price">{formatMoney(item.lastClose)}</span>
              </span>
              <span className="digest-bar" aria-hidden="true">
                <span className={`digest-bar-fill is-${tone}`} style={{ width: `${Math.max(4, (Math.abs(item.returnPct) / max) * 100)}%` }} />
              </span>
              <strong className={`digest-mover-value is-${tone}`}>{formatSignedPct(item.returnPct)}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ThesisGroup({ title, tone, moves, onSelect }: { title: string; tone: 'up' | 'down' | 'neutral'; moves: ThesisMove[]; onSelect: (ticker: string) => void }) {
  if (moves.length === 0) return null;
  return (
    <div className="digest-thesis-group">
      <h4 className={`digest-sub is-${tone}`}>{title} <span className="digest-count">{moves.length}</span></h4>
      <ul className="digest-thesis">
        {moves.map((m) => (
          <li key={m.ticker}>
            <TickerButton ticker={m.ticker} name={m.displayName} onSelect={onSelect} />
            <span className="digest-thesis-flow">
              {thesisDisplayLabel(m.from)} <span aria-hidden="true">→</span><span className="sr-only"> para </span> <strong>{thesisDisplayLabel(m.to)}</strong>
            </span>
            {m.count > 1 ? <span className="digest-chip">{m.count} mudanças</span> : null}
            {m.material ? <span className="digest-chip is-material">Material</span> : null}
          </li>
        ))}
      </ul>
    </div>
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
 * perfil; só o admin/ops vê os botões de gerar e a contagem de textos padrão.
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

  const index = items.findIndex((d) => d.periodKey === selectedKey);
  const selected = index >= 0 ? items[index] : null;
  const moves = useMemo(() => netThesisMoves(selected?.thesisChanges ?? []), [selected]);

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

  const copySummary = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(`${KIND_LABEL[selected.kind]} · ${periodLabel(selected)}\n${selected.summary}`);
      addToast({ type: 'success', title: 'Resumo copiado', description: periodLabel(selected) });
    } catch {
      addToast({ type: 'error', title: 'Não foi possível copiar', description: 'Seu navegador bloqueou o acesso à área de transferência.' });
    }
  };

  const lead = selected ? selected.summary.replace(/^(Semana|Mês)[^:]*:\s*/, '') : '';
  const market = selected?.market && selected.market.assets > 0 ? selected.market : null;
  const best = selected?.topGainers[0];
  const worst = selected?.topLosers[0];

  return (
    <div className="digest">
      <header className="digest-head">
        <div className="digest-head-main">
          <span className="digest-kicker">Resumo do mercado</span>
          <div className="digest-nav">
            <button
              type="button"
              className="digest-nav-btn"
              aria-label="Período anterior"
              disabled={loading || index < 0 || index >= items.length - 1}
              onClick={() => setSelectedKey(items[index + 1].periodKey)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <h2 className="digest-title">{selected ? periodLabel(selected) : KIND_LABEL[kind]}</h2>
            <button
              type="button"
              className="digest-nav-btn"
              aria-label="Período seguinte"
              disabled={loading || index <= 0}
              onClick={() => setSelectedKey(items[index - 1].periodKey)}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="digest-controls">
          <div className="digest-segment" role="group" aria-label="Tipo de resumo">
            {(['WEEKLY', 'MONTHLY'] as DigestKind[]).map((k) => (
              <button key={k} type="button" className={kind === k ? 'is-active' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          {items.length > 1 ? (
            <label className="digest-period">
              <span className="sr-only">Período do resumo</span>
              <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)}>
                {items.map((d) => (
                  <option key={d.periodKey} value={d.periodKey}>{periodLabel(d)}</option>
                ))}
              </select>
            </label>
          ) : null}
          {selected ? (
            <button type="button" className="digest-ghost" onClick={() => { void copySummary(); }}>
              <Copy size={14} aria-hidden="true" /> Copiar resumo
            </button>
          ) : null}
          {isOps ? (
            <>
              <button type="button" className="digest-ghost" disabled={generating} onClick={() => { void generate(false); }}>
                <CalendarRange size={14} aria-hidden="true" /> Gerar {kind === 'WEEKLY' ? 'semana atual' : 'mês anterior'}
              </button>
              {selected ? (
                <button type="button" className="digest-ghost" disabled={generating} onClick={() => { void generate(true); }}>
                  <RefreshCw size={14} className={generating ? 'spin' : undefined} aria-hidden="true" /> Refazer
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="market-signals" aria-busy="true" aria-live="polite">
          <div className="market-skeleton" />
          <div className="market-skeleton" />
          <div className="market-skeleton" />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="agent-test-result is-error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-secondary btn-pill" onClick={() => { void load(kind); }}>Tentar de novo</button>
        </div>
      ) : null}

      {!loading && !error && !selected ? (
        <div className="digest-empty" role="status">
          <strong>Ainda não há resumo {KIND_LABEL[kind].toLowerCase()}.</strong>
          <span>{EMPTY_HINT[kind]}</span>
        </div>
      ) : null}

      {selected && !loading ? (
        <>
          <section className="digest-hero" aria-label="Visão geral do período">
            <p className="digest-lead">{lead}</p>
            {market ? (
              <div className="digest-breadth">
                <div
                  className="digest-breadth-bar"
                  role="img"
                  aria-label={`${market.up} ativos sobem, ${market.flat} ficam estáveis e ${market.down} caem`}
                >
                  <span className="is-up" style={{ flexGrow: market.up }} />
                  <span className="is-flat" style={{ flexGrow: market.flat }} />
                  <span className="is-down" style={{ flexGrow: market.down }} />
                </div>
                <ul className="digest-breadth-legend">
                  <li><span className="dot is-up" aria-hidden="true" /> <strong>{market.up}</strong> sobem</li>
                  <li><span className="dot is-flat" aria-hidden="true" /> <strong>{market.flat}</strong> estáveis</li>
                  <li><span className="dot is-down" aria-hidden="true" /> <strong>{market.down}</strong> caem</li>
                  <li className="digest-median">
                    Mediana <strong className={market.medianReturnPct >= 0 ? 'is-up' : 'is-down'}>{formatSignedPct(market.medianReturnPct)}</strong>
                  </li>
                </ul>
              </div>
            ) : null}
          </section>

          <div className="digest-tiles">
            <Tile
              label="Maior alta"
              value={best ? best.ticker : '—'}
              sub={best ? <span className="is-up">{formatSignedPct(best.returnPct)}</span> : 'Nenhuma alta no período'}
              tone="up"
            />
            <Tile
              label="Maior queda"
              value={worst ? worst.ticker : '—'}
              sub={worst ? <span className="is-down">{formatSignedPct(worst.returnPct)}</span> : 'Nenhuma queda no período'}
              tone="down"
            />
            <Tile
              label="Mudanças de tese"
              value={moves.better.length + moves.worse.length + moves.other.length}
              sub={`${moves.better.length} melhoraram · ${moves.worse.length} pioraram`}
            />
            <Tile
              label="Ativos analisados"
              value={selected.coverage.assets}
              sub={`${selected.coverage.sessionDays} ${selected.coverage.sessionDays === 1 ? 'pregão' : 'pregões'}`}
            />
          </div>

          <div className="digest-grid">
            <MoverList title="Maiores altas" icon={<TrendingUp size={16} aria-hidden="true" />} tone="up" items={selected.topGainers} onSelect={onSelectTicker} emptyText="Nenhum ativo subiu no período." />
            <MoverList title="Maiores quedas" icon={<TrendingDown size={16} aria-hidden="true" />} tone="down" items={selected.topLosers} onSelect={onSelectTicker} emptyText="Nenhum ativo caiu no período." />
          </div>

          <section className="digest-card" aria-label="Mudanças de tese">
            <h3 className="digest-card-title">Mudanças de tese</h3>
            {moves.better.length + moves.worse.length + moves.other.length === 0 ? (
              <p className="text-muted">Nenhuma mudança de tese no período.</p>
            ) : (
              <>
                <ThesisGroup title="Melhoraram" tone="up" moves={moves.better} onSelect={onSelectTicker} />
                <ThesisGroup title="Pioraram" tone="down" moves={moves.worse} onSelect={onSelectTicker} />
                <ThesisGroup title="Outras mudanças" tone="neutral" moves={moves.other} onSelect={onSelectTicker} />
              </>
            )}
            {moves.returned.length > 0 ? (
              <p className="text-muted digest-returned">
                Mudaram e voltaram à tese de partida: {moves.returned.join(', ')}.
              </p>
            ) : null}
          </section>

          <div className="digest-grid">
            <section className="digest-card" aria-label="Fórmula Mágica">
              <h3 className="digest-card-title">Fórmula Mágica · top 10</h3>
              {!selected.magicFormula ? (
                <p className="text-muted">Sem ranking guardado para comparar neste período.</p>
              ) : (
                <>
                  <p className="text-muted digest-note">De {formatDayFull(selected.magicFormula.startDate)} para {formatDayFull(selected.magicFormula.endDate)}.</p>
                  <h4 className="digest-sub is-up">Entraram</h4>
                  {selected.magicFormula.entered.length === 0 ? <p className="text-muted">Ninguém entrou.</p> : (
                    <ul className="digest-thesis">
                      {selected.magicFormula.entered.map((m) => (
                        <li key={m.ticker}><TickerButton ticker={m.ticker} onSelect={onSelectTicker} /><span className="digest-thesis-flow">{rankText(m.rankFrom)} <span aria-hidden="true">→</span><span className="sr-only"> para </span> <strong>{rankText(m.rankTo)}</strong></span></li>
                      ))}
                    </ul>
                  )}
                  <h4 className="digest-sub is-down">Saíram</h4>
                  {selected.magicFormula.exited.length === 0 ? <p className="text-muted">Ninguém saiu.</p> : (
                    <ul className="digest-thesis">
                      {selected.magicFormula.exited.map((m) => (
                        <li key={m.ticker}><TickerButton ticker={m.ticker} onSelect={onSelectTicker} /><span className="digest-thesis-flow">{rankText(m.rankFrom)} <span aria-hidden="true">→</span><span className="sr-only"> para </span> <strong>{rankText(m.rankTo)}</strong></span></li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            <section className="digest-card" aria-label="Nível de risco">
              <h3 className="digest-card-title">Nível de risco</h3>
              <h4 className="digest-sub is-down">Subiram <span className="digest-count">{selected.riskUp.length}</span></h4>
              {selected.riskUp.length === 0 ? <p className="text-muted">Nenhum ativo subiu de nível.</p> : (
                <ul className="digest-thesis">
                  {selected.riskUp.map((r) => (
                    <li key={r.ticker}><TickerButton ticker={r.ticker} name={r.displayName} onSelect={onSelectTicker} /><span className="digest-thesis-flow">{RISK_LEVEL_LABEL[r.from] || r.from} <span aria-hidden="true">→</span><span className="sr-only"> para </span> <strong>{RISK_LEVEL_LABEL[r.to] || r.to}</strong></span></li>
                  ))}
                </ul>
              )}
              <h4 className="digest-sub is-up">Desceram <span className="digest-count">{selected.riskDown.length}</span></h4>
              {selected.riskDown.length === 0 ? <p className="text-muted">Nenhum ativo desceu de nível.</p> : (
                <ul className="digest-thesis">
                  {selected.riskDown.map((r) => (
                    <li key={r.ticker}><TickerButton ticker={r.ticker} name={r.displayName} onSelect={onSelectTicker} /><span className="digest-thesis-flow">{RISK_LEVEL_LABEL[r.from] || r.from} <span aria-hidden="true">→</span><span className="sr-only"> para </span> <strong>{RISK_LEVEL_LABEL[r.to] || r.to}</strong></span></li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <p className="text-muted digest-foot">
            Variação do último fechamento do período contra o último fechamento anterior a ele.
            {market && market.lowPriceExcluded > 0
              ? ` Os ${market.lowPriceExcluded} ativos que fecham abaixo de ${formatMoney(market.listMinPrice)} ficam fora das listas de altas e quedas, mas contam na amplitude.`
              : ''}
            {' '}Gerado em {new Date(selected.generatedAt).toLocaleString('pt-BR')} a partir das análises do lote diário.
            {isOps && selected.coverage.narrativeFallback > 0 ? ` ${selected.coverage.narrativeFallback} análise(s) com texto padrão.` : ''}
            {' '}Análise, não recomendação de investimento.
          </p>
        </>
      ) : null}
    </div>
  );
};
