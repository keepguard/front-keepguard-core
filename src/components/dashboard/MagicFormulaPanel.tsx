import { useEffect, useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import type { AnalystMagicFormulaRanking, AnalystMagicRanked } from '../../services/analystService';
import {
  MAGIC_FORMULA_MIN_UNIVERSE,
  businessDateBRT,
  formatIsoDatePt,
  getFavorites,
  getUserWatchlist,
} from '../../services/analystService';
import { Tooltip } from '../common/Tooltip';
import { LockedNotice, LockedPlaceholder, LockedTicker } from './LockedAsset';

const PAGE_SIZE = 10;

const COLUMN_HELP = {
  soma: {
    label: 'Soma',
    description: 'Posição em EY + posição em ROIC. Menor soma = melhor na Magia.',
  },
  ey: {
    label: 'EY %',
    description: 'Earnings Yield: EBIT em relação ao valor da empresa (EV). Proxy de “está barata?”.',
  },
  roic: {
    label: 'ROIC %',
    description: 'Retorno sobre o capital investido. Proxy de “usa bem o capital?”.',
  },
  fscore: {
    label: 'F-Score',
    description:
      'Piotroski: checklist de qualidade dos números (X de Y critérios calculáveis). Só contexto — não ordena o ranking.',
  },
} as const;

function ColumnHint({ help, align = 'center' }: { help: (typeof COLUMN_HELP)[keyof typeof COLUMN_HELP]; align?: 'start' | 'center' | 'end' }) {
  return (
    <Tooltip label={help.label} description={help.description} align={align}>
      <span tabIndex={0} className="market-magic-th-tip">{help.label}</span>
    </Tooltip>
  );
}

function num(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function fScoreRatio(row: AnalystMagicRanked): number | null {
  if (row.piotroskiPossible == null || row.piotroskiPossible <= 0 || row.piotroskiScore == null) return null;
  return row.piotroskiScore / row.piotroskiPossible;
}

/** Só descreve a faixa do checklist; o F-Score não ordena o ranking. */
function fScoreTone(ratio: number | null): 'high' | 'mid' | 'low' | 'none' {
  if (ratio == null) return 'none';
  if (ratio >= 0.7) return 'high';
  if (ratio >= 0.4) return 'mid';
  return 'low';
}

function barWidth(value: number, max: number): number {
  if (max <= 0) return 0;
  return 4 + Math.min(1, Math.max(0, value) / max) * 96;
}

function daysBetween(d1: string, d2: string): number {
  const t1 = new Date(d1 + 'T12:00:00Z').getTime();
  const t2 = new Date(d2 + 'T12:00:00Z').getTime();
  return Math.round(Math.abs(t2 - t1) / (1000 * 3600 * 24));
}

function PendingTodayNotice({ asOfDate }: { asOfDate: string }) {
  const today = businessDateBRT();
  const diff = daysBetween(asOfDate, today);
  return (
    <p className="market-magic-pending" role="status">
      Ranking de {formatIsoDatePt(asOfDate)}{diff > 1 ? ` (${diff} dias sem novo fechamento)` : ''}. O de hoje ainda não foi processado — o lote diário
      roda às 21:30 (dias úteis).
    </p>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <article className="mf-tile">
      <span className="mf-tile-label">{label}</span>
      <strong className="mf-tile-value">{value}</strong>
      {sub ? <span className="mf-tile-sub">{sub}</span> : null}
    </article>
  );
}

export interface MagicFormulaPanelProps {
  ranking: AnalystMagicFormulaRanking;
  onSelectTicker?: (ticker: string) => void;
}

export function MagicFormulaPanel({ ranking, onSelectTicker }: MagicFormulaPanelProps) {
  const universe = ranking.universeSize ?? 0;
  const significant = universe >= MAGIC_FORMULA_MIN_UNIVERSE;
  const ranked = useMemo(() => (significant ? ranking.ranked ?? [] : []), [significant, ranking.ranked]);
  const excluded = ranking.excluded?.length ?? 0;
  const omitted = ranking.omitted?.length ?? 0;
  const pendingToday = ranking.asOfDate !== businessDateBRT();
  const asOfLabel = formatIsoDatePt(ranking.asOfDate);
  const concentration = significant
    ? (ranking.concentration ?? []).filter((row) => row.count >= 2).slice(0, 3)
    : [];

  const [sector, setSector] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [mine, setMine] = useState<Set<string>>(new Set());

  // Os ativos do usuário só servem para destacar; falha aqui não afeta o ranking.
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([getFavorites(), getUserWatchlist()]).then(([fav, watch]) => {
      if (cancelled) return;
      const tickers = new Set<string>();
      if (fav.status === 'fulfilled') (fav.value.tickers ?? []).forEach((t) => tickers.add(t.toUpperCase()));
      if (watch.status === 'fulfilled') (watch.value.tickers ?? []).forEach((t) => tickers.add(t.toUpperCase()));
      setMine(tickers);
    });
    return () => { cancelled = true; };
  }, []);

  const sectors = useMemo(() => {
    const seen = new Map<string, string>();
    ranked.forEach((row) => {
      if (row.sector) seen.set(row.sector, row.sectorLabel || row.sector);
    });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [ranked]);

  const filtered = useMemo(
    () => (sector ? ranked.filter((row) => row.sector === sector) : ranked),
    [ranked, sector],
  );
  const shown = filtered.slice(0, visible);
  const unlocked = shown.filter((r) => !r.locked);
  const maxEy = Math.max(...unlocked.map((r) => r.eyPct), 0);
  const maxRoic = Math.max(...unlocked.map((r) => r.roicPct), 0);
  const best = ranked[0];
  const hasLocked = ranked.some((row) => row.locked);
  const mineInRanking = ranked.filter((row) => !row.locked && mine.has(row.ticker.toUpperCase())).length;

  return (
    <section className="mf" aria-label="Fórmula Mágica">
      {pendingToday ? <PendingTodayNotice asOfDate={ranking.asOfDate} /> : null}

      <header className="mf-head">
        <div>
          <span className="mf-kicker">Fórmula Mágica</span>
          <h2 className="mf-title">{pendingToday ? `Ranking de ${asOfLabel}` : `Ranking de hoje · ${asOfLabel}`}</h2>
        </div>
      </header>

      <div className="mf-hero">
        <p className="mf-lead">
          Inspirado em Joel Greenblatt: entre os papéis elegíveis, quem combina preço atrativo (EY) com
          retorno sobre o capital (ROIC). Bancos e utilities ficam de fora. Não é recomendação de compra.
        </p>
        {significant && concentration.length > 0 ? (
          <ul className="mf-chips" aria-label="Concentração setorial no topo">
            {concentration.map((row) => (
              <li key={row.sector} className="mf-chip">{row.label}: {row.count} de {row.of} no top</li>
            ))}
          </ul>
        ) : null}
      </div>

      {hasLocked ? (
        <LockedNotice text="Você vê em detalhe os ativos do seu plano. Nos demais, aparecem só a posição, a soma e o setor." />
      ) : null}

      <div className="mf-tiles">
        <Tile label="Analisados" value={universe} sub="universo do dia" />
        <Tile label="No ranking" value={ranked.length} sub="com nota completa" />
        <Tile label="Excluídas" value={excluded} sub="fora do ranking" />
        <Tile label="Omitidas" value={omitted} sub="métrica ausente" />
        <Tile label="Você acompanha" value={mineInRanking} sub="no ranking" />
        {best ? <Tile label="1º colocado" value={best.locked ? 'Bloqueado' : best.ticker} sub={`Soma ${best.combined}`} /> : null}
      </div>

      {!significant ? (
        <p className="market-magic-insufficient" role="status">
          Universo insuficiente para ranking significativo: {universe} ativo{universe === 1 ? '' : 's'} (mínimo{' '}
          {MAGIC_FORMULA_MIN_UNIVERSE}). Concentração setorial também fica oculta — amplie a watchlist para
          interpretar posição e concentração.
        </p>
      ) : ranked.length === 0 ? (
        <p className="market-magic-empty text-muted">Ainda não há ativos elegíveis neste dia.</p>
      ) : (
        <div className="mf-card">
          <div className="mf-toolbar">
            <label className="mf-filter">
              <span>Setor</span>
              <select
                value={sector}
                onChange={(e) => { setSector(e.target.value); setVisible(PAGE_SIZE); }}
              >
                <option value="">Todos os setores</option>
                {sectors.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
            <span className="mf-count">
              Mostrando {shown.length} de {filtered.length}
            </span>
          </div>

          <div className="mf-row mf-row-head" role="presentation">
            <span className="mf-col-rank">#</span>
            <span className="mf-col-id">Ativo</span>
            <span className="mf-col-bar"><ColumnHint help={COLUMN_HELP.ey} align="start" /></span>
            <span className="mf-col-bar"><ColumnHint help={COLUMN_HELP.roic} align="start" /></span>
            <span className="mf-col-num"><ColumnHint help={COLUMN_HELP.soma} align="end" /></span>
            <span className="mf-col-f"><ColumnHint help={COLUMN_HELP.fscore} align="end" /></span>
          </div>

          <ol className="mf-list">
            {shown.map((row) => {
              if (row.locked) {
                return (
                  <li key={row.ticker} className="mf-row is-locked">
                    <span className="mf-col-rank"><span className="mf-rank">{row.rank}</span></span>
                    <span className="mf-col-id">
                      <LockedTicker />
                      <span className="mf-sector">{row.sectorLabel || '—'}</span>
                    </span>
                    <span className="mf-col-bar"><span className="mf-bar" aria-hidden="true" /><LockedPlaceholder>00,00%</LockedPlaceholder></span>
                    <span className="mf-col-bar"><span className="mf-bar" aria-hidden="true" /><LockedPlaceholder>00,00%</LockedPlaceholder></span>
                    <span className="mf-col-num" title="Soma das posições em EY e ROIC">
                      <span className="mf-mobile-label">Soma</span>{row.combined}
                    </span>
                    <span className="mf-col-f"><span className="mf-f is-none"><LockedPlaceholder>00%</LockedPlaceholder></span></span>
                  </li>
                );
              }
              const ratio = fScoreRatio(row);
              const isMine = mine.has(row.ticker.toUpperCase());
              return (
                <li key={row.ticker} className={`mf-row${row.rank <= 3 ? ' is-top' : ''}`}>
                  <span className="mf-col-rank"><span className="mf-rank">{row.rank}</span></span>
                  <span className="mf-col-id">
                    <button
                      type="button"
                      className="mf-ticker"
                      onClick={() => onSelectTicker?.(row.ticker)}
                      disabled={!onSelectTicker}
                      title="Abrir dossiê"
                    >
                      {row.ticker}
                      {isMine ? <Star size={11} className="mf-star" fill="currentColor" aria-label="Você acompanha este ativo" /> : null}
                    </button>
                    <span className="mf-sector">{row.sectorLabel || '—'}</span>
                  </span>
                  <span className="mf-col-bar">
                    <span className="mf-bar" aria-hidden="true">
                      <span className="mf-bar-fill is-ey" style={{ width: `${barWidth(row.eyPct, maxEy)}%` }} />
                    </span>
                    <strong><span className="mf-mobile-label">EY </span>{num(row.eyPct)}%</strong>
                  </span>
                  <span className="mf-col-bar">
                    <span className="mf-bar" aria-hidden="true">
                      <span className="mf-bar-fill is-roic" style={{ width: `${barWidth(row.roicPct, maxRoic)}%` }} />
                    </span>
                    <strong><span className="mf-mobile-label">ROIC </span>{num(row.roicPct)}%</strong>
                  </span>
                  <span className="mf-col-num" title="Soma das posições em EY e ROIC">
                    <span className="mf-mobile-label">Soma</span>{row.combined}
                  </span>
                  <span className="mf-col-f">
                    {ratio != null ? (
                      <span className={`mf-f is-${fScoreTone(ratio)}`} title="Piotroski: só contexto, não ordena o ranking">
                        {Math.round(ratio * 100)}% <small>({row.piotroskiScore}/{row.piotroskiPossible})</small>
                      </span>
                    ) : (
                      <span className="mf-f is-none">—</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>

          {shown.length < filtered.length ? (
            <div className="mf-more">
              <button type="button" className="mf-more-btn" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Ver mais {Math.min(PAGE_SIZE, filtered.length - shown.length)}
              </button>
              <button type="button" className="mf-more-btn" onClick={() => setVisible(filtered.length)}>
                Ver todos ({filtered.length})
              </button>
            </div>
          ) : null}
        </div>
      )}

      {ranking.disclaimer ? <p className="market-disclaimer">{ranking.disclaimer}</p> : null}
    </section>
  );
}
