import { useId } from 'react';
import { CalendarClock } from 'lucide-react';
import type { AnalystDataFreshness } from '../../services/analystService';
import { FRESHNESS_SOURCE_LABEL, FRESHNESS_STATUS_COPY, freshnessDetail } from '../../utils/dataFreshnessText';

function formatDateTime(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR');
}

export interface DataFreshnessBarProps {
  freshness?: AnalystDataFreshness | null;
}

/**
 * Ficha de fontes: com que dado, de quando, este dossiê foi feito. Notícia sem itens não é
 * problema (o dossiê sai igual); preço ou fundamento defasado é o que merece atenção.
 */
export function DataFreshnessBar({ freshness }: DataFreshnessBarProps) {
  const titleId = useId();

  if (!freshness) {
    return (
      <p className="text-muted dossier-freshness-note" role="status">
        Ficha de fontes disponível apenas em análises feitas depois da sua criação.
      </p>
    );
  }

  const stale = freshness.sources.filter((s) => s.status === 'STALE' && s.source !== 'news');
  const analyzedAt = formatDateTime(freshness.asOf);

  return (
    <section className="dossier-freshness" aria-labelledby={titleId}>
      <h3 id={titleId} className="dossier-freshness-title">
        <CalendarClock size={14} aria-hidden="true" />
        Fontes deste dossiê
      </h3>
      <ul className="dossier-freshness-list">
        {freshness.sources.map((source) => {
          const status = FRESHNESS_STATUS_COPY[source.status] ?? FRESHNESS_STATUS_COPY.MISSING;
          return (
            <li key={source.source} className="dossier-freshness-item">
              <span className="dossier-freshness-head">
                <span className="dossier-freshness-name">{FRESHNESS_SOURCE_LABEL[source.source] || source.source}</span>
                <span className={`fii-tone-pill ${status.tone}`}>{status.label}</span>
              </span>
              <span className="dossier-freshness-detail">{freshnessDetail(source, freshness.expectedSession)}</span>
            </li>
          );
        })}
      </ul>
      {stale.length > 0 ? (
        <p className="dossier-freshness-note" role="status">
          Há fonte defasada: este dossiê pode não refletir o pregão mais recente.
        </p>
      ) : null}
      {analyzedAt ? <p className="text-muted dossier-freshness-note">Análise feita em {analyzedAt}.</p> : null}
    </section>
  );
}
