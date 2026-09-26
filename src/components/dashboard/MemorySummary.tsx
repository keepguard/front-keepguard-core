import { SOURCE_LABEL, METRIC_LABEL, VERDICT_LABEL, thesisDisplayLabel } from './marketLabels';
import { formatCompactBrl, formatMoney, formatPct, formatRatio } from './dossierFormat';
import { NarrativeText } from './NarrativeText';

/** Linha do resumo derivado por template: "- metric (VERDICT): valor — fonte origem". */
const FACT_LINE = /^-\s+(\S+)\s+\(([A-Z_]+)\):\s+(.+?)\s+—\s+fonte\s+(\S+)\s*$/;

interface MemoryFact {
  metric: string;
  verdict: string;
  value: string;
  source: string;
}

function parseFacts(summary: string): { intro: string; facts: MemoryFact[] } {
  const facts: MemoryFact[] = [];
  const introLines: string[] = [];
  for (const raw of summary.split('\n')) {
    const line = raw.trim();
    const match = FACT_LINE.exec(line);
    if (match) {
      facts.push({ metric: match[1], verdict: match[2], value: match[3], source: match[4] });
    } else if (line && facts.length === 0) {
      introLines.push(line);
    }
  }
  const intro = introLines
    .join(' ')
    .replace(/\s*\(sem modelo de linguagem\)/i, '')
    .replace('Resumo derivado dos fatos de suporte', 'Resumo dos fatos de suporte');
  return { intro, facts };
}

function formatFactValue(metric: string, raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return '';
  switch (metric) {
    case 'price':
      return formatMoney(n);
    case 'fii_pvp':
      return formatRatio(n);
    case 'fii_dividend_yield':
    case 'fii_cash_reserve':
      return formatPct(n);
    case 'fii_daily_liquidity':
      return `${formatCompactBrl(n)}/dia`;
    default:
      return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }
}

export interface MemorySummaryProps {
  revision: number;
  summary: string;
}

/**
 * Memória derivada do ativo. O resumo por template vira lista legível (nome da métrica, veredito,
 * valor e fonte); um resumo escrito pelo modelo é markdown e passa pelo mesmo renderizador da narrativa.
 */
export function MemorySummary({ revision, summary }: MemorySummaryProps) {
  const { intro, facts } = parseFacts(summary);
  return (
    <div className="text-muted market-memory">
      <p className="market-memory-title">Memória derivada · revisão {revision}</p>
      {facts.length === 0 ? (
        <NarrativeText text={summary} />
      ) : (
        <>
          {intro ? <p>{intro}</p> : null}
          <ul className="market-memory-list">
            {facts.map((fact) => {
              const isThesis = fact.metric === 'thesis';
              const value = formatFactValue(fact.metric, fact.value);
              return (
                <li key={`${fact.metric}-${fact.source}`}>
                  <span className="market-memory-metric">{isThesis ? 'Tese' : METRIC_LABEL[fact.metric] || fact.metric}</span>
                  <span className={`market-verdict ${fact.verdict}`}>
                    {isThesis ? thesisDisplayLabel(fact.verdict) : VERDICT_LABEL[fact.verdict] || fact.verdict}
                  </span>
                  {value ? <strong>{value}</strong> : null}
                  <span>· {SOURCE_LABEL[fact.source] || fact.source}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
