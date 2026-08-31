import React from 'react';
import { CheckCircle, FileText } from 'lucide-react';

export const LgpdDocumentsCard: React.FC = () => {
  return (
    <section className="dash-card" aria-labelledby="lgpd-documents-title">
      <div className="dash-card-header">
        <div className="dash-card-icon"><FileText size={18} /></div>
        <h3 id="lgpd-documents-title">Documentos & Consentimentos LGPD</h3>
      </div>
      <div className="dash-card-body">
        <div className="refresh-status-box">
          <div className="refresh-status-icon">
            <CheckCircle size={22} className="text-success" />
          </div>
          <div>
            <strong>Consentimentos Válidos</strong>
            <p>Você concordou com os Termos de Uso e Política de Privacidade durante o cadastro.</p>
          </div>
        </div>

        <div className="info-row">
          <span className="info-label">Termos de Uso</span>
          <span className="badge-role" style={{ background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' }}>Aceito</span>
        </div>
        <div className="info-row">
          <span className="info-label">Política de Privacidade</span>
          <span className="badge-role" style={{ background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' }}>Aceito</span>
        </div>
      </div>
    </section>
  );
};
