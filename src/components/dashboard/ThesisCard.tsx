import type { AnalystThesis } from '../../services/analystService';
import { AXIS_LABEL, thesisDisplayLabel, thesisTone } from './marketLabels';

/** Card publicado após histograma dos 94 tickers e calibração m4a-1 confirmada. */
export const THESIS_CARD_PUBLISHED = true;

export function ThesisCard({ thesis }: { thesis: AnalystThesis }) {
  const tone = thesisTone(thesis.code);
  return (
    <article className={`market-thesis market-thesis-${tone}`} aria-label="Tese de investimento">
      <span className="market-thesis-kicker">Tese</span>
      <h3 className="market-thesis-title">{thesisDisplayLabel(thesis.code)}</h3>
      <p className="market-thesis-axes">
        Qualidade {AXIS_LABEL[thesis.quality.level] || thesis.quality.level}
        {' · '}
        Preço {AXIS_LABEL[thesis.price.level] || thesis.price.level}
        {' · '}
        Saúde {AXIS_LABEL[thesis.health.level] || thesis.health.level}
      </p>
      <p className="text-muted market-thesis-note">Análise, não recomendação de investimento.</p>
    </article>
  );
}
