import React from 'react';
import { PromoBannerCard } from './PromoBannerCard';
import {
  Laptop,
  CheckCircle2,
  MoreVertical,
  Sparkles,
  Shield,
  Activity,
  Zap,
} from 'lucide-react';

export const TemplateShowcaseView: React.FC = () => {
  return (
    <div className="animate-fade-in">
      <div className="dashboard-header">
        <div className="dashboard-title-group">
          <div className="dashboard-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.75rem', background: '#ede8ff', color: '#673de6', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700, width: 'fit-content', marginBottom: '0.5rem' }}>
            <Sparkles size={14} />
            <span>Design System & Templates Preservados</span>
          </div>
          <h1 className="dashboard-title">Galeria de Componentes Hostinger</h1>
          <p className="dashboard-subtitle">
            Coleção completa de componentes, banners e tabelas preservados para utilização em novos projetos e módulos.
          </p>
        </div>
      </div>

      {/* 1. Banner Promocional Hostinger */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', color: '#1d2129' }}>
          1. Promo Banner Card
        </h3>
        <PromoBannerCard
          username="meu-novo-projeto"
          domainExtension="online"
          discountPercentage="95%"
          oldPrice="R$149,99/ano"
          currentPrice="R$4.99"
        />
      </div>

      {/* 2. Grid de Cards de Estatísticas Hostinger */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', color: '#1d2129' }}>
          2. KPI & Stat Cards
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
          <div className="dash-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div className="dash-card-icon"><Shield size={18} /></div>
              <span style={{ fontSize: '0.88rem', color: '#5f6368', fontWeight: 600 }}>Segurança Global</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1d2129' }}>100%</div>
            <div style={{ fontSize: '0.8rem', color: '#00b090', fontWeight: 600, marginTop: '0.25rem' }}>
              Proteção JWT & MFA Ativa
            </div>
          </div>

          <div className="dash-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div className="dash-card-icon"><Activity size={18} /></div>
              <span style={{ fontSize: '0.88rem', color: '#5f6368', fontWeight: 600 }}>Taxa de Entrega 2FA</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1d2129' }}>99.8%</div>
            <div style={{ fontSize: '0.8rem', color: '#5f6368', marginTop: '0.25rem' }}>
              SMS, WhatsApp & E-mail
            </div>
          </div>

          <div className="dash-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div className="dash-card-icon"><Zap size={18} /></div>
              <span style={{ fontSize: '0.88rem', color: '#5f6368', fontWeight: 600 }}>Latência Média BFF</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1d2129' }}>14ms</div>
            <div style={{ fontSize: '0.8rem', color: '#00b090', fontWeight: 600, marginTop: '0.25rem' }}>
              Alta performance Go/Echo
            </div>
          </div>
        </div>
      </div>

      {/* 3. Tabela Hostinger Modelo */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', color: '#1d2129' }}>
          3. Tabela Padrão Hostinger (Domínios & Planos)
        </h3>
        <div className="hpanel-table-card">
          <table className="hpanel-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}><input type="checkbox" style={{ accentColor: '#673de6' }} /></th>
                <th>Serviço / Domínio</th>
                <th>Status</th>
                <th>Expiração</th>
                <th>Auto-Renovação</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><input type="checkbox" style={{ accentColor: '#673de6' }} /></td>
                <td>
                  <div className="table-cell-title">
                    <Laptop size={16} className="text-muted" />
                    <span>keepguard.com.br</span>
                  </div>
                </td>
                <td>
                  <div className="status-badge-hostinger">
                    <CheckCircle2 size={16} className="status-icon" />
                    <span>Ativo</span>
                  </div>
                </td>
                <td>2028-05-04</td>
                <td>
                  <label className="switch-wrapper">
                    <input type="checkbox" className="switch-input" defaultChecked readOnly />
                    <span className="switch-slider" />
                  </label>
                </td>
                <td>
                  <div className="table-actions-group">
                    <button className="btn-table-outline">Renovar</button>
                    <button className="btn-table-outline">Gerenciar</button>
                    <button className="btn-table-icon" title="Opções"><MoreVertical size={16} /></button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
