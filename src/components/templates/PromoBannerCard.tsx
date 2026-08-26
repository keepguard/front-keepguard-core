import React from 'react';
import { Lock } from 'lucide-react';

interface PromoBannerCardProps {
  username?: string;
  domainExtension?: string;
  discountPercentage?: string;
  oldPrice?: string;
  currentPrice?: string;
  onActionClick?: () => void;
}

export const PromoBannerCard: React.FC<PromoBannerCardProps> = ({
  username = 'investbot',
  domainExtension = 'shop',
  discountPercentage = '98%',
  oldPrice = 'R$179,99/1º ano',
  currentPrice = 'R$2.99',
  onActionClick,
}) => {
  return (
    <div className="promo-card">
      <div className="promo-info">
        <div className="promo-icon-box">
          <Lock size={20} />
        </div>
        <div>
          <div className="promo-title-row">
            <Lock size={14} />
            <span>Proteja sua identidade na internet</span>
          </div>
          <div className="promo-title">
            {username}.<span className="promo-highlight">{domainExtension}</span>{' '}
            <span style={{ fontSize: '0.9rem', color: '#673de6', fontWeight: 600, cursor: 'pointer' }}>
              ou Ver mais opções
            </span>
          </div>
        </div>
      </div>

      <div className="promo-actions">
        <div className="promo-price-group">
          <span className="promo-discount-badge">Economize {discountPercentage}</span>
          <div className="promo-old-price">{oldPrice}</div>
          <div className="promo-main-price">{currentPrice}</div>
        </div>

        <button
          className="btn btn-outline btn-pill"
          style={{ borderColor: '#e3e5e8', color: '#1d2129', fontWeight: 600 }}
          onClick={onActionClick}
        >
          Compre agora
        </button>
      </div>
    </div>
  );
};
