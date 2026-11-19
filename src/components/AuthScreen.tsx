import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { Eye, EyeOff, Globe, Lock, Mail, Moon, Sun, User } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';
import { t } from '../i18n/translations';
import type { Language, ThemeMode } from '../types/oilcom';
import { OilcomCamelMark } from './OilcomBrand';

interface AuthScreenProps {
  lang: Language;
  setLang: (lang: Language) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

export function AuthScreen({ lang, setLang, theme, setTheme }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setErrorMsg(
          lang === 'sw'
            ? 'Dirisha la kuingia lilifungwa. Tafadhali jaribu tena.'
            : 'Sign-in popup was closed. Please try again.'
        );
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : 'Google Sign-In failed.'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (!email.trim()) {
      setErrorMsg(lang === 'sw' ? 'Tafadhali weka barua pepe.' : 'Email is required.');
      return;
    }

    if (mode === 'forgot') {
      setBusy(true);
      try {
        await sendPasswordResetEmail(auth, email.trim());
        setInfoMsg(
          lang === 'sw'
            ? 'Kiungo cha kurejesha nywila kimetumwa kwenye barua pepe yako.'
            : 'Password reset link has been sent to your email.'
        );
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Reset failed.');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (password.length < 6) {
      setErrorMsg(
        lang === 'sw'
          ? 'Nywila lazima iwe na angalau herufi 6.'
          : 'Password must be at least 6 characters.'
      );
      return;
    }

    if (mode === 'register') {
      if (!fullName.trim()) {
        setErrorMsg(lang === 'sw' ? 'Jaza jina kamili.' : 'Full name is required.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg(
          lang === 'sw' ? 'Nywila hazifanani.' : 'Passwords do not match.'
        );
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: fullName.trim() });
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          lang === 'sw'
            ? 'Kuingia kwa Barua Pepe/Nywila hakujawashwa kwenye Firebase Console. Tumia kitufe cha "Ingia kwa Google" hapa chini kuendelea mara moja.'
            : 'Email/Password sign-in is not enabled in Firebase Console. Please use "Continue with Google" below for instant access.'
        );
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col lg:grid lg:grid-cols-2 bg-white dark:bg-[#121b16] lg:bg-[#f6f7f6] lg:dark:bg-[#090e0b]">
      {/* Brand showcase panel — compact top header on mobile, full panel on desktop */}
      <div className="relative flex flex-col justify-between bg-[#08291A] text-white px-4 pt-3.5 pb-6 sm:p-8 lg:p-14 overflow-hidden shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <OilcomCamelMark className="w-8 h-7 sm:w-10 sm:h-9 shrink-0" />
            <div className="leading-none min-w-0">
              <p className="font-display text-sm sm:text-lg font-extrabold tracking-tight text-white truncate">
                OILCOM
              </p>
              <p className="font-display text-[10px] sm:text-xs font-bold tracking-wider text-[#F5B800] truncate mt-0.5">
                SUPER APP
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLang(lang === 'sw' ? 'en' : 'sw')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5 text-[#F5B800]" />
              {lang === 'sw' ? 'SW / EN' : 'EN / SW'}
            </button>
            <button
              type="button"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              aria-label="Toggle theme"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors cursor-pointer"
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4 text-[#F5B800]" />
              ) : (
                <Sun className="w-4 h-4 text-[#F5B800]" />
              )}
            </button>
          </div>
        </div>

        {/* Compact mobile tagline */}
        <p className="mt-2 text-xs text-emerald-100/85 lg:hidden truncate">
          {t(lang, 'tagline')}
        </p>

        {/* Full desktop brand hero */}
        <div className="hidden lg:block my-auto max-w-lg">
          <div className="inline-flex items-center gap-3 mb-6">
            <OilcomCamelMark className="w-16 h-14" />
          </div>
          <h1 className="font-display text-4xl xl:text-5xl font-extrabold tracking-tight leading-tight text-white">
            {t(lang, 'tagline')}
          </h1>
          <p className="mt-4 text-emerald-100/85 text-base leading-relaxed max-w-md">
            {lang === 'sw'
              ? 'Jukwaa moja la kisasa kwa wateja, wafanyabiashara (B2B), na mawakala wa OILCOM — Mafuta, Gesi ya LPG, Pointi za Zawadi na Ankara.'
              : 'One unified digital ecosystem for OILCOM customers, B2B corporate fleets, and authorized LPG dealers — Fuel, Gas, Rewards & Analytics.'}
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4 text-sm text-emerald-100/90">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="font-semibold text-[#F5B800]">OILCOM Rewards</p>
              <p className="mt-1 text-xs text-emerald-100/75">
                {lang === 'sw'
                  ? 'QR Salama & Pointi Kila Ununuzi'
                  : 'Verified QR & Loyalty Points'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="font-semibold text-[#F5B800]">OILCOM Gas & Fuel</p>
              <p className="mt-1 text-xs text-emerald-100/75">
                {lang === 'sw'
                  ? '6kg, 15kg, 38kg & Vocha za Mafuta'
                  : 'LPG Delivery & Prepaid Fuel'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="font-semibold text-[#F5B800]">Business B2B</p>
              <p className="mt-1 text-xs text-emerald-100/75">
                {lang === 'sw'
                  ? 'Oda za Jumla & Ankara za PDF'
                  : 'Bulk Fuel Orders & PDF Invoices'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="font-semibold text-[#F5B800]">Agent Portal</p>
              <p className="mt-1 text-xs text-emerald-100/75">
                {lang === 'sw'
                  ? 'Hisa, Usafirishaji & Kamisheni'
                  : 'Stock, Fulfilment & Commissions'}
              </p>
            </div>
          </div>
        </div>

        <p className="hidden lg:block text-xs text-emerald-200/60">
          OILCOM SUPER APP · Tanzania Energy & LPG Ecosystem
        </p>
      </div>

      {/* Authentication Form Panel — edge-to-edge full sheet on mobile, centered card on desktop */}
      <div className="flex-1 flex flex-col lg:items-center lg:justify-center -mt-3 lg:mt-0 rounded-t-3xl lg:rounded-none bg-white dark:bg-[#121b16] lg:bg-transparent px-4 pt-5 pb-4 sm:p-8 lg:p-14 shadow-lg lg:shadow-none">
        <div className="w-full lg:max-w-md flex-1 lg:flex-initial flex flex-col justify-between lg:block lg:bg-white lg:dark:bg-[#121b16] lg:border lg:border-neutral-200 lg:dark:border-emerald-950 lg:rounded-2xl lg:p-8 lg:shadow-sm">
          <div>
            <div className="text-center mb-4 sm:mb-6">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
                {mode === 'login'
                  ? t(lang, 'welcomeBack')
                  : mode === 'register'
                    ? lang === 'sw'
                      ? 'Jisajili Kama Mteja'
                      : 'Customer Registration'
                    : t(lang, 'forgotTitle')}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                {mode === 'login'
                  ? t(lang, 'signInSub')
                  : mode === 'register'
                    ? lang === 'sw'
                      ? 'Wateja wanaweza kujisajili hapa. Mawakala na Mameneja wa Vituo hutengenezewa akaunti na Admin.'
                      : 'Customers can register here. Agents & Station Managers sign in using Admin-provisioned accounts.'
                    : t(lang, 'forgotSub')}
              </p>
            </div>

            {mode === 'login' && (
              <div className="mb-3.5 px-3 py-2 rounded-xl bg-neutral-100 dark:bg-emerald-950/50 border border-neutral-200 dark:border-emerald-900 text-[11px] text-neutral-600 dark:text-emerald-100/80 text-center">
                {lang === 'sw'
                  ? 'Ukishalogin, utapelekwa moja kwa moja kwenye ukurasa wako (Mteja, Wakala, Meneja wa Kituo/Gesi, Biashara, au Utawala).'
                  : 'Upon sign-in, you are routed exclusively to your assigned role workspace.'}
              </div>
            )}

            {errorMsg && (
              <div className="mb-3.5 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {errorMsg}
              </div>
            )}

            {infoMsg && (
              <div className="mb-3.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200">
                {infoMsg}
              </div>
            )}

            {/* Primary Google Sign-In */}
            <button
              type="button"
              disabled={busy}
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#0b120e] font-semibold text-sm transition-colors cursor-pointer disabled:opacity-60"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#0b120e"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
                />
              </svg>
              {t(lang, 'continueWithGoogle')}
            </button>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-neutral-200 dark:bg-emerald-950" />
              <span className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                {lang === 'sw' ? 'au tumia barua pepe' : 'or use email'}
              </span>
              <div className="h-px flex-1 bg-neutral-200 dark:bg-emerald-950" />
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-3">
              {mode === 'register' && (
                <div className="relative">
                  <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={lang === 'sw' ? 'Jina Kamili' : 'Full Name'}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F5B800]"
                  />
                </div>
              )}

              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={lang === 'sw' ? 'Barua Pepe' : 'Email address'}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F5B800]"
                />
              </div>

              {mode !== 'forgot' && (
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={lang === 'sw' ? 'Nywila (Password)' : 'Password'}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F5B800]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    aria-label="Toggle password visibility"
                    className="absolute right-3 top-3 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              )}

              {mode === 'register' && (
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={lang === 'sw' ? 'Thibitisha Nywila' : 'Confirm Password'}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F5B800]"
                  />
                </div>
              )}

              {mode === 'login' && (
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg('');
                      setMode('register');
                    }}
                    className="text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:underline cursor-pointer"
                  >
                    {lang === 'sw' ? 'Huna akaunti? Jisajili' : 'New here? Register'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg('');
                      setMode('forgot');
                    }}
                    className="text-xs font-semibold text-[#08291A] dark:text-[#F5B800] hover:underline cursor-pointer shrink-0"
                  >
                    {t(lang, 'forgotTitle')}
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 px-4 rounded-xl bg-[#08291A] hover:bg-[#0d3b26] dark:bg-emerald-900 dark:hover:bg-emerald-800 text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-60"
              >
                {busy
                  ? t(lang, 'loading')
                  : mode === 'login'
                    ? t(lang, 'signInEmail')
                    : mode === 'register'
                      ? t(lang, 'registerTitle')
                      : t(lang, 'sendReset')}
              </button>
            </form>

            {mode !== 'login' && (
              <div className="mt-4 text-center text-xs text-neutral-600 dark:text-neutral-400">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setMode('login');
                  }}
                  className="hover:underline font-medium text-neutral-900 dark:text-white cursor-pointer"
                >
                  {lang === 'sw' ? 'Tayari una akaunti? Ingia hapa' : 'Already have an account? Sign in'}
                </button>
              </div>
            )}
          </div>

          {/* Mobile Service Highlights Footer — fills remaining viewport cleanly with zero dead space */}
          <div className="lg:hidden mt-5 pt-4 border-t border-neutral-100 dark:border-emerald-950 space-y-3">
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#f6f7f6] dark:bg-[#0c130f] border border-neutral-200/70 dark:border-emerald-950">
                <p className="font-bold text-[#08291A] dark:text-[#F5B800]">OILCOM Rewards</p>
                <p className="mt-0.5 text-[11px] text-neutral-600 dark:text-neutral-400">
                  {lang === 'sw' ? 'QR Salama & Pointi' : 'QR & Loyalty Points'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#f6f7f6] dark:bg-[#0c130f] border border-neutral-200/70 dark:border-emerald-950">
                <p className="font-bold text-[#08291A] dark:text-[#F5B800]">Mafuta & Gesi</p>
                <p className="mt-0.5 text-[11px] text-neutral-600 dark:text-neutral-400">
                  {lang === 'sw' ? '6kg, 15kg, 38kg & Vocha' : 'LPG & Prepaid Fuel'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#f6f7f6] dark:bg-[#0c130f] border border-neutral-200/70 dark:border-emerald-950">
                <p className="font-bold text-[#08291A] dark:text-[#F5B800]">Business B2B</p>
                <p className="mt-0.5 text-[11px] text-neutral-600 dark:text-neutral-400">
                  {lang === 'sw' ? 'Oda za Jumla & Ankara' : 'Fleet & Bulk Orders'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#f6f7f6] dark:bg-[#0c130f] border border-neutral-200/70 dark:border-emerald-950">
                <p className="font-bold text-[#08291A] dark:text-[#F5B800]">Ramani & Vituo</p>
                <p className="mt-0.5 text-[11px] text-neutral-600 dark:text-neutral-400">
                  {lang === 'sw' ? 'Vituo Karibu na GPS' : 'Live Station Locator'}
                </p>
              </div>
            </div>
            <p className="text-center text-[11px] text-neutral-400 dark:text-neutral-500">
              OILCOM SUPER APP · Tanzania Energy & LPG Ecosystem
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
