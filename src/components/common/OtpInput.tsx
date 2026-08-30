import React, { useRef } from 'react';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
}

export const OtpInput: React.FC<OtpInputProps> = ({
  value,
  onChange,
  length = 6,
  disabled = false,
}) => {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const digits = value.padEnd(length, '').split('').slice(0, length);

  const applyDigits = (newDigits: string[], focusIdx?: number) => {
    const combined = newDigits.join('').slice(0, length);
    onChange(combined);
    if (focusIdx !== undefined && focusIdx >= 0 && focusIdx < length) {
      inputsRef.current[focusIdx]?.focus();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const rawVal = e.target.value.replace(/\D/g, ''); // apenas dígitos numéricos
    if (!rawVal) {
      // Limpar dígito atual
      const newDigits = [...digits];
      newDigits[index] = '';
      applyDigits(newDigits);
      return;
    }

    // Se mais de 1 caractere foi inserido (ex: Autofill do iOS/Android ou colagem via teclado)
    if (rawVal.length > 1) {
      const incoming = rawVal.slice(0, length);
      const newDigits = [...digits];
      const startIdx = incoming.length >= length ? 0 : index;
      for (let i = 0; i < incoming.length && startIdx + i < length; i++) {
        newDigits[startIdx + i] = incoming[i];
      }
      const nextFocus = Math.min(startIdx + incoming.length, length - 1);
      applyDigits(newDigits, nextFocus);
      return;
    }

    // Apenas 1 dígito digitado
    const newDigits = [...digits];
    newDigits[index] = rawVal;
    const nextFocus = index < length - 1 ? index + 1 : index;
    applyDigits(newDigits, nextFocus);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, index: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '');
    if (pasteData) {
      const incoming = pasteData.slice(0, length);
      const newDigits = [...digits];
      const startIdx = incoming.length >= length ? 0 : index;
      for (let i = 0; i < incoming.length && startIdx + i < length; i++) {
        newDigits[startIdx + i] = incoming[i];
      }
      const nextFocus = Math.min(startIdx + incoming.length, length - 1);
      applyDigits(newDigits, nextFocus);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <div className="otp-container">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={el => {
            inputsRef.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          value={digits[index] || ''}
          onChange={e => handleChange(e, index)}
          onKeyDown={e => handleKeyDown(e, index)}
          onPaste={e => handlePaste(e, index)}
          onFocus={handleFocus}
          disabled={disabled}
          className="otp-digit"
          autoFocus={index === 0}
          aria-label={`Dígito ${index + 1} do código de verificação`}
        />
      ))}
    </div>
  );
};
