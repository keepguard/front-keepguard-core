import type { AnalystMagicFormulaRanking, AnalystMagicRanked } from '../../services/analystService';

function num(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function shortSector(row: AnalystMagicRanked): string {
  const label = row.sectorLabel ?? '';
  if (!label) {
    return '—';
  }
  const sep = ' — ';
  const i = label.indexOf(sep);
  return i >= 0 ? label.slice(i + sep.length) : label;
}

export function MagicFormulaPanel({ ranking }: { ranking: AnalystMagicFormulaRanking }) {
  const top = (ranking.ranked ?? []).slice(0, 10);
  const excluded = ranking.excluded?.length ?? 0;
  const omitted = ranking.omitted?.length ?? 0;
  const concentration = (ranking.concentration ?? []).filter((row) => row.count >= 2).slice(0, 2);
  return (
    <section className="hpanel-table-card market-magic-panel" aria-label="Fórmula Mágica">
      <h2 className="market-analyze-title">Fórmula Mágica</h2>
      <p className="market-magic-blurb">
        Ranking do dia inspirado em Joel Greenblatt: entre os papéis elegíveis da carteira, quem combina
        preço atrativo com retorno sobre o capital. Bancos e utilities ficam de fora. Não é recomendação
        de compra.
      </p>
      <p className="text-muted market-magic-meta">
        {ranking.asOfDate} · {ranking.universeSize} no ranking · {excluded} excluída(s) · {omitted} omitida(s)
      </p>
      {concentration.length > 0 ? (
        <ul className="market-magic-concentration">
          {concentration.map((row) => (
            <li key={row.sector}>
              {row.label} {row.count} de {row.of}
            </li>
          ))}
        </ul>
      ) : null}
      {top.length === 0 ? (
        <p className="text-muted">Ainda não há ativos elegíveis neste dia.</p>
      ) : (
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Ticker</th>
              <th>Setor</th>
              <th>Soma</th>
              <th>EY %</th>
              <th>ROIC %</th>
            </tr>
          </thead>
          <tbody>
            {top.map((row) => (
              <tr key={row.ticker}>
                <td>{row.rank}</td>
                <td>{row.ticker}</td>
                <td>{shortSector(row)}</td>
                <td>{row.combined}</td>
                <td>{num(row.eyPct)}</td>
                <td>{num(row.roicPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="market-disclaimer">{ranking.disclaimer}</p>
    </section>
  );
}
