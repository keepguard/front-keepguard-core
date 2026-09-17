/** Linha rótulo/valor dos cartões de dossiê (FII, ETF e demais classes só preço). */
export function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="fii-dossier-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
