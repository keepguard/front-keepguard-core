import React, { useState } from 'react';
import { BookOpen, Copy, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { askKnowledge, type KnowledgeAskResponse, type KnowledgeAskSource } from '../../services/knowledgeService';

const CONTEXTS = [
  { value: '', label: 'Todos' },
  { value: 'ops', label: 'ops' },
  { value: 'juridico', label: 'juridico' },
  { value: 'geral', label: 'geral' },
];

function formatClock(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMinutesAgo(minutes?: number | null): string {
  if (minutes == null || Number.isNaN(minutes)) return '';
  if (minutes < 1) return 'há menos de 1 min';
  return `há ${minutes} min`;
}

function minutesFromIso(iso?: string): number | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

function observedLabel(iso?: string, ageMinutes?: number): string {
  const clock = formatClock(iso);
  const relative = formatMinutesAgo(ageMinutes ?? minutesFromIso(iso));
  if (!iso) return 'Horário: —';
  return relative ? `Horário: ${clock} (${relative})` : `Horário: ${clock}`;
}

function freshnessLabel(briefing: KnowledgeAskResponse): string | null {
  const freshness = briefing.freshness;
  if (!freshness) return null;
  const ago = formatMinutesAgo(freshness.ageMinutes);
  if (freshness.failed) {
    return ago ? `última coleta falhou ${ago}` : 'última coleta falhou';
  }
  return ago ? `última coleta ${ago}` : 'última coleta recente';
}

function modeLabel(mode?: string): string {
  switch ((mode || '').toUpperCase()) {
    case 'HEURISTIC':
      return 'Fato';
    case 'EXTRACTIVE':
      return 'Trecho';
    case 'LLM':
      return 'Síntese';
    case 'UNKNOWN':
      return 'Sem dados';
    default:
      return mode || '—';
  }
}

function modeChipClass(mode?: string): string {
  switch ((mode || '').toUpperCase()) {
    case 'HEURISTIC':
      return 'is-fact';
    case 'EXTRACTIVE':
      return 'is-extract';
    case 'LLM':
      return 'is-llm';
    default:
      return 'is-muted';
  }
}

function shortDocumentId(id?: string): string {
  if (!id) return '—';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

async function copyDocumentId(id: string) {
  try {
    await navigator.clipboard.writeText(id);
  } catch {
    // sem clipboard, o título ainda mostra o id completo
  }
}

export const KnowledgeView: React.FC = () => {
  const { getAccessToken } = useAuth();
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<KnowledgeAskResponse | null>(null);
  const [asked, setAsked] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) {
      setError('Sessão expirada. Entre novamente.');
      return;
    }
    const trimmed = question.trim();
    if (!trimmed) {
      setError('Informe uma pergunta.');
      return;
    }
    setLoading(true);
    setError(null);
    setAsked(true);
    try {
      const data = await askKnowledge(
        { question: trimmed, context: context || undefined },
        token,
      );
      setBriefing(data);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 403) {
        setError('Acesso restrito a administradores.');
      } else {
        setError((err as Error).message || 'Não foi possível obter o briefing.');
      }
      setBriefing(null);
    } finally {
      setLoading(false);
    }
  };

  const collectionLine = briefing ? freshnessLabel(briefing) : null;

  return (
    <div className="knowledge-view">
      <form className="agent-form-panel knowledge-ask-form" onSubmit={submit}>
        <p className="agent-form-panel-intro">
          Pergunte ao conhecimento da empresa. Health e cotação saem dos fatos; o restante usa só o dossiê indexado.
        </p>
        <div className="form-group">
          <label htmlFor="knowledge-question">Pergunta</label>
          <textarea
            id="knowledge-question"
            className="form-input"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ex.: qual a saúde do ms-auth?"
          />
        </div>
        <div className="knowledge-ask-row">
          <div className="form-group">
            <label htmlFor="knowledge-context">Contexto</label>
            <select
              id="knowledge-context"
              className="form-input"
              value={context}
              onChange={(e) => setContext(e.target.value)}
            >
              {CONTEXTS.map((item) => (
                <option key={item.label} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary btn-pill" type="submit" disabled={loading}>
            <Search size={16} />
            {loading ? 'Consultando…' : 'Perguntar'}
          </button>
        </div>
      </form>

      {error && (
        <div className="agent-test-result is-error" role="alert">
          <p>{error}</p>
        </div>
      )}

      {!asked && !error && (
        <div className="knowledge-empty">
          <BookOpen size={22} />
          <p>Faça uma pergunta para ver o briefing, o horário do fato e as fontes usadas.</p>
        </div>
      )}

      {briefing && (
        <div className="hpanel-table-card knowledge-briefing">
          <div className="knowledge-briefing-header">
            <h2>Briefing</h2>
            <span className="knowledge-observed">
              {observedLabel(briefing.observedAt, briefing.ageMinutes)}
            </span>
          </div>
          {collectionLine && (
            <p className={`knowledge-freshness ${briefing.freshness?.failed ? 'is-fail' : ''}`}>
              {collectionLine}
            </p>
          )}
          <p className="knowledge-answer">{briefing.answer}</p>
          <div className="knowledge-chips">
            {briefing.convergence && <span className="knowledge-chip is-ok">convergência</span>}
            {briefing.conflict && <span className="knowledge-chip is-warn">conflito</span>}
            {briefing.stale && <span className="knowledge-chip is-warn">dado velho</span>}
            {briefing.freshness?.failed && <span className="knowledge-chip is-fail">coleta falhou</span>}
            {briefing.unknown && <span className="knowledge-chip is-muted">não sei</span>}
            <span className={`knowledge-chip ${modeChipClass(briefing.mode)}`}>
              {modeLabel(briefing.mode)}
            </span>
            <span className="knowledge-chip is-muted">{briefing.intent}</span>
          </div>
          <div className="knowledge-sources">
            <h3>Fontes</h3>
            {(!briefing.sources || briefing.sources.length === 0) ? (
              <p className="agent-history-empty">Nenhuma fonte neste briefing.</p>
            ) : (
              <div className="hpanel-table-card desktop-table-view">
                <table className="hpanel-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Tipo</th>
                      <th>documentId</th>
                      <th>Horário</th>
                      <th>Trecho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {briefing.sources.map((source, index) => (
                      <SourceRow key={`${source.documentId || source.key || 'src'}-${index}`} source={source} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {briefing.intent === 'QUOTE' && briefing.disclaimer && (
            <p className="knowledge-disclaimer">{briefing.disclaimer}</p>
          )}
        </div>
      )}
    </div>
  );
};

const SourceRow: React.FC<{ source: KnowledgeAskSource }> = ({ source }) => (
  <tr>
    <td>{source.agentName || source.key || source.kind || '—'}</td>
    <td>{source.kind}</td>
    <td>
      {source.documentId ? (
        <button
          type="button"
          className="knowledge-docid"
          title={source.documentId}
          onClick={() => copyDocumentId(source.documentId!)}
        >
          <code>{shortDocumentId(source.documentId)}</code>
          <Copy size={12} />
        </button>
      ) : '—'}
    </td>
    <td>{formatClock(source.collectedAt)}</td>
    <td>{source.excerpt || '—'}</td>
  </tr>
);
