import React, { useEffect, useState } from 'react';
import { Download, Share, Smartphone, WifiOff, X } from 'lucide-react';
import type { Language } from '../types/oilcom';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

export function PWAInstallButton({
  lang,
  variant = 'compact',
}: {
  lang: Language;
  variant?: 'compact' | 'card';
}) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (!isInstallable && !isIOS) {
    return null;
  }

  return (
    <>
      {variant === 'card' ? (
        <button
          type="button"
          onClick={() => (isInstallable ? void install() : setShowIOSGuide(true))}
          className="w-full p-4 rounded-2xl bg-[#0B2A6F] text-white border border-[#F5B800]/50 flex items-center justify-between gap-3 cursor-pointer hover:bg-[#0c3723] transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#F5B800] text-[#0B2A6F] flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="text-left min-w-0">
              <p className="font-display font-bold text-sm truncate">
                {lang === 'sw' ? 'Weka App Kwenye Simu' : 'Install OILCOM App'}
              </p>
              <p className="text-xs text-blue-100/80 truncate">
                {lang === 'sw'
                  ? 'Fungua haraka kutoka Home Screen kama programu halisi'
                  : 'Launch directly from your Home Screen in standalone mode'}
              </p>
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-xl bg-[#F5B800] text-[#0B2A6F] text-xs font-bold shrink-0">
            {lang === 'sw' ? 'Weka' : 'Install'}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => (isInstallable ? void install() : setShowIOSGuide(true))}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F5B800] text-[#0B2A6F] text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
          title={lang === 'sw' ? 'Weka App Kwenye Simu' : 'Install App'}
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {lang === 'sw' ? 'Weka App' : 'Install'}
          </span>
        </button>
      )}

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <Share className="w-4 h-4 text-[#F5B800]" />
                {lang === 'sw'
                  ? 'Weka Kwenye iPhone / iPad'
                  : 'Install on iPhone / iPad'}
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 text-neutral-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="text-xs text-neutral-700 dark:text-neutral-300 space-y-2 list-decimal list-inside">
              <li>
                {lang === 'sw'
                  ? 'Bonyeza kitufe cha Share kwenye kivinjari cha Safari.'
                  : 'Tap the Share button in the Safari toolbar.'}
              </li>
              <li>
                {lang === 'sw'
                  ? 'Shuka chini kisha uchague "Add to Home Screen".'
                  : 'Scroll down and tap "Add to Home Screen".'}
              </li>
              <li>
                {lang === 'sw'
                  ? 'Thibitisha kwa kubonyeza "Add" ili kupata ikoni ya OILCOM.'
                  : 'Tap "Add" to place OILCOM Super App on your home screen.'}
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-[#0B2A6F] text-white text-xs font-semibold cursor-pointer"
            >
              {lang === 'sw' ? 'Sawa, Nimeelewa' : 'Got It'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}

export function OfflineIndicator({ lang }: { lang: Language }) {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:w-auto z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        {lang === 'sw'
          ? 'Huna Mtandao (Offline) — Data zilizohifadhiwa zinatumika.'
          : 'Offline Mode — Cached data is being displayed.'}
      </span>
    </div>
  );
}
