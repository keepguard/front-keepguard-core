import React, { useRef } from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { useTheme, type ThemeMode } from '../../context/ThemeContext';

interface ThemeOption {
  value: ThemeMode;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const OPTIONS: ThemeOption[] = [
  { value: 'system', label: 'Seguir o sistema', icon: Monitor },
  { value: 'light', label: 'Tema claro', icon: Sun },
  { value: 'dark', label: 'Tema escuro', icon: Moon },
];

export const AppearanceControl: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { theme, setTheme } = useTheme();
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    let targetIndex = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      targetIndex = (index + 1) % OPTIONS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      targetIndex = (index - 1 + OPTIONS.length) % OPTIONS.length;
    }

    if (targetIndex !== -1) {
      event.preventDefault();
      const nextOption = OPTIONS[targetIndex];
      setTheme(nextOption.value);
      buttonsRef.current[targetIndex]?.focus();
    }
  };

  return (
    <div
      className={`theme-segmented-control ${className}`.trim()}
      role="radiogroup"
      aria-label="Aparência da interface"
    >
      {OPTIONS.map((option, index) => {
        const Icon = option.icon;
        const isSelected = theme === option.value;
        return (
          <button
            key={option.value}
            ref={(el) => { buttonsRef.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            className={`theme-segmented-btn ${isSelected ? 'is-active' : ''}`}
            onClick={() => setTheme(option.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            title={option.label}
            aria-label={option.label}
          >
            <Icon size={17} />
          </button>
        );
      })}
    </div>
  );
};
