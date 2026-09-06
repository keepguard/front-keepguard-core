import type { AnalystFormulas } from '../../services/analystService';

function pct(value: number): string {
  return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function num(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function FormulasCard({ formulas }: { formulas: AnalystFormulas }) {
  const graham = formulas.graham;
  const ey = formulas.earningsYield;
  const magic = formulas.magicFormula;
  const piotroski = formulas.piotroski;
  const ctx = formulas.context;
  if (!graham && !ey && !magic && !piotroski && !ctx) return null;
  const sectorName = ctx?.sectorLabel || ctx?.sector || '';
  return (
    <article className="market-formulas" aria-label="Fórmulas">
      <span className="market-thesis-kicker">Fórmulas</span>
      {graham?.fairPrice != null && graham.marginOfSafety != null ? (
        <p className="market-formulas-line">
          Graham: preço justo {num(graham.fairPrice)}
          {graham.price != null ? ` · cotação ${num(graham.price)}` : ''}
          {' · MOS '}
          {pct(graham.marginOfSafety)}
        </p>
      ) : graham?.gaps?.length ? (
        <p className="market-formulas-line text-muted">Graham: {graham.gaps.join(', ')}</p>
      ) : null}
      {ey ? (
        <p className="market-formulas-line">
          Earnings yield {num(ey.eyPct)}% vs CDI {num(ey.cdiPct)}% (spread {num(ey.spreadPp)} pp)
        </p>
      ) : null}
      {magic ? (
        <p className="market-formulas-line">
          Fórmula Mágica: posição {magic.rank} de {magic.universeSize}
          <span className="text-muted">
            {' '}
            · ranking do dia (Greenblatt) · bancos e utilities ficam de fora · não é recomendação
          </span>
        </p>
      ) : null}
      {piotroski ? (
        <p className="market-formulas-line">
          Piotroski F-Score {piotroski.score}/{piotroski.possible} (de {piotroski.of})
          {piotroski.partial ? ' · parcial, sem fluxo de caixa — rentabilidade/eficiência, não qualidade do lucro' : ''}
        </p>
      ) : null}
      {ctx?.concentration ? (
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
