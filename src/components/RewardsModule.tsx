import React, { useCallback, useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  Check,
  Copy,
  Gift,
  RefreshCw,
  ShieldCheck,
  Share2,
  Ticket,
} from 'lucide-react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { t } from '../i18n/translations';
import { issueSignedQr } from '../lib/api';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { submitRewardRedemption } from '../lib/firestoreActions';
import type {
  CustomerProfile,
  Language,
  OilcomUser,
  Promotion,
  RewardsAccount,
  RewardsTransaction,
  SystemSettings,
  UserRole,
  Voucher,
} from '../types/oilcom';
import { formatTimestamp, formatTzs } from './OilcomBrand';

interface RewardsModuleProps {
  lang: Language;
  user: OilcomUser;
  effectiveRole: UserRole;
  profile: CustomerProfile | null;
  rewards: RewardsAccount | null;
  transactions: RewardsTransaction[];
  vouchers: Voucher[];
  promotions: Promotion[];
  settings: SystemSettings;
}

const REWARD_CATALOG = [
  {
    id: 'rw_500',
    titleSw: 'Vocha ya Gesi 6kg/15kg (TZS 5,000)',
    titleEn: 'LPG Cylinder Voucher (TZS 5,000)',
    pointsCost: 500,
    discountTzs: 5000,
  },
  {
    id: 'rw_1000',
    titleSw: 'Vocha ya Mafuta Kituoni (TZS 12,000)',
    titleEn: 'Fuel Pump Discount Voucher (TZS 12,000)',
    pointsCost: 1000,
    discountTzs: 12000,
  },
  {
    id: 'rw_2500',
    titleSw: 'Huduma ya Oil Service & Filter (TZS 30,000)',
    titleEn: 'Oil Change & Filter Service (TZS 30,000)',
    pointsCost: 2500,
    discountTzs: 30000,
  },
];

export function RewardsModule({
  lang,
  user,
  effectiveRole,
  profile,
  rewards,
  transactions,
  vouchers,
  promotions,
  settings,
}: RewardsModuleProps) {
  const [qrToken, setQrToken] = useState('');
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [redeemBusy, setRedeemBusy] = useState<string | null>(null);
  const [redeemFeedback, setRedeemFeedback] = useState('');
  const [refInput, setRefInput] = useState('');
  const [refStatus, setRefStatus] = useState('');

  const customerCode =
    rewards?.customerCode ||
    profile?.customerCode ||
    `OIL-${user.uid.slice(0, 6).toUpperCase()}`;

  const loadSignedQr = useCallback(async () => {
    setQrLoading(true);
    setQrError('');
    try {
      const data = await issueSignedQr(customerCode);
      setQrToken(data.qrToken);
      setExpiresAt(data.expiresAt);
    } catch (err) {
      setQrError(err instanceof Error ? err.message : 'Unable to issue QR.');
    } finally {
      setQrLoading(false);
    }
  }, [customerCode]);

  useEffect(() => {
    loadSignedQr();
  }, [loadSignedQr]);

  const copyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRedeem = async (item: (typeof REWARD_CATALOG)[number]) => {
    setRedeemFeedback('');
    const balance = rewards?.pointsBalance ?? 0;
    if (balance < item.pointsCost) {
      setRedeemFeedback(
        lang === 'sw'
          ? `Unahitaji pointi ${item.pointsCost} (una pointi ${balance}).`
          : `You need ${item.pointsCost} points (current balance: ${balance}).`
      );
      return;
    }

    setRedeemBusy(item.id);
    try {
      const canApproveDirectly =
        effectiveRole === 'admin' || effectiveRole === 'agent';
      await submitRewardRedemption({
        userId: user.uid,
        customerCode,
        pointsCost: item.pointsCost,
        title: lang === 'sw' ? item.titleSw : item.titleEn,
        discountTzs: item.discountTzs,
        canApproveDirectly,
      });
      setRedeemFeedback(
        canApproveDirectly
          ? lang === 'sw'
            ? 'Vocha imetolewa na pointi zimekatwa!'
            : 'Voucher activated and points deducted!'
          : lang === 'sw'
            ? 'Ombi limetumwa! Wakala au Msimamizi atalithibitisha.'
            : 'Redemption request submitted for Agent/Admin verification.'
      );
    } catch (err) {
      setRedeemFeedback(err instanceof Error ? err.message : 'Redemption error.');
    } finally {
      setRedeemBusy(null);
    }
  };

  const handleSaveReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = refInput.trim().toUpperCase();
    if (cleaned.length < 4) return;
    try {
      await updateDoc(doc(db, 'customer_profiles', user.uid), {
        referredBy: cleaned.slice(0, 32),
        updatedAt: serverTimestamp(),
      });
      setRefStatus(
        lang === 'sw'
          ? `Msimbo wa rafiki (${cleaned}) umehifadhiwa.`
          : `Referral code (${cleaned}) linked to your profile.`
      );
      setRefInput('');
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `customer_profiles/${user.uid}`
      );
    }
  };

  return (
    <div className="space-y-3.5 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
            OILCOM Rewards
          </h1>
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
            {lang === 'sw'
              ? `Kiwango: Pointi ${settings.pointsPer1000Tzs} kwa kila TZS 1,000 (Inaweza kubadilishwa na Admin)`
              : `Earn Rate: ${settings.pointsPer1000Tzs} pts per TZS 1,000 (Admin configurable)`}
          </p>
        </div>
        <div className="text-xs font-mono-num font-semibold text-neutral-600 dark:text-neutral-300">
          ID: {customerCode} · {rewards?.tier || 'Bronze'}
        </div>
      </div>

      {/* Points + Signed QR Code Split */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3.5 sm:gap-6">
        <div className="lg:col-span-2 min-w-0 rounded-2xl bg-[#08291A] text-white p-4 sm:p-6 flex flex-col items-center text-center justify-between">
          <div className="w-full flex items-center justify-between text-xs text-emerald-200/80 mb-3 sm:mb-4">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#F5B800]" />
              {lang === 'sw' ? 'QR Iliyosainiwa' : 'HMAC Signed QR'}
            </span>
            <button
              type="button"
              onClick={loadSignedQr}
              disabled={qrLoading}
              className="flex items-center gap-1 text-[#F5B800] hover:underline cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${qrLoading ? 'animate-spin' : ''}`} />
              {t(lang, 'refreshQr')}
            </button>
          </div>

          <div className="bg-white p-3.5 sm:p-4 rounded-2xl shadow-sm">
            {qrToken ? (
              <QRCodeCanvas value={qrToken} size={184} level="M" />
            ) : qrLoading ? (
              <div className="w-[184px] h-[184px] flex flex-col items-center justify-center gap-2 text-xs text-neutral-500">
                <RefreshCw className="w-5 h-5 animate-spin text-[#08291A]" />
                <span>{t(lang, 'loading')}</span>
              </div>
            ) : (
              <QRCodeCanvas
                value={`OILCOM-ID:${customerCode}`}
                size={184}
                level="M"
              />
            )}
          </div>

          <div className="mt-3 sm:mt-4 w-full">
            <p className="font-mono-num text-sm font-bold text-[#F5B800]">
              {customerCode}
            </p>
            <p className="text-xs text-emerald-100/75 mt-1">
              {qrToken && expiresAt
                ? `${lang === 'sw' ? 'Inaisha' : 'Expires'}: ${new Date(expiresAt).toLocaleTimeString()}`
                : qrError
                  ? lang === 'sw'
                    ? 'QR ya Msimbo wa Mteja (Bofya Sasisha QR kupata token iliyosainiwa)'
                    : 'Customer ID QR active (Tap Refresh QR for signed HMAC token)'
                  : ''}
            </p>
            {qrToken ? (
              <button
                type="button"
                onClick={() => copyText('qr', qrToken)}
                className="mt-3 w-full py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedKey === 'qr' ? (
                  <Check className="w-3.5 h-3.5 text-[#F5B800]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {lang === 'sw'
                  ? 'Nakili Token ya QR kwa Wakala'
                  : 'Copy Signed QR Token'}
              </button>
            ) : (
              qrError && (
                <button
                  type="button"
                  onClick={loadSignedQr}
                  disabled={qrLoading}
                  className="mt-3 w-full py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer text-[#F5B800]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${qrLoading ? 'animate-spin' : ''}`} />
                  {lang === 'sw' ? 'Jaribu Kupata QR Iliyosainiwa' : 'Retry Signed QR'}
                </button>
              )
            )}
          </div>
        </div>

        {/* Balance, Tiers & Referral */}
        <div className="lg:col-span-3 space-y-3.5 sm:space-y-4 min-w-0">
          <div className="rounded-2xl bg-[#F5B800] text-[#0b120e] p-4 sm:p-6 grid grid-cols-3 gap-2 sm:gap-4">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-bold uppercase opacity-75 truncate">
                {t(lang, 'pointsLabel')}
              </p>
              <p className="font-mono-num text-xl sm:text-3xl font-extrabold mt-0.5 sm:mt-1 truncate">
                {(rewards?.pointsBalance ?? 0).toLocaleString('en-US')}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-bold uppercase opacity-75 truncate">
                {lang === 'sw' ? 'Jumla ya Maisha' : 'Lifetime Pts'}
              </p>
              <p className="font-mono-num text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 truncate">
                {(rewards?.lifetimePoints ?? 0).toLocaleString('en-US')}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-bold uppercase opacity-75 truncate">
                {lang === 'sw' ? 'Daraja (Tier)' : 'Loyalty Tier'}
              </p>
              <p className="font-display text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 truncate">
                {rewards?.tier || 'Bronze'}
              </p>
            </div>
          </div>

          {/* Referral Card */}
          <div className="rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="min-w-0">
                <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-[#F5B800] shrink-0" />
                  {t(lang, 'referralTitle')}
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {lang === 'sw'
                    ? 'Shiriki msimbo wako au weka msimbo wa aliyekualika.'
                    : 'Share your referral code or link the code of who invited you.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  copyText(
                    'ref',
                    profile?.referralCode || `CAMEL-${user.uid.slice(0, 5).toUpperCase()}`
                  )
                }
                className="px-3 py-2 rounded-xl bg-neutral-100 dark:bg-emerald-950/60 font-mono-num text-xs font-bold text-neutral-900 dark:text-[#F5B800] flex items-center gap-2 cursor-pointer shrink-0"
              >
                {profile?.referralCode || `CAMEL-${user.uid.slice(0, 5).toUpperCase()}`}
                {copiedKey === 'ref' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {!profile?.referredBy ? (
              <form onSubmit={handleSaveReferral} className="mt-3.5 flex gap-2">
                <input
                  type="text"
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                  placeholder="CAMEL-XXXXX"
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs font-mono-num uppercase"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#08291A] text-white text-xs font-semibold cursor-pointer shrink-0"
                >
                  {t(lang, 'submit')}
                </button>
              </form>
            ) : (
              <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">
                {lang === 'sw' ? 'Ulialikwa na:' : 'Referred by:'}{' '}
                <span className="font-mono-num font-semibold">{profile.referredBy}</span>
              </p>
            )}
            {refStatus && (
              <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                {refStatus}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Rewards Redemption Catalog */}
      <div className="rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
          <h2 className="font-display text-base sm:text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-[#F5B800] shrink-0" />
            {t(lang, 'redeemPoints')}
          </h2>
          {redeemFeedback && (
            <span className="text-xs font-medium text-emerald-700 dark:text-[#F5B800]">
              {redeemFeedback}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {REWARD_CATALOG.map((rw) => (
            <div
              key={rw.id}
              className="p-3.5 sm:p-4 rounded-xl border border-neutral-200 dark:border-emerald-950 flex flex-col justify-between gap-3"
            >
              <div>
                <p className="font-semibold text-sm text-neutral-900 dark:text-white leading-snug">
                  {lang === 'sw' ? rw.titleSw : rw.titleEn}
                </p>
                <p className="font-mono-num text-xs text-neutral-500 mt-1">
                  {rw.pointsCost} pts · {formatTzs(rw.discountTzs)}
                </p>
              </div>
              <button
                type="button"
                disabled={redeemBusy === rw.id}
                onClick={() => handleRedeem(rw)}
                className="w-full py-2 px-3 rounded-xl bg-[#08291A] hover:bg-[#0d3b26] text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {redeemBusy === rw.id ? t(lang, 'loading') : t(lang, 'redeemPoints')}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Digital Vouchers & Points History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-6">
        <div className="min-w-0 rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6">
          <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white flex items-center gap-2 mb-3 sm:mb-4">
            <Ticket className="w-4 h-4 text-[#F5B800]" />
            {lang === 'sw' ? 'Vocha Zangu za Kidijitali' : 'My Digital Vouchers'}
          </h3>
          {vouchers.length === 0 ? (
            <p className="text-xs text-neutral-500 py-5 text-center">
              {lang === 'sw' ? 'Huna vocha bado.' : 'No vouchers redeemed yet.'}
            </p>
          ) : (
            <div className="space-y-2.5 sm:space-y-3">
              {vouchers.map((v) => (
                <div
                  key={v.id}
                  className="p-3 sm:p-3.5 rounded-xl bg-neutral-50 dark:bg-emerald-950/30 border border-neutral-200 dark:border-emerald-900 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                      {v.title}
                    </p>
                    <p className="font-mono-num text-xs text-neutral-500">
                      {v.promoCode} · {v.status}
                    </p>
                  </div>
                  <span className="font-mono-num text-xs font-bold text-[#08291A] dark:text-[#F5B800] shrink-0">
                    {formatTzs(v.discountTzs)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6">
          <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white mb-3 sm:mb-4">
            {lang === 'sw' ? 'Historia ya Pointi' : 'Points Transaction History'}
          </h3>
          {transactions.length === 0 ? (
            <p className="text-xs text-neutral-500 py-5 text-center">
              {lang === 'sw'
                ? 'Hakuna miamala ya pointi bado.'
                : 'No points transactions yet.'}
            </p>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-emerald-950">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="py-2.5 sm:py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                      {tx.description}
                    </p>
                    <p className="text-[11px] text-neutral-500 truncate">
                      {tx.type} · {tx.status} · {formatTimestamp(tx.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`font-mono-num text-xs font-bold shrink-0 ${
                      tx.type === 'earn' || tx.type === 'referral_bonus'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-[#F5B800]'
                    }`}
                  >
                    {tx.type === 'earn' || tx.type === 'referral_bonus' ? '+' : '-'}
                    {tx.points} pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active Promotions */}
      {promotions.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6">
          <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white mb-3">
            {lang === 'sw' ? 'Promosheni Zinazoendelea' : 'Active Promotions'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {promotions.map((p) => (
              <div
                key={p.id}
                className="p-3.5 sm:p-4 rounded-xl bg-neutral-50 dark:bg-emerald-950/30 border border-neutral-200 dark:border-emerald-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                    {lang === 'sw' ? p.titleSw : p.titleEn}
                  </p>
                  <span className="font-mono-num text-xs font-bold text-[#08291A] dark:text-[#F5B800] shrink-0">
                    {p.pointsMultiplier}x
                  </span>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1 leading-snug">
                  {lang === 'sw' ? p.descriptionSw : p.descriptionEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
