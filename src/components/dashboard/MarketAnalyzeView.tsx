import React, { useState } from 'react';
import { analyzeTicker, type AnalystAnalysis } from '../../services/analystService';

const DISCLAIMER = 'Análise, não recomendação de investimento.';

const VERDICT_LABEL: Record<string, string> = {
  CHEAP: 'Barato',
  FAIR: 'Justo',
  EXPENSIVE: 'Caro',
  HEALTHY: 'Saudável',
  RISKY: 'Arriscado',
  NEUTRAL: 'Neutro',
  MISSING: 'Indisponível',
};

const METRIC_LABEL: Record<string, string> = {
  pl: 'P/L',
  dy_pct: 'Dividend yield',
  dividaliquida_ebitda: 'Dívida/EBITDA',
  roe_pct: 'ROE',
};

export const MarketAnalyzeView: React.FC = () => {
  const [ticker, setTicker] = useState('PETR4');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<AnalystAnalysis | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setAnalysis(null);
    setLoading(true);
    try {
      setAnalysis(await analyzeTicker(ticker.trim().toUpperCase()));
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 400) {
        setError('Ticker inválido. Use 4 a 6 caracteres (ex.: PETR4).');
      } else if (status === 404) {
        setError('Ainda não há fatos deste ticker nesta organização. Confira os agents de coleta.');
      } else if (status === 502 || status === 503 || status === 504) {
        setError('Não foi possível falar com a memória agora. Tente de novo.');
      } else {
        setError(err instanceof Error ? err.message : 'Falha ao analisar');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="market-analyze">
      <div className="dash-card">
        <p className="dashboard-subtitle" style={{ marginBottom: '1.25rem' }}>
          Panorama de um ticker com sinais calculados e narrativa fundamentada. Não é recomendação de investimento.
        </p>
        <form className="market-analyze-form" onSubmit={onSubmit}>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
            <label htmlFor="market-ticker">Ticker</label>
            <input
              id="market-ticker"
              name="ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              maxLength={6}
              required
              aria-describedby="market-ticker-help"
            />
            <span id="market-ticker-help" className="sr-only">Informe o código do ativo, por exemplo PETR4</span>
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading || ticker.trim().length < 4}>
            {loading ? 'Analisando…' : 'Analisar'}
          </button>
        </form>
        {!loading && !analysis && !error ? (
          <p className="text-muted" style={{ marginTop: '1rem', marginBottom: 0 }}>
            Informe um ticker com coleta nesta organização para ver os sinais.
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="agent-test-result is-error" role="alert" style={{ marginTop: '1rem' }}>
          <p>{error}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="market-signals" aria-busy="true" aria-live="polite">
          <div className="market-skeleton" />
          <div className="market-skeleton" />
          <div className="market-skeleton" />
          <div className="market-skeleton" />
        </div>
      ) : null}

      {analysis ? (
        <div className="dash-card" style={{ marginTop: '1.25rem' }}>
          <h2 className="market-analyze-title">{analysis.displayName || analysis.ticker} · {analysis.ticker}</h2>
          <div className="market-signals">
            {analysis.signals.map((signal) => (
              <article className="market-signal" key={signal.metric}>
                <span className={`market-verdict ${signal.verdict}`}>
                  {VERDICT_LABEL[signal.verdict] || signal.verdict}
                </span>
                <h3>{METRIC_LABEL[signal.metric] || signal.metric}</h3>
                <p>{signal.explanation}</p>
                {signal.grounding?.dataSource ? (
                  <p className="text-muted">Fonte: {signal.grounding.dataSource}</p>
                ) : null}
              </article>
            ))}
          </div>
          {analysis.gaps.length > 0 ? (
            <p className="text-muted">
              Lacunas: {analysis.gaps.map((g) => `${g.metric} (${g.reason})`).join(', ')}
            </p>
          ) : null}
          <div className="market-narrative" aria-live="polite">{analysis.narrative}</div>
          {analysis.sources.length > 0 ? (
            <p className="text-muted">
              Fontes: {analysis.sources.map((s) => s.dataSource).join(', ')}
            </p>
          ) : null}
          <p className="market-disclaimer">{analysis.disclaimer || DISCLAIMER}</p>
        </div>
      ) : (
        <p className="market-disclaimer">{DISCLAIMER}</p>
      )}
    </div>
  );
};
