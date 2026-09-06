import type { AnalystMagicFormulaRanking } from '../../services/analystService';

function num(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function MagicFormulaPanel({ ranking }: { ranking: AnalystMagicFormulaRanking }) {
  const top = (ranking.ranked ?? []).slice(0, 10);
  const excluded = ranking.excluded?.length ?? 0;
  const omitted = ranking.omitted?.length ?? 0;
  return (
    <section className="hpanel-table-card market-magic-panel" aria-label="Fórmula Mágica">
      <h2 className="market-analyze-title">Fórmula Mágica</h2>
      <p className="text-muted market-magic-meta">
        {ranking.asOfDate} · {ranking.universeSize} no ranking · {excluded} excluída(s) · {omitted} omitida(s)
      </p>
      {top.length === 0 ? (
        <p className="text-muted">Ainda não há ativos elegíveis neste dia.</p>
      ) : (
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Ticker</th>
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
