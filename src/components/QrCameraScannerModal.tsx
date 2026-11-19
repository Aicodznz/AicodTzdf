import React, { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, ImageUp, X } from 'lucide-react';
import type { Language } from '../types/oilcom';

interface QrCameraScannerModalProps {
  lang: Language;
  open: boolean;
  onClose: () => void;
  onDetected: (decodedText: string) => void;
}

export function QrCameraScannerModal({
  lang,
  open,
  onClose,
  onDetected,
}: QrCameraScannerModalProps) {
  const rawId = useId().replace(/:/g, '');
  const readerElementId = `oilcom-qr-reader-${rawId}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [cameraActive, setCameraActive] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const scanner = new Html5Qrcode(readerElementId);
    scannerRef.current = scanner;
    setStatusMsg(
      lang === 'sw'
        ? 'Inawasha kamera ya kuscan QR...'
        : 'Starting QR camera scanner...'
    );

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          if (cancelled) return;
          cancelled = true;
          scanner
            .stop()
            .catch(() => {})
            .finally(() => {
              onDetected(decodedText);
              onClose();
            });
        },
        () => {
          // Ignore frame decode misses while scanning
        }
      )
      .then(() => {
        if (!cancelled) {
          setCameraActive(true);
          setStatusMsg(
            lang === 'sw'
              ? 'Elekeza kamera kwenye msimbo wa QR wa mteja.'
              : 'Point camera at the customer QR code.'
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCameraActive(false);
          setStatusMsg(
            lang === 'sw'
              ? 'Kamera haikuweza kufunguka. Ruhusu kamera au pakia picha ya QR hapa chini.'
              : 'Camera unavailable or permission denied. Upload a QR image below.'
          );
        }
      });

    return () => {
      cancelled = true;
      setCameraActive(false);
      if (scanner.isScanning) {
        scanner.stop().catch(() => {});
      }
      scanner.clear();
      scannerRef.current = null;
    };
  }, [open, readerElementId, lang, onDetected, onClose]);

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !scannerRef.current) return;
    try {
      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      const decoded = await scannerRef.current.scanFile(file, true);
      onDetected(decoded);
      onClose();
    } catch {
      setStatusMsg(
        lang === 'sw'
          ? 'Msimbo wa QR haukuonekana kwenye picha hiyo. Jaribu picha nyingine.'
          : 'No valid QR code found in that image.'
      );
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-[#F5B800]" />
            <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
              {lang === 'sw' ? 'Scan QR kwa Kamera' : 'Live Camera QR Scanner'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-emerald-950/60 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-xl overflow-hidden bg-black min-h-[240px] flex items-center justify-center relative">
          <div id={readerElementId} className="w-full" />
          {!cameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-white/80 text-xs pointer-events-none">
              <Camera className="w-8 h-8 text-[#F5B800] mb-2" />
              <span>{statusMsg}</span>
            </div>
          )}
        </div>

        {statusMsg && cameraActive && (
          <p className="text-xs text-center text-neutral-600 dark:text-neutral-300">
            {statusMsg}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileScan}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 py-2.5 px-3 rounded-xl border border-neutral-200 dark:border-emerald-900 text-xs font-semibold text-neutral-800 dark:text-neutral-200 flex items-center justify-center gap-2 cursor-pointer"
          >
            <ImageUp className="w-4 h-4 text-[#F5B800]" />
            <span>{lang === 'sw' ? 'Pakia Picha ya QR' : 'Scan QR Image'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl bg-neutral-100 dark:bg-emerald-950/60 text-xs font-semibold text-neutral-700 dark:text-neutral-300 cursor-pointer"
          >
            {lang === 'sw' ? 'Funga' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
