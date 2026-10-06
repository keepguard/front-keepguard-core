import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { listPortfolioTransactions, type PortfolioTransaction } from '../../services/portfolioService';

// A rota limita a página em 100 (ms-analyst-finance portfolio handler).
const PAGE_SIZE = 100;

/**
 * Exportação do histórico da antiga Carteira manual (SPEC-003 R6, Fase 1). Só aparece
 * para quem tem lançamentos; some na Fase 2, junto com o código da Carteira manual.
 */
export function ManualHistoryExport() {
  const [total, setTotal] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    listPortfolioTransactions({ limit: 1 }, ctrl.signal)
      .then((r) => setTotal(r.total))
      .catch(() => {
        if (!ctrl.signal.aborted) setTotal(0);
      });
    return () => ctrl.abort();
  }, []);

  if (!total) return null;

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const all: PortfolioTransaction[] = [];
      for (let offset = 0; offset < total; offset += PAGE_SIZE) {
        const page = await listPortfolioTransactions({ limit: PAGE_SIZE, offset });
        all.push(...page.items);
        if (page.items.length < PAGE_SIZE) break;
      }
      downloadCsv(all);
    } catch {
      setError('Não foi possível baixar o histórico agora. Tente de novo.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="trade-note">
      Você tem {total} {total === 1 ? 'lançamento' : 'lançamentos'} na antiga Carteira manual, que será desativada.{' '}
      <button type="button" className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
        <Download size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
        {exporting ? 'Baixando…' : 'Baixar meu histórico manual'}
      </button>
      {error ? <span role="alert" className="portfolio-pl-negative"> {error}</span> : null}
    </div>
  );
}

function csvField(v: string | number | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: PortfolioTransaction[]) {
  const header = ['data', 'ativo', 'lado', 'quantidade', 'preco', 'taxas', 'corretora', 'observacoes'];
  const lines = rows
    .slice()
    .sort((a, b) => a.tradedAt.localeCompare(b.tradedAt))
    .map((t) =>
      [t.tradedAt, t.ticker, t.side === 'BUY' ? 'COMPRA' : 'VENDA', t.quantity, t.price, t.fees, t.broker, t.notes]
        .map(csvField)
        .join(','),
    );
  const blob = new Blob([`${header.join(',')}\n${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `carteira-manual-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
