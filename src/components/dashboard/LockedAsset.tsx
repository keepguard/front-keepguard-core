import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PATHS } from '../../navigation/routes';

/** Nome de um ativo fora do plano. O ticker real nunca chega ao navegador: o BFF manda um apelido opaco. */
export function LockedTicker({ label = 'Ativo bloqueado' }: { label?: string }) {
  return (
    <span className="locked-ticker" title="Este ativo não faz parte do seu plano">
      <Lock size={12} aria-hidden="true" />
      {label}
    </span>
  );
}

/** Texto genérico que só ocupa o lugar do dado real (desfoque em cima de texto fixo, nunca de dado). */
export function LockedPlaceholder({ children = '•••••' }: { children?: string }) {
  return <span className="locked-blur" aria-hidden="true">{children}</span>;
}

/** Aviso curto que explica a vitrine e leva à tela de planos. */
export function LockedNotice({ text }: { text: string }) {
  return (
    <p className="locked-notice" role="note">
      <Lock size={14} aria-hidden="true" />
      <span>{text}</span>
      <Link to={PATHS.billing} className="locked-cta">Ver planos</Link>
    </p>
  );
}
