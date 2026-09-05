import React from 'react';
import { Sliders } from 'lucide-react';
import { AppearanceControl } from '../common/AppearanceControl';

export const PreferencesCard: React.FC = () => {
  return (
    <section className="dash-card" style={{ marginBottom: '1.5rem' }} aria-labelledby="preferences-card-title">
      <div className="dash-card-header">
        <div className="dash-card-icon">
          <Sliders size={18} />
        </div>
        <h3 id="preferences-card-title">Preferências</h3>
      </div>
      <div className="account-setting-row" style={{ alignItems: 'center' }}>
        <div>
          <p className="account-setting-title">Aparência</p>
          <p className="account-setting-hint">
            Alterne entre o tema claro, escuro ou sincronizado com o sistema operacional.
          </p>
        </div>
        <AppearanceControl />
      </div>
    </section>
  );
};
