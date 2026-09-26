import { useId } from 'react';
import { CalendarClock } from 'lucide-react';
import type {
  AnalystDataFreshness,
  AnalystSourceFreshness,
  DataFreshnessStatus,
} from '../../services/analystService';

const SOURCE_LABEL: Record<string, string> = {
  price: 'Preço',
  fundamentals: 'Fundamentos',
  macro: 'Macro (CDI, Selic, IPCA)',
  news: 'Notícias',
};

const STATUS_COPY: Record<DataFreshnessStatus, { label: string; tone: string }> = {
  FRESH: { label: 'Em dia', tone: 'HEALTHY' },
  STALE: { label: 'Defasado', tone: 'RISKY' },
  MISSING: { label: 'Sem dado', tone: 'NEUTRAL' },
};

/** dd/MM a partir da parte de data do ISO, sem passar pelo fuso do navegador. */
function formatDay(iso?: string): string {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}` : '—';
}

function formatAge(hours?: number): string {
  if (hours == null) return '';
  if (hours < 1) return 'agora há pouco';
  if (hours < 24) return `há ${Math.round(hours)} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

function formatDateTime(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR');
}

function detailOf(source: AnalystSourceFreshness, expectedSession: string): string {
  switch (source.source) {
    case 'price':
      if (source.status === 'MISSING') return 'sem cotação neste dossiê';
      return source.status === 'STALE'
        ? `fechamento de ${formatDay(source.observedAt)} · esperado ${formatDay(expectedSession)}`
        : `fechamento de ${formatDay(source.observedAt)}`;
    case 'news':
      return source.items
        ? `${source.items} na janela do último pregão`
        : 'nenhuma na janela do último pregão';
    default:
      return source.status === 'MISSING' ? 'não coletado' : `coletado ${formatAge(source.ageHours)}`;
  }
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
          const status = STATUS_COPY[source.status] ?? STATUS_COPY.MISSING;
          return (
            <li key={source.source} className="dossier-freshness-item">
              <span className="dossier-freshness-head">
                <span className="dossier-freshness-name">{SOURCE_LABEL[source.source] || source.source}</span>
                <span className={`fii-tone-pill ${status.tone}`}>{status.label}</span>
              </span>
              <span className="dossier-freshness-detail">{detailOf(source, freshness.expectedSession)}</span>
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
