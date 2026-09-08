import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import { Modal } from '../common/Modal';

interface ReorderFavoritesModalProps {
  isOpen: boolean;
  onClose: () => void;
  tickers: string[];
  onSave: (newTickers: string[]) => Promise<void>;
}

export const ReorderFavoritesModal: React.FC<ReorderFavoritesModalProps> = ({
  isOpen,
  onClose,
  tickers,
  onSave,
}) => {
  const [items, setItems] = useState<string[]>(tickers);
  const [saving, setSaving] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setItems(tickers);
    }
  }, [isOpen, tickers]);

  const moveItem = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= items.length || fromIdx === toIdx) return;
    const next = [...items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setItems(next);
  };

  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragOverIdx !== idx) {
      setDragOverIdx(idx);
    }
  };

  const handleDrop = (idx: number) => {
    if (draggedIdx !== null && draggedIdx !== idx) {
      moveItem(draggedIdx, idx);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(items);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Organizar Favoritos"
      subtitle="Altere a ordem de exibição dos seus ativos favoritos."
      maxWidth="420px"
      footer={
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? 'Salvando...' : 'Salvar ordem'}
          </button>
        </div>
      }
    >
      <div className="reorder-favs-container">
        <p className="reorder-favs-hint">
          Use as setas para mover os itens para cima ou para baixo, ou arraste pela barra lateral.
        </p>
        <ul className="reorder-favs-list" role="list">
          {items.map((ticker, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === items.length - 1;
            const isDragging = draggedIdx === idx;
            const isOver = dragOverIdx === idx;

            return (
              <li
                key={ticker}
                className={`reorder-favs-item${isDragging ? ' is-dragging' : ''}${isOver ? ' is-over' : ''}`}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
              >
                <div className="reorder-favs-handle" aria-hidden="true">
                  <GripVertical size={16} />
                </div>
                <div className="reorder-favs-info">
                  <span className="reorder-favs-position">{idx + 1}</span>
                  <span className="reorder-favs-ticker">{ticker}</span>
                </div>
                <div className="reorder-favs-actions">
                  <button
                    type="button"
                    className="reorder-favs-btn"
                    onClick={() => moveItem(idx, idx - 1)}
                    disabled={isFirst || saving}
                    title="Mover para cima"
                    aria-label={`Mover ${ticker} para cima`}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="reorder-favs-btn"
                    onClick={() => moveItem(idx, idx + 1)}
                    disabled={isLast || saving}
                    title="Mover para baixo"
                    aria-label={`Mover ${ticker} para baixo`}
                  >
                    <ArrowDown size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
};
