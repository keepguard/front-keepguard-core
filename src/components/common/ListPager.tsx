import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type ListPagerProps = {
  loading: boolean;
  refreshing?: boolean;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  leading?: React.ReactNode;
};

export const ListPager: React.FC<ListPagerProps> = ({
  loading,
  refreshing = false,
  page,
  totalPages,
  onPrev,
  onNext,
  leading,
}) => (
  <div className="audits-pager">
    <div className="audits-pager-leading">{leading}</div>
    <div className="audits-pager-actions">
      <button
        type="button"
        className="btn btn-outline btn-pill btn-icon-pager"
        disabled={loading || refreshing || page <= 0}
        onClick={onPrev}
        aria-label="Página anterior"
        title="Página anterior"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        type="button"
        className="btn btn-outline btn-pill btn-icon-pager"
        disabled={loading || refreshing || page >= totalPages - 1}
        onClick={onNext}
        aria-label="Próxima página"
        title="Próxima página"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  </div>
);
