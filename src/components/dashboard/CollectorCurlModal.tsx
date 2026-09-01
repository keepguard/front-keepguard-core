import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Modal } from '../common/Modal';
import type { CollectorCurlBlock } from '../../utils/collectorCurl';

interface CollectorCurlModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  blocks: CollectorCurlBlock[];
}

export const CollectorCurlModal: React.FC<CollectorCurlModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  blocks,
}) => {
  const [selectedId, setSelectedId] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const safeBlocks = useMemo(() => blocks.filter((block) => block.command.trim()), [blocks]);

  useEffect(() => {
    if (!isOpen) {
      setCopiedId(null);
      return;
    }
    setSelectedId(safeBlocks[0]?.id || '');
  }, [isOpen, safeBlocks]);

  const active = safeBlocks.find((block) => block.id === selectedId) || safeBlocks[0];

  const handleCopy = async () => {
    if (!active?.command) return;
    try {
      await navigator.clipboard.writeText(active.command);
      setCopiedId(active.id);
      window.setTimeout(() => setCopiedId((prev) => (prev === active.id ? null : prev)), 2000);
    } catch {
      setCopiedId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      maxWidth="720px"
      footer={(
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fechar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleCopy()}
            disabled={!active?.command}
          >
            {copiedId === active?.id ? <Check size={15} /> : <Copy size={15} />}
            <span>{copiedId === active?.id ? 'Copiado!' : 'Copiar CURL'}</span>
          </button>
        </div>
      )}
    >
      {safeBlocks.length === 0 ? (
        <p className="agent-form-panel-intro">
          Configure a URL (ou lista de URLs) antes de gerar o CURL.
        </p>
      ) : (
        <div className="collector-curl-modal">
          {safeBlocks.length > 1 ? (
            <div className="form-group">
              <label htmlFor="collector-curl-variant">Tipo de CURL</label>
              <select
                id="collector-curl-variant"
                className="form-input"
                value={active?.id || ''}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {safeBlocks.map((block) => (
                  <option key={block.id} value={block.id}>{block.label}</option>
                ))}
              </select>
            </div>
          ) : null}

          {active ? (
            <>
              <p className="agent-form-panel-intro">{active.description}</p>
              {active.hasSecrets ? (
                <p className="collector-curl-hint" role="note">
                  Credenciais aparecem como placeholders. O IP e o rate limit da sua máquina podem diferir do collector em produção.
                </p>
              ) : (
                <p className="collector-curl-hint" role="note">
                  Executar na sua máquina pode responder diferente do collector (IP, rate limit, Cloudflare).
                </p>
              )}
              <div className="token-code-box collector-curl-box" aria-live="polite">
                <code>{active.command}</code>
              </div>
            </>
          ) : null}
        </div>
      )}
    </Modal>
  );
};
