import type { AnalystMagicFormulaRanking, AnalystMagicRanked } from '../../services/analystService';
import { MAGIC_FORMULA_MIN_UNIVERSE } from '../../services/analystService';

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
  const universe = ranking.universeSize ?? 0;
  const significant = universe >= MAGIC_FORMULA_MIN_UNIVERSE;
  const top = significant ? (ranking.ranked ?? []).slice(0, 10) : [];
  const excluded = ranking.excluded?.length ?? 0;
  const omitted = ranking.omitted?.length ?? 0;
  const concentration = significant
    ? (ranking.concentration ?? []).filter((row) => row.count >= 2).slice(0, 2)
    : [];
  const meta = `${ranking.asOfDate} · ${universe} no ranking · ${excluded} excluída(s) · ${omitted} omitida(s)`;

  return (
    <section className="market-magic" aria-label="Fórmula Mágica">
      <div className="hpanel-table-card desktop-table-view market-table-card market-magic-panel">
        <header className="market-table-header">
          <h2 className="market-table-title">Fórmula Mágica</h2>
          <p className="text-muted market-table-subtitle">{meta}</p>
        </header>

        <div className="market-magic-intro">
          <p className="market-magic-blurb">
            Ranking do dia inspirado em Joel Greenblatt: entre os papéis elegíveis da carteira, quem
            combina preço atrativo com retorno sobre o capital. Bancos e utilities ficam de fora. Não é
            recomendação de compra.
          </p>
          {!significant ? (
            <p className="market-magic-insufficient" role="status">
              Universo insuficiente para ranking significativo: {universe} ativo
              {universe === 1 ? '' : 's'} (mínimo {MAGIC_FORMULA_MIN_UNIVERSE}). Concentração setorial
              também fica oculta — amplie a watchlist para interpretar posição e concentração.
            </p>
          ) : null}
          {significant && concentration.length > 0 ? (
            <ul className="market-magic-concentration">
              {concentration.map((row) => (
                <li key={row.sector}>
                  {row.label} {row.count} de {row.of}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {!significant ? null : top.length === 0 ? (
          <p className="market-magic-empty text-muted">Ainda não há ativos elegíveis neste dia.</p>
        ) : (
          <div className="market-magic-table-wrap">
            <table className="hpanel-table market-magic-table">
              <thead>
                <tr>
                  <th className="market-magic-col-rank" scope="col">#</th>
                  <th className="market-magic-col-ticker" scope="col">Ticker</th>
                  <th className="market-magic-col-sector" scope="col">Setor</th>
                  <th className="market-magic-col-num" scope="col">Soma</th>
                  <th className="market-magic-col-num" scope="col">EY %</th>
                  <th className="market-magic-col-num" scope="col">ROIC %</th>
                </tr>
              </thead>
              <tbody>
                {top.map((row) => (
                  <tr key={row.ticker}>
                    <td className="market-magic-col-rank">{row.rank}</td>
                    <td className="market-magic-col-ticker">
                      <span className="table-cell-title">{row.ticker}</span>
                    </td>
                    <td className="market-magic-col-sector">
                      <span className="table-cell-muted">{shortSector(row)}</span>
                    </td>
                    <td className="market-magic-col-num">{row.combined}</td>
                    <td className="market-magic-col-num">{num(row.eyPct)}</td>
                    <td className="market-magic-col-num">{num(row.roicPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ranking.disclaimer ? (
          <p className="market-disclaimer market-magic-footer">{ranking.disclaimer}</p>
        ) : null}
      </div>

      <div className="mobile-cards-container market-magic-mobile">
        <header className="market-mobile-header">
          <h2 className="market-section-title">Fórmula Mágica</h2>
          <p className="text-muted market-table-subtitle">{meta}</p>
        </header>
        <p className="market-magic-blurb">
          Ranking do dia (Greenblatt). Bancos e utilities ficam de fora. Não é recomendação de compra.
        </p>
        {!significant ? (
          <p className="market-magic-insufficient" role="status">
            Universo insuficiente: {universe} ativo{universe === 1 ? '' : 's'} (mínimo{' '}
            {MAGIC_FORMULA_MIN_UNIVERSE}).
          </p>
        ) : null}
        {significant && concentration.length > 0 ? (
          <ul className="market-magic-concentration">
            {concentration.map((row) => (
              <li key={row.sector}>
                {row.label} {row.count} de {row.of}
              </li>
            ))}
          </ul>
        ) : null}
        {!significant ? null : top.length === 0 ? (
          <p className="text-muted">Ainda não há ativos elegíveis neste dia.</p>
        ) : (
          top.map((row) => (
            <div className="mobile-domain-card" key={row.ticker}>
              <div className="mobile-card-top">
                <span className="mobile-domain-name">
                  #{row.rank} · {row.ticker}
                </span>
                <span className="badge-role">Soma {row.combined}</span>
              </div>
              <div className="mobile-card-subinfo">{shortSector(row)}</div>
              <div className="mobile-card-meta">
                EY {num(row.eyPct)}% · ROIC {num(row.roicPct)}%
              </div>
            </div>
          ))
        )}
        {ranking.disclaimer ? (
          <p className="market-disclaimer">{ranking.disclaimer}</p>
        ) : null}
      </div>
    </section>
  );
}
