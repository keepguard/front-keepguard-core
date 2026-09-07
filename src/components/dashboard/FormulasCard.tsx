import { Link } from 'react-router-dom';
import type { AnalystFormulas } from '../../services/analystService';
import { MAGIC_FORMULA_MIN_UNIVERSE } from '../../services/analystService';

function pct(value: number): string {
  return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function num(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function magicReading(rank: number, universeSize: number): string {
  if (universeSize <= 0) return '';
  const ratio = rank / universeSize;
  if (rank <= 10 || ratio <= 0.2) return 'perto do topo do ranking do dia';
  if (ratio >= 0.7) return 'longe do topo do ranking do dia';
  return 'no meio do ranking do dia';
}

type FormulasCardProps = {
  formulas: AnalystFormulas;
  /** Quando definido, oferece atalho para o ranking completo (página Analisar). */
  rankingLinkTo?: string;
};

export function FormulasCard({ formulas, rankingLinkTo }: FormulasCardProps) {
  const graham = formulas.graham;
  const ey = formulas.earningsYield;
  const magic = formulas.magicFormula;
  const piotroski = formulas.piotroski;
  const ctx = formulas.context;
  if (!graham && !ey && !magic && !piotroski && !ctx) return null;
  const sectorName = ctx?.sectorLabel || ctx?.sector || '';
  const magicSignificant =
    magic != null && (magic.universeSize ?? 0) >= MAGIC_FORMULA_MIN_UNIVERSE;
  const showConcentration = magicSignificant && ctx?.concentration != null;
  const magicHint =
    magicSignificant && magic ? magicReading(magic.rank, magic.universeSize) : '';

  return (
    <article className="market-formulas" aria-label="Fórmulas">
      <span className="market-thesis-kicker">Fórmulas</span>

      <div className="market-formulas-group" aria-label="Preço">
        {graham?.fairPrice != null && graham.marginOfSafety != null ? (
          <p className="market-formulas-line">
            <span className="market-formulas-label">Graham</span>
            {' '}preço justo {num(graham.fairPrice)}
            {graham.price != null ? ` · cotação ${num(graham.price)}` : ''}
            {' · MOS '}
            <strong className="market-formulas-emphasis">{pct(graham.marginOfSafety)}</strong>
          </p>
        ) : graham?.gaps?.length ? (
          <p className="market-formulas-line text-muted">
            <span className="market-formulas-label">Graham</span> {graham.gaps.join(', ')}
          </p>
        ) : null}
        {ey ? (
          <p className="market-formulas-line">
            <span className="market-formulas-label">Earnings yield</span>
            {' '}
            <strong className="market-formulas-emphasis">{num(ey.eyPct)}%</strong>
            {' '}vs CDI {num(ey.cdiPct)}%
            <span className="text-muted"> (spread {num(ey.spreadPp)} pp)</span>
          </p>
        ) : null}
      </div>

      {(magic || piotroski) ? (
        <div className="market-formulas-group" aria-label="Contexto de ranking">
          {magicSignificant && magic ? (
            <div className="market-formulas-magic">
              <p className="market-formulas-line market-formulas-magic-rank">
                <span className="market-formulas-label">Fórmula Mágica</span>
                {' '}
                <strong className="market-formulas-rank">
                  {magic.rank}
                  <span className="market-formulas-rank-of"> / {magic.universeSize}</span>
                </strong>
              </p>
              {magicHint ? (
                <p className="market-formulas-reading">{magicHint}</p>
              ) : null}
              <p className="market-formulas-line text-muted market-formulas-disclaimer">
                Ranking do dia (Greenblatt) · bancos e utilities ficam de fora · não é recomendação
                {rankingLinkTo ? (
                  <>
                    {' · '}
                    <Link to={rankingLinkTo} className="market-formulas-link">
                      Ver ranking do dia
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
          ) : magic ? (
            <p className="market-formulas-line text-muted">
              <span className="market-formulas-label">Fórmula Mágica</span>
              {' '}universo insuficiente para posição significativa ({magic.universeSize}{' '}
              ativo{magic.universeSize === 1 ? '' : 's'}; mínimo {MAGIC_FORMULA_MIN_UNIVERSE})
            </p>
          ) : null}
          {piotroski ? (
            <p className="market-formulas-line">
              <span className="market-formulas-label">Piotroski F-Score</span>
              {' '}
              <strong className="market-formulas-emphasis">
                {piotroski.score}/{piotroski.possible}
              </strong>
              <span className="text-muted"> (de {piotroski.of})</span>
              {piotroski.partial
                ? ' · parcial, sem fluxo de caixa — rentabilidade/eficiência, não qualidade do lucro'
                : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      {showConcentration && ctx?.concentration ? (
        <p className="market-formulas-line">
          {ctx.concentration.label} {ctx.concentration.count} de {ctx.concentration.of}
          <span className="text-muted"> no topo da Fórmula Mágica</span>
        </p>
      ) : null}
      {ctx?.bank ? (
        <p className="market-formulas-line text-muted">
          Banco: liquidez e Graham/VPA não se leem como indústria.
        </p>
      ) : null}
      {ctx?.cyclical ? (
        <p className="market-formulas-line text-muted">
          Setor cíclico{sectorName ? ` (${sectorName})` : ''}: contração de receita/lucro não é, por si só, deterioração estrutural.
        </p>
      ) : null}
    </article>
  );
}
