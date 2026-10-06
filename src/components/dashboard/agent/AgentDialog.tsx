import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface AgentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** `drawer` = painel lateral à direita (Configurações). */
  variant?: 'modal' | 'drawer';
  maxWidth?: string;
  /** Enquanto houver chamada em andamento, Esc/fundo não fecham (evita perder o retorno da ordem). */
  busy?: boolean;
}

/**
 * Diálogo acessível usado no Agent Ordens. Diferente do `common/Modal`, gerencia foco:
 * foca o primeiro controle ao abrir, prende o Tab dentro do diálogo e devolve o foco
 * ao botão que abriu ao fechar — obrigatório num fluxo que envia ordem.
 */
export function AgentDialog({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  variant = 'modal',
  maxWidth,
  busy = false,
}: AgentDialogProps) {
  const titleId = useId();
  const descId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const backdropPointer = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    const focusFirst = () => {
      if (!card) return;
      const preferred = card.querySelector<HTMLElement>('[data-autofocus]');
      const first = preferred ?? card.querySelector<HTMLElement>(`.modal-body ${FOCUSABLE}`) ?? card.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? card).focus();
    };
    const raf = window.requestAnimationFrame(focusFirst);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !card) return;
      const nodes = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`modal-backdrop${variant === 'drawer' ? ' ao-drawer-backdrop' : ''}`}
      onMouseDown={(e) => {
        backdropPointer.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropPointer.current && e.target === e.currentTarget && !busy) onClose();
        backdropPointer.current = false;
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descId : undefined}
        tabIndex={-1}
        className={`modal-card${variant === 'drawer' ? ' ao-drawer' : ' animate-scale-in'}${footer ? ' has-footer' : ''}`}
        style={maxWidth ? { maxWidth } : undefined}
      >
        <div className="modal-header">
          <div>
            <h3 className="modal-title" id={titleId}>{title}</h3>
            {subtitle ? <div className="modal-subtitle" id={descId}>{subtitle}</div> : null}
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Fechar" disabled={busy}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer"><div className="modal-actions">{footer}</div></div> : null}
      </div>
    </div>
  );
}
