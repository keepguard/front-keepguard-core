import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export const PixQr: React.FC<{ payload: string }> = ({ payload }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !payload) return;
    void QRCode.toCanvas(canvas, payload, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#111111', light: '#ffffff' },
    });
  }, [payload]);

  return <canvas ref={canvasRef} className="billing-pix-qr" aria-label="QR Code PIX" />;
};
