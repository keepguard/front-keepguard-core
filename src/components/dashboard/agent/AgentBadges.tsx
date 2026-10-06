import type { ProposalFamilia } from '../../../services/agentOrdersService';
import { FAMILIA_META } from './agentFormat';

/** Família com cor + ícone + rótulo (nunca só cor — daltonismo). */
export function FamiliaBadge({ familia, muted = false }: { familia: ProposalFamilia; muted?: boolean }) {
  const meta = FAMILIA_META[familia];
  if (!meta) return <span className="ao-familia">{familia}</span>;
  const Icon = meta.icon;
  return (
    <span className={`ao-familia is-${muted ? 'muted' : meta.tone}`}>
      <Icon size={13} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

