import React, { useState } from 'react';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe,
  HelpCircle,
  LogOut,
  MapPin,
  Moon,
  Plus,
  Shield,
  Sun,
  Trash2,
  User,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { t } from '../i18n/translations';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { makeId } from '../lib/firestoreActions';
import type {
  AppNotification,
  CustomerAddress,
  CustomerProfile,
  Language,
  OilcomUser,
  ThemeMode,
  UserRole,
} from '../types/oilcom';
import { MapLocationPickerModal } from './MapLocationPickerModal';
import { formatTimestamp } from './OilcomBrand';
import { PWAInstallButton } from './PwaControls';

interface ProfileAndSupportModuleProps {
  lang: Language;
  setLang: (lang: Language) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  user: OilcomUser;
  effectiveRole: UserRole;
  setPreviewRole: (role: UserRole | null) => void;
  profile: CustomerProfile | null;
  addresses: CustomerAddress[];
  notifications: AppNotification[];
  googleMapsApiKey: string;
}

export function ProfileAndSupportModule({
  lang,
  setLang,
  theme,
  setTheme,
  user,
  effectiveRole,
  setPreviewRole,
  profile,
  addresses,
  notifications,
  googleMapsApiKey,
}: ProfileAndSupportModuleProps) {
  const [section, setSection] = useState<
    'info' | 'addresses' | 'notifications' | 'help' | 'legal'
  >('info');
  const [mobileSubOpen, setMobileSubOpen] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone || '');
  const [vehiclePlate, setVehiclePlate] = useState(profile?.vehiclePlate || '');
  const [addrForm, setAddrForm] = useState({
    label: 'Nyumbani / Home',
    street: '',
    city: 'Dar es Salaam',
    region: 'Dar es Salaam',
  });
  const [savedMsg, setSavedMsg] = useState('');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedMsg('');
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        fullName: fullName.trim().slice(0, 120),
        phone: phone.trim().slice(0, 32),
        language: lang,
        updatedAt: serverTimestamp(),
      });
      if (profile) {
        await updateDoc(doc(db, 'customer_profiles', user.uid), {
          vehiclePlate: vehiclePlate.trim().toUpperCase().slice(0, 24),
          updatedAt: serverTimestamp(),
        });
      }
      setSavedMsg(
        lang === 'sw' ? 'Taarifa zimehifadhiwa.' : 'Profile updated successfully.'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addrForm.street.trim()) return;
    const addrId = makeId('addr');
    try {
      await setDoc(doc(db, 'customer_addresses', addrId), {
        userId: user.uid,
        label: addrForm.label.trim().slice(0, 60),
        street: addrForm.street.trim().slice(0, 200),
        city: addrForm.city.trim().slice(0, 80),
        region: addrForm.region.trim().slice(0, 80),
        isDefault: addresses.length === 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setAddrForm({ ...addrForm, street: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `customer_addresses/${addrId}`);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'customer_addresses', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `customer_addresses/${id}`);
    }
  };

  const handleMarkRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), { read: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${notifId}`);
    }
  };

  return (
    <div className="space-y-3.5 sm:space-y-5">
      {/* Header Profile Card */}
      <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
          {user.photoUrl ? (
            <img
              src={user.photoUrl}
              alt={user.fullName}
              referrerPolicy="no-referrer"
              className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-[#F5B800] shrink-0"
            />
          ) : (
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-[#0B2A6F] text-[#F5B800] font-display font-bold text-xl sm:text-2xl flex items-center justify-center shrink-0">
              {user.fullName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg sm:text-xl font-bold text-neutral-900 dark:text-white truncate">
              {user.fullName}
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {user.email} · {user.phone || '+255'} · {user.role.toUpperCase()}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => signOut(auth)}
          className="hidden lg:flex px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold items-center gap-2 cursor-pointer shrink-0"
        >
          <LogOut className="w-4 h-4" />
          {t(lang, 'signOut')}
        </button>
      </div>

      {/* Admin Workspace View Switcher (strictly for verified Admin) */}
      {user.role === 'admin' && (
        <div className="rounded-2xl bg-[#0B2A6F] text-white p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
          <div className="text-xs">
            <span className="font-bold text-[#F5B800]">Admin Workspace Preview:</span>{' '}
            {lang === 'sw'
              ? 'Jaribu mwonekano wa kila jukumu'
              : 'Preview role-scoped navigation'}
          </div>
          <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5 w-full sm:w-auto">
            {(
              [
                ['admin', 'Admin'],
                ['customer', 'Customer'],
                ['agent', 'Wakala'],
                ['station_manager', 'Meneja Mafuta'],
                ['gas_manager', 'Meneja Gesi'],
                ['business', 'Biashara'],
              ] as const
            ).map(([r, label]) => (
              <button
                key={r}
                type="button"
                onClick={() => setPreviewRole(r === 'admin' ? null : r)}
                className={`px-2 sm:px-3 py-1.5 sm:py-1 rounded-lg text-[11px] font-semibold text-center cursor-pointer ${
                  effectiveRole === r
                    ? 'bg-[#F5B800] text-[#071A4A]'
                    : 'bg-white/10 text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PWA Install Prompt Card */}
      <PWAInstallButton lang={lang} variant="card" />

      {/* Mobile Clean List Menu (< lg) when viewing profile overview */}
      {!mobileSubOpen && (
        <div className="lg:hidden space-y-3">
          <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 divide-y divide-neutral-100 dark:divide-blue-950 overflow-hidden">
            {(
              [
                ['info', t(lang, 'myInfo'), User],
                ...(effectiveRole === 'customer' || effectiveRole === 'admin'
                  ? ([['addresses', `${t(lang, 'myAddresses')} (${addresses.length})`, MapPin]] as const)
                  : []),
                ['notifications', `${t(lang, 'notifications')} (${notifications.filter((n) => !n.read).length})`, Bell],
                ['help', t(lang, 'supportFaq'), HelpCircle],
                ['legal', t(lang, 'termsConditions'), FileText],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setSection(k);
                  setMobileSubOpen(true);
                }}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-neutral-50 dark:hover:bg-blue-950/30 cursor-pointer"
              >
                <span className="flex items-center gap-3 text-sm font-semibold text-neutral-900 dark:text-white">
                  <Icon className="w-4 h-4 text-[#0B2A6F] dark:text-[#F5B800]" />
                  {label}
                </span>
                <ChevronRight className="w-4 h-4 text-neutral-400" />
              </button>
            ))}

            <button
              type="button"
              onClick={() => setLang(lang === 'sw' ? 'en' : 'sw')}
              className="w-full px-4 py-3.5 flex items-center justify-between text-left cursor-pointer"
            >
              <span className="flex items-center gap-3 text-sm font-semibold text-neutral-900 dark:text-white">
                <Globe className="w-4 h-4 text-[#0B2A6F] dark:text-[#F5B800]" />
                {t(lang, 'languageLabel')}
              </span>
              <span className="text-xs font-mono-num font-bold text-[#0B2A6F] dark:text-[#F5B800] flex items-center gap-1">
                {lang === 'sw' ? 'Kiswahili' : 'English'}
                <ChevronRight className="w-4 h-4 text-neutral-400" />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="w-full px-4 py-3.5 flex items-center justify-between text-left cursor-pointer"
            >
              <span className="flex items-center gap-3 text-sm font-semibold text-neutral-900 dark:text-white">
                {theme === 'light' ? (
                  <Sun className="w-4 h-4 text-[#F5B800]" />
                ) : (
                  <Moon className="w-4 h-4 text-[#F5B800]" />
                )}
                {t(lang, 'themeLabel')}
              </span>
              <span className="text-xs font-mono-num font-bold capitalize text-[#0B2A6F] dark:text-[#F5B800] flex items-center gap-1">
                {theme}
                <ChevronRight className="w-4 h-4 text-neutral-400" />
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => signOut(auth)}
            className="w-full py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            {t(lang, 'signOut')}
          </button>
        </div>
      )}

      {/* Mobile Sub-view Back Bar */}
      {mobileSubOpen && (
        <button
          type="button"
          onClick={() => setMobileSubOpen(false)}
          className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-200/70 dark:bg-blue-950/60 text-xs font-bold text-neutral-900 dark:text-white cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          {lang === 'sw' ? 'Rudi Wasifu' : 'Back to Profile'}
        </button>
      )}

      {/* Desktop Quick Settings & Section Tabs */}
      <div className="hidden lg:grid sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setLang(lang === 'sw' ? 'en' : 'sw')}
          className="p-4 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-3 text-sm font-semibold">
            <Globe className="w-5 h-5 text-[#F5B800]" />
            {t(lang, 'languageLabel')}
          </span>
          <span className="font-mono-num text-xs font-bold text-[#0B2A6F] dark:text-[#F5B800]">
            {lang === 'sw' ? 'Kiswahili (Default)' : 'English'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="p-4 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-3 text-sm font-semibold">
            {theme === 'light' ? (
              <Sun className="w-5 h-5 text-[#F5B800]" />
            ) : (
              <Moon className="w-5 h-5 text-[#F5B800]" />
            )}
            {t(lang, 'themeLabel')}
          </span>
          <span className="font-mono-num text-xs font-bold text-[#0B2A6F] dark:text-[#F5B800] capitalize">
            {theme}
          </span>
        </button>
      </div>

      {/* Section Tabs (Desktop) */}
      <div className="hidden lg:flex flex-wrap gap-1 p-1 rounded-xl bg-neutral-200/70 dark:bg-blue-950/60 w-fit">
        {(
          [
            ['info', t(lang, 'myInfo'), User],
            ...(effectiveRole === 'customer' || effectiveRole === 'admin'
              ? ([['addresses', t(lang, 'myAddresses'), MapPin]] as const)
              : []),
            ['notifications', `${t(lang, 'notifications')} (${notifications.filter((n) => !n.read).length})`, Bell],
            ['help', t(lang, 'supportFaq'), HelpCircle],
            ['legal', t(lang, 'termsConditions'), FileText],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setSection(k)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
              section === k
                ? 'bg-white dark:bg-[#0E172E] text-neutral-900 dark:text-[#F5B800]'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className={mobileSubOpen ? 'block' : 'hidden lg:block'}>

      {section === 'info' && (
        <form
          onSubmit={handleSaveProfile}
          className="max-w-xl rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3.5 sm:space-y-4"
        >
          {savedMsg && (
            <p className="text-xs text-blue-700 dark:text-blue-300">{savedMsg}</p>
          )}
          <div>
            <label className="block text-xs font-semibold mb-1">
              {lang === 'sw' ? 'Jina Kamili' : 'Full Name'}
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              {lang === 'sw' ? 'Namba ya Simu' : 'Phone Number'}
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+255 712 345 678"
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-sm"
            />
          </div>
          {(effectiveRole === 'customer' || effectiveRole === 'admin') && (
            <div>
              <label className="block text-xs font-semibold mb-1">
                {lang === 'sw' ? 'Namba ya Gari (Hiari)' : 'Vehicle Plate (Optional)'}
              </label>
              <input
                type="text"
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
                placeholder="T 123 ABC"
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-sm font-mono-num uppercase"
              />
            </div>
          )}
          <button
            type="submit"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#F5B800] text-[#071A4A] font-bold text-xs cursor-pointer"
          >
            {t(lang, 'save')}
          </button>
        </form>
      )}

      {section === 'addresses' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-6">
          <form
            onSubmit={handleAddAddress}
            className="min-w-0 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display font-bold text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#F5B800]" />
                {lang === 'sw' ? 'Ongeza Anwani Mpya' : 'Add Delivery Address'}
              </h3>
              <button
                type="button"
                onClick={() => setMapPickerOpen(true)}
                className="text-[11px] font-bold text-[#0B2A6F] dark:text-[#F5B800] flex items-center gap-1 hover:underline cursor-pointer shrink-0"
              >
                <MapPin className="w-3.5 h-3.5" />
                {lang === 'sw' ? 'Chagua Kwenye Ramani' : 'Pick on Map'}
              </button>
            </div>
            <input
              type="text"
              value={addrForm.label}
              onChange={(e) => setAddrForm({ ...addrForm, label: e.target.value })}
              placeholder="Label (Nyumbani / Ofisini)"
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
            />
            <input
              type="text"
              required
              value={addrForm.street}
              onChange={(e) => setAddrForm({ ...addrForm, street: e.target.value })}
              placeholder="Mtaa / Nyumba (e.g. Sinza Mori, Plot 42)"
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={addrForm.city}
                onChange={(e) => setAddrForm({ ...addrForm, city: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
              />
              <input
                type="text"
                value={addrForm.region}
                onChange={(e) => setAddrForm({ ...addrForm, region: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#0B2A6F] text-white text-xs font-semibold cursor-pointer"
            >
              {t(lang, 'save')}
            </button>
          </form>

          <div className="min-w-0 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3">
            {addresses.length === 0 ? (
              <p className="text-xs text-neutral-500 py-6 text-center">{t(lang, 'noResults')}</p>
            ) : (
              addresses.map((a) => (
                <div
                  key={a.id}
                  className="p-3 rounded-xl border border-neutral-200 dark:border-blue-950 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{a.label}</p>
                    <p className="text-neutral-500 truncate">
                      {a.street}, {a.city}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAddress(a.id)}
                    className="text-red-500 hover:text-red-600 p-1 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {section === 'notifications' && (
        <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 divide-y divide-neutral-100 dark:divide-blue-950">
          {notifications.length === 0 ? (
            <p className="text-xs text-neutral-500 py-8 text-center">{t(lang, 'noResults')}</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className="py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-neutral-900 dark:text-white">
                    {lang === 'sw' ? n.titleSw : n.titleEn}
                  </p>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                    {lang === 'sw' ? n.bodySw : n.bodyEn}
                  </p>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    {formatTimestamp(n.createdAt)}
                  </p>
                </div>
                {!n.read && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(n.id)}
                    className="px-3 py-1 rounded-lg bg-[#F5B800] text-[#071A4A] text-xs font-bold shrink-0 cursor-pointer"
                  >
                    {lang === 'sw' ? 'Soma' : 'Mark Read'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {section === 'help' && (
        <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3.5 sm:space-y-4">
          <h3 className="font-display font-bold text-base">
            {t(lang, 'supportFaq')}
          </h3>
          <div className="space-y-3 text-xs leading-relaxed">
            <div className="p-3.5 sm:p-4 rounded-xl bg-neutral-50 dark:bg-blue-950/30">
              <p className="font-bold">
                {lang === 'sw'
                  ? 'Je, ninakusanyaje pointi za OILCOM Rewards?'
                  : 'How do I earn OILCOM Rewards points?'}
              </p>
              <p className="text-neutral-600 dark:text-neutral-300 mt-1">
                {lang === 'sw'
                  ? 'Onyesha msimbo wako wa QR kwa wakala wa kituo wakati wa ununuzi wa mafuta au gesi. Mfumo unathibitisha QR kwenye seva kuzuia udanganyifu.'
                  : 'Present your personal HMAC-signed QR code in the Rewards tab to an authorized station agent after purchase.'}
              </p>
            </div>
            <div className="p-3.5 sm:p-4 rounded-xl bg-neutral-50 dark:bg-blue-950/30">
              <p className="font-bold">
                {lang === 'sw'
                  ? 'Malipo ya M-Pesa / Airtel Money / Mixx by Yas yanafanyaje kazi?'
                  : 'How do mobile money payments work?'}
              </p>
              <p className="text-neutral-600 dark:text-neutral-300 mt-1">
                {lang === 'sw'
                  ? 'Kwa sasa mfumo uko katika Hali ya Majaribio (Sandbox). Hakuna fedha halisi zinazokatwa hadi vibali rasmi vya mfanyabiashara vitakapounganishwa.'
                  : 'Currently running in Sandbox Test Mode. No real charges are processed until official merchant credentials are configured.'}
              </p>
            </div>
          </div>
          <p className="text-xs text-neutral-500">
            Support Hotline: +255 800 110 000 · Email: support@oilcom-demo.tz
          </p>
        </div>
      )}

      {section === 'legal' && (
        <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
          <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#F5B800]" />
            {t(lang, 'privacyPolicy')} & {t(lang, 'termsConditions')}
          </h3>
          <p>
            OILCOM SUPER APP protects personal identifiers (name, phone, email, addresses) using role-based access control and Firestore security isolation. Loyalty points and payment settlements are server-validated and auditable.
          </p>
          <p>
            Location discovery features integrate Google Maps Platform and are subject to the{' '}
            <a
              href="https://maps.google.com/help/terms_maps/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold"
            >
              Google Maps End User Additional Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold"
            >
              Google Privacy Policy
            </a>
            . Geolocation permission is optional and revocable at any time in your browser settings.
          </p>
        </div>
      )}
      </div>

      <MapLocationPickerModal
        lang={lang}
        open={mapPickerOpen}
        googleMapsApiKey={googleMapsApiKey}
        initialAddress={addrForm.street}
        onClose={() => setMapPickerOpen(false)}
        onConfirm={({ street, city }) => {
          setAddrForm((prev) => ({
            ...prev,
            street: street.slice(0, 195),
            city: city.slice(0, 75),
          }));
        }}
      />
    </div>
  );
}
