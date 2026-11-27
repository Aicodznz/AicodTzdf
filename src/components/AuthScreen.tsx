import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  Check,
  ChevronLeft,
  Eye,
  EyeOff,
  Globe,
  Lock,
  Mail,
  Moon,
  Sparkles,
  Sun,
  User,
} from 'lucide-react';
import { auth, db, googleProvider } from '../lib/firebase';
import { t } from '../i18n/translations';
import type { Language, ThemeMode } from '../types/oilcom';
import {
  GasCylinderGraphic,
  OilcomCamelMark,
  OilcomFullLogo,
} from './OilcomBrand';

interface AuthScreenProps {
  lang: Language;
  setLang: (lang: Language) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  onBackToHome?: () => void;
}

const INTRO_STORAGE_KEY = 'oilcom_auth_intro_v1';
const HERO_TANKER_SRC =
  '/assets/aistudio/WhatsApp_Image_2026-11-21_at_11.41.08_PM__1__e4bdacfd.jpeg';

export function AuthScreen({
  lang,
  setLang,
  theme,
  setTheme,
  onBackToHome,
}: AuthScreenProps) {
  const [showMobileIntro, setShowMobileIntro] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(INTRO_STORAGE_KEY) !== '1';
    } catch {
      return false;
    }
  });
  const [introSlide, setIntroSlide] = useState(0);

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [acceptTerms, setAcceptTerms] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const dismissMobileIntro = () => {
    setShowMobileIntro(false);
    try {
      window.localStorage.setItem(INTRO_STORAGE_KEY, '1');
    } catch {
      // ignore storage failure
    }
  };

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
      setErrorMsg(
        lang === 'sw' ? 'Tafadhali weka barua pepe.' : 'Email is required.'
      );
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
        setErrorMsg(
          lang === 'sw' ? 'Jaza jina kamili.' : 'Full name is required.'
        );
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg(
          lang === 'sw' ? 'Nywila hazifanani.' : 'Passwords do not match.'
        );
        return;
      }
      if (!acceptTerms) {
        setErrorMsg(
          lang === 'sw'
            ? 'Tafadhali kubali vigezo na masharti kuendelea.'
            : 'Please agree to the Terms of Use and Privacy Policy.'
        );
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const cred = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
        const cleanName = fullName.trim().slice(0, 120);
        await updateProfile(cred.user, { displayName: cleanName });
        try {
          await updateDoc(doc(db, 'users', cred.user.uid), {
            fullName: cleanName,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // ensureUserDocuments may still be creating the doc with updated displayName
        }
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
        setErrorMsg(
          err instanceof Error ? err.message : 'Authentication failed.'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const introSlides = [
    {
      title:
        lang === 'sw'
          ? 'Mafuta Bora,\nWakati Wowote, Popote.'
          : 'Premium Energy.\nAnytime, Anywhere.',
      subtitle:
        lang === 'sw'
          ? 'Pata petroli, dizeli na huduma bora za vituo vya OILCOM kote Tanzania kwa urahisi.'
          : 'Refuel with trusted Petrol, Diesel, and fleet vouchers across OILCOM stations nationwide.',
      visual: (
        <div className="relative w-full max-w-[330px] aspect-[4/3] mx-auto rounded-3xl overflow-hidden shadow-[0_24px_60px_rgba(6,18,54,0.75)] border border-white/10">
          <img
            src={HERO_TANKER_SRC}
            alt="OILCOM Energy Tanker"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B142C] via-transparent to-[#0B142C]/35" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B142C]/30 via-transparent to-[#0B142C]/30" />
        </div>
      ),
    },
    {
      title:
        lang === 'sw'
          ? 'Gesi ya OILCOM,\nMpaka Mlangoni Kwako.'
          : 'Clean LPG Gas,\nDelivered Fast.',
      subtitle:
        lang === 'sw'
          ? 'Agiza mitungi ya 6kg, 15kg au 38kg na ufuatilie usafirishaji mubashara.'
          : 'Order 6kg, 15kg, or 38kg LPG cylinders from nearby dealers with live delivery tracking.',
      visual: (
        <div className="relative w-56 h-56 mx-auto rounded-full bg-gradient-to-b from-[#163682]/45 to-[#0B142C]/80 border border-blue-400/20 shadow-[0_24px_64px_rgba(29,78,216,0.35)] flex items-center justify-center">
          <GasCylinderGraphic sizeKg={15} className="w-32 h-36" />
        </div>
      ),
    },
    {
      title:
        lang === 'sw'
          ? 'Kusanya Pointi\nKila Unapojaza.'
          : 'Earn Rewards\nWith Every Refill.',
      subtitle:
        lang === 'sw'
          ? 'Tumia QR ya OILCOM Rewards kupata punguzo la papo hapo na vocha za zawadi.'
          : 'Scan your verified OILCOM Rewards QR code to collect points and redeem instant vouchers.',
      visual: (
        <div className="relative w-64 py-6 mx-auto rounded-3xl bg-white/[0.04] border border-white/10 shadow-[0_24px_60px_rgba(6,18,54,0.6)] flex items-center justify-center">
          <OilcomFullLogo className="w-44" />
        </div>
      ),
    },
  ];

  const activeIntro = introSlides[introSlide] || introSlides[0];

  return (
    <div
      className="min-h-[100dvh] flex flex-col lg:grid lg:grid-cols-2 text-white relative overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse 85% 55% at 50% 20%, rgba(30, 74, 176, 0.34), transparent 70%), linear-gradient(180deg, #0D162D 0%, #152345 48%, #091124 100%)',
      }}
    >
      {/* Top 3-Color OILCOM Ribbon */}
      <div className="absolute top-0 inset-x-0 h-1 grid grid-cols-3 z-30">
        <span className="bg-[#1D4ED8]" />
        <span className="bg-[#D92027]" />
        <span className="bg-[#F5B800]" />
      </div>

      {/* MOBILE ONBOARDING SLIDES (Sleek full-height dark showcase on first visit) */}
      {showMobileIntro && (
        <div className="lg:hidden min-h-[100dvh] flex flex-col justify-between px-5 pt-6 pb-8 relative z-20">
          {/* Top Dots + Skip */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {introSlides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Slide ${idx + 1}`}
                  onClick={() => setIntroSlide(idx)}
                  className={`h-2.5 rounded-full transition-all cursor-pointer ${
                    idx === introSlide
                      ? 'w-2.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.65)]'
                      : 'w-2.5 bg-white/30 hover:bg-white/50'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={dismissMobileIntro}
              className="px-3 py-1.5 rounded-full text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              {lang === 'sw' ? 'Ruka' : 'Skip'}
            </button>
          </div>

          {/* Centered Visual Showcase */}
          <div className="my-auto py-6 flex items-center justify-center">
            {activeIntro.visual}
          </div>

          {/* Bottom Editorial Copy + Glowing Pill CTA */}
          <div className="space-y-4">
            <h1 className="font-display text-[26px] font-extrabold leading-[1.18] tracking-tight text-white whitespace-pre-line">
              {activeIntro.title}
            </h1>
            <p className="text-sm text-slate-300/85 leading-relaxed max-w-sm">
              {activeIntro.subtitle}
            </p>
            <button
              type="button"
              onClick={() => {
                if (introSlide < introSlides.length - 1) {
                  setIntroSlide((prev) => prev + 1);
                } else {
                  dismissMobileIntro();
                }
              }}
              className="mt-2 w-full py-3.5 px-6 rounded-full bg-gradient-to-b from-[#1342A8] via-[#0B2A6F] to-[#061844] border border-blue-400/35 shadow-[0_10px_30px_rgba(19,66,168,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] text-white font-bold text-sm tracking-wide cursor-pointer hover:brightness-110 active:scale-[0.99] transition-all"
            >
              {introSlide < introSlides.length - 1
                ? lang === 'sw'
                  ? 'Endelea'
                  : 'Continue'
                : lang === 'sw'
                  ? 'Anza Sasa'
                  : 'Get Started'}
            </button>
          </div>
        </div>
      )}

      {/* DESKTOP LEFT PANEL (Brand Showcase & Pillars) */}
      <div className="hidden lg:flex relative flex-col justify-between p-12 xl:p-14 border-r border-white/10 overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          {onBackToHome ? (
            <button
              type="button"
              onClick={onBackToHome}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 text-[#F5B800]" />
              <span>{lang === 'sw' ? 'Rudi Nyumbani' : 'Back to Home'}</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLang(lang === 'sw' ? 'en' : 'sw')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-[#F5B800]" />
              {lang === 'sw' ? 'SW / EN' : 'EN / SW'}
            </button>
            <button
              type="button"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              aria-label="Toggle theme"
              className="p-2 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-white transition-colors cursor-pointer"
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4 text-[#F5B800]" />
              ) : (
                <Sun className="w-4 h-4 text-[#F5B800]" />
              )}
            </button>
          </div>
        </div>

        <div className="my-auto max-w-lg">
          <div className="inline-flex items-center gap-3 mb-6">
            <OilcomFullLogo className="w-56 xl:w-64" />
          </div>
          <h1 className="font-display text-4xl xl:text-5xl font-extrabold tracking-tight leading-tight text-white">
            {t(lang, 'tagline')}
          </h1>
          <p className="mt-4 text-blue-100/80 text-base leading-relaxed max-w-md">
            {lang === 'sw'
              ? 'Jukwaa moja la kisasa kwa wateja, wafanyabiashara (B2B), na mawakala wa OILCOM — Mafuta, Gesi ya LPG, Pointi za Zawadi na Ankara.'
              : 'One unified digital ecosystem for OILCOM customers, B2B corporate fleets, and authorized LPG dealers — Fuel, Gas, Rewards & Analytics.'}
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4 text-sm text-blue-100/90">
            <div className="p-4 rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur-md">
              <p className="font-semibold text-[#F5B800]">OILCOM Rewards</p>
              <p className="mt-1 text-xs text-blue-100/75">
                {lang === 'sw'
                  ? 'QR Salama & Pointi Kila Ununuzi'
                  : 'Verified QR & Loyalty Points'}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur-md">
              <p className="font-semibold text-[#FF5C63]">OILCOM Gas & Fuel</p>
              <p className="mt-1 text-xs text-blue-100/75">
                {lang === 'sw'
                  ? '6kg, 15kg, 38kg & Vocha za Mafuta'
                  : 'LPG Delivery & Prepaid Fuel'}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur-md">
              <p className="font-semibold text-[#F5B800]">Business B2B</p>
              <p className="mt-1 text-xs text-blue-100/75">
                {lang === 'sw'
                  ? 'Oda za Jumla & Ankara za PDF'
                  : 'Bulk Fuel Orders & PDF Invoices'}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur-md">
              <p className="font-semibold text-[#F5B800]">Agent Portal</p>
              <p className="mt-1 text-xs text-blue-100/75">
                {lang === 'sw'
                  ? 'Hisa, Usafirishaji & Kamisheni'
                  : 'Stock, Fulfilment & Commissions'}
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-blue-200/55">
          OILCOM SUPER APP · Tanzania Energy & LPG Ecosystem
        </p>
      </div>

      {/* AUTH FORM PANEL (Mobile Glassmorphic Full Screen / Desktop Centered Card) */}
      <div
        className={`${
          showMobileIntro ? 'hidden lg:flex' : 'flex'
        } flex-1 flex-col justify-between lg:items-center lg:justify-center px-5 pt-5 pb-7 sm:px-8 lg:p-12 relative z-10`}
      >
        {/* Mobile Top Navigation Controls */}
        <div className="lg:hidden flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={
              onBackToHome ||
              (() => {
                setIntroSlide(0);
                setShowMobileIntro(true);
              })
            }
            aria-label={lang === 'sw' ? 'Rudi' : 'Back'}
            className="w-10 h-10 rounded-full bg-white/[0.09] hover:bg-white/[0.16] border border-white/15 backdrop-blur-md flex items-center justify-center text-white shadow-[0_4px_14px_rgba(5,12,35,0.4)] cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setIntroSlide(0);
                setShowMobileIntro(true);
              }}
              aria-label={lang === 'sw' ? 'Utangulizi' : 'Intro'}
              className="p-2 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-[#F5B800] cursor-pointer transition-colors"
            >
              <Sparkles className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setLang(lang === 'sw' ? 'en' : 'sw')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-xs font-semibold text-white cursor-pointer whitespace-nowrap transition-colors"
            >
              <Globe className="w-3.5 h-3.5 text-[#F5B800]" />
              {lang === 'sw' ? 'SW / EN' : 'EN / SW'}
            </button>
          </div>
        </div>

        {/* Main Form Container */}
        <div className="w-full max-w-md mx-auto my-auto py-4 lg:rounded-3xl lg:bg-white/[0.06] lg:backdrop-blur-xl lg:border lg:border-white/15 lg:p-8 lg:shadow-[0_24px_64px_rgba(4,12,36,0.55)]">
          {/* Glowing Circular Camel Medallion + Brand Title */}
          <div className="flex flex-col items-center text-center mb-5">
            <div className="w-16 h-16 rounded-full bg-gradient-to-b from-white/[0.14] to-white/[0.04] border border-white/20 shadow-[0_8px_28px_rgba(29,78,216,0.45)] flex items-center justify-center backdrop-blur-md">
              <OilcomCamelMark className="w-11 h-11" />
            </div>
            <span className="mt-2 font-display text-sm font-extrabold tracking-[0.12em] text-white">
              OILCOM
            </span>
          </div>

          {/* Two-Tone Display Headline */}
          <div className="text-center mb-6">
            <h2 className="font-display text-[28px] sm:text-3xl font-extrabold leading-[1.15] tracking-tight text-white">
              {mode === 'login' ? (
                lang === 'sw' ? (
                  <>
                    Ingia <span className="text-[#5B8DEF]">Kwenye</span>
                    <br />
                    <span className="text-[#5B8DEF]">Akaunti</span> Yako
                  </>
                ) : (
                  <>
                    Login <span className="text-[#5B8DEF]">To</span>
                    <br />
                    <span className="text-[#5B8DEF]">Your</span> Account
                  </>
                )
              ) : mode === 'register' ? (
                lang === 'sw' ? (
                  <>
                    Fungua <span className="text-[#5B8DEF]">Akaunti</span>
                    <br />
                    Yako
                  </>
                ) : (
                  <>
                    Create <span className="text-[#5B8DEF]">Your</span>
                    <br />
                    Account
                  </>
                )
              ) : lang === 'sw' ? (
                <>
                  Rejesha <span className="text-[#5B8DEF]">Nywila</span>
                  <br />
                  Yako
                </>
              ) : (
                <>
                  Reset <span className="text-[#5B8DEF]">Your</span>
                  <br />
                  Password
                </>
              )}
            </h2>
            <p className="mt-2 text-xs text-slate-300/75 max-w-xs mx-auto">
              {mode === 'login'
                ? lang === 'sw'
                  ? 'Akaunti zote (Mteja, Wakala, Meneja, B2B) zinaingia hapa.'
                  : 'All roles (Customer, Agent, Manager & B2B) sign in here.'
                : mode === 'register'
                  ? lang === 'sw'
                    ? 'Jisajili bure kama mteja wa OILCOM Super App.'
                    : 'Register free as an OILCOM Super App customer.'
                  : t(lang, 'forgotSub')}
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-2xl bg-red-500/15 border border-red-400/35 text-xs text-red-200 text-center">
              {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div className="mb-4 px-4 py-3 rounded-2xl bg-blue-500/20 border border-blue-400/35 text-xs text-blue-100 text-center">
              {infoMsg}
            </div>
          )}

          {/* Glassmorphic Pill Form */}
          <form onSubmit={handleEmailAuth} className="space-y-3.5">
            {mode === 'register' && (
              <div className="relative">
                <User className="w-[18px] h-[18px] text-slate-300/80 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={lang === 'sw' ? 'Jina Kamili' : 'Full Name'}
                  className="w-full pl-11 pr-4 py-3.5 rounded-full border border-white/15 bg-gradient-to-r from-white/[0.09] via-[#1B336B]/45 to-white/[0.07] text-sm text-white placeholder:text-slate-400 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/70"
                />
              </div>
            )}

            <div className="relative">
              <Mail className="w-[18px] h-[18px] text-slate-300/80 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={lang === 'sw' ? 'Barua Pepe...' : 'Email...'}
                className="w-full pl-11 pr-4 py-3.5 rounded-full border border-white/15 bg-gradient-to-r from-white/[0.09] via-[#1B336B]/45 to-white/[0.07] text-sm text-white placeholder:text-slate-400 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/70"
              />
            </div>

            {mode !== 'forgot' && (
              <div className="relative">
                <Lock className="w-[18px] h-[18px] text-slate-300/80 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={lang === 'sw' ? 'Nywila (Password)' : 'Password'}
                  className="w-full pl-11 pr-12 py-3.5 rounded-full border border-white/15 bg-gradient-to-r from-white/[0.09] via-[#1B336B]/45 to-white/[0.07] text-sm text-white placeholder:text-slate-400 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/70"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  aria-label="Toggle password visibility"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300/80 hover:text-white cursor-pointer"
                >
                  {showPass ? (
                    <EyeOff className="w-[18px] h-[18px]" />
                  ) : (
                    <Eye className="w-[18px] h-[18px]" />
                  )}
                </button>
              </div>
            )}

            {mode === 'register' && (
              <div className="relative">
                <Lock className="w-[18px] h-[18px] text-slate-300/80 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showConfirmPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={
                    lang === 'sw' ? 'Thibitisha Nywila' : 'Confirm Password'
                  }
                  className="w-full pl-11 pr-12 py-3.5 rounded-full border border-white/15 bg-gradient-to-r from-white/[0.09] via-[#1B336B]/45 to-white/[0.07] text-sm text-white placeholder:text-slate-400 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/70"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                  aria-label="Toggle confirm password visibility"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300/80 hover:text-white cursor-pointer"
                >
                  {showConfirmPass ? (
                    <EyeOff className="w-[18px] h-[18px]" />
                  ) : (
                    <Eye className="w-[18px] h-[18px]" />
                  )}
                </button>
              </div>
            )}

            {mode === 'login' && (
              <div className="flex items-center justify-between gap-2 px-1 pt-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setInfoMsg('');
                    setMode('forgot');
                  }}
                  className="font-semibold text-[#FF5C63] hover:text-[#ff7a80] hover:underline cursor-pointer"
                >
                  {lang === 'sw' ? 'Sahau Nywila?' : 'Forgot Password?'}
                </button>
                <button
                  type="button"
                  onClick={() => setRememberMe((v) => !v)}
                  className="inline-flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer"
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center border transition-colors ${
                      rememberMe
                        ? 'bg-[#2563EB] border-[#3B82F6] text-white'
                        : 'border-white/30 bg-white/10 text-transparent'
                    }`}
                  >
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span>{lang === 'sw' ? 'Nikumbuke' : 'Remember me'}</span>
                </button>
              </div>
            )}

            {mode === 'register' && (
              <div className="px-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => setAcceptTerms((v) => !v)}
                  className="inline-flex items-center gap-2 text-xs text-slate-300 hover:text-white cursor-pointer text-left"
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
                      acceptTerms
                        ? 'bg-[#2563EB] border-[#3B82F6] text-white'
                        : 'border-white/30 bg-white/10 text-transparent'
                    }`}
                  >
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span>
                    {lang === 'sw' ? (
                      <>
                        Nakubali{' '}
                        <span className="text-[#22C55E] font-semibold">
                          Vigezo na Masharti
                        </span>{' '}
                        na{' '}
                        <span className="text-[#22C55E] font-semibold">
                          Sera ya Faragha
                        </span>
                      </>
                    ) : (
                      <>
                        Agree To The{' '}
                        <span className="text-[#22C55E] font-semibold">
                          Terms Of Use
                        </span>{' '}
                        And{' '}
                        <span className="text-[#22C55E] font-semibold">
                          Privacy Policy
                        </span>
                      </>
                    )}
                  </span>
                </button>
              </div>
            )}

            {/* Glowing Cobalt Primary CTA */}
            <button
              type="submit"
              disabled={busy}
              className="mt-1 w-full py-3.5 px-6 rounded-full bg-gradient-to-b from-[#1342A8] via-[#0B2A6F] to-[#061844] border border-blue-400/35 shadow-[0_10px_30px_rgba(19,66,168,0.6),inset_0_1px_1px_rgba(255,255,255,0.22)] text-white font-bold text-sm tracking-wide cursor-pointer hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {busy
                ? t(lang, 'loading')
                : mode === 'login'
                  ? lang === 'sw'
                    ? 'Ingia'
                    : 'Login'
                  : mode === 'register'
                    ? lang === 'sw'
                      ? 'Jisajili'
                      : 'Sign Up'
                    : t(lang, 'sendReset')}
            </button>
          </form>

          {/* OR Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/15" />
            <span className="text-[11px] font-bold tracking-widest text-slate-300/80 uppercase">
              {lang === 'sw' ? 'AU' : 'OR'}
            </span>
            <div className="h-px flex-1 bg-white/15" />
          </div>

          {/* Functional Google Sign-In Circle & Pill Action */}
          <div className="flex flex-col items-center gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={handleGoogleSignIn}
              className="inline-flex items-center justify-center gap-3 px-6 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-[#3B82F6]/45 shadow-[0_4px_20px_rgba(15,45,120,0.35)] text-sm font-semibold text-white transition-all cursor-pointer disabled:opacity-60"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              <span>{t(lang, 'continueWithGoogle')}</span>
            </button>
          </div>
        </div>

        {/* Bottom Mode Switch Footer */}
        <div className="pt-4 text-center text-xs text-slate-300/85">
          {mode === 'login' ? (
            <>
              <span>
                {lang === 'sw'
                  ? 'Huna akaunti? '
                  : "Don't have an account? "}
              </span>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setInfoMsg('');
                  setMode('register');
                }}
                className="font-bold text-[#22C55E] hover:text-[#4ADE80] hover:underline cursor-pointer"
              >
                {lang === 'sw' ? 'Jisajili' : 'Sign up'}
              </button>
            </>
          ) : (
            <>
              <span>
                {lang === 'sw'
                  ? 'Tayari una akaunti? '
                  : 'Already have an account? '}
              </span>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setInfoMsg('');
                  setMode('login');
                }}
                className="font-bold text-[#22C55E] hover:text-[#4ADE80] hover:underline cursor-pointer"
              >
                {lang === 'sw' ? 'Ingia' : 'Login'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
