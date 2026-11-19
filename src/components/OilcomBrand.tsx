import React from 'react';

const LOGO_EMBLEM_SRC =
  '/assets/aistudio/WhatsApp_Image_2026-11-19_at_11.42.43_PM__1__540aa468.jpeg';
const LOGO_FULL_SRC =
  '/assets/aistudio/WhatsApp_Image_2026-11-19_at_11.42.43_PM__2__0324a464.jpeg';
const LOGO_WORDMARK_SRC =
  '/assets/aistudio/WhatsApp_Image_2026-11-19_at_11.42.43_PM_11f962f3.jpeg';

export function OilcomCamelMark({
  className = 'w-9 h-9',
}: {
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl bg-black overflow-hidden border border-[#F5B800]/45 shadow-sm shrink-0 ${className}`}
    >
      <img
        src={LOGO_EMBLEM_SRC}
        alt="OILCOM Emblem"
        className="w-full h-full object-contain scale-[1.32]"
      />
    </span>
  );
}

export function OilcomFullLogo({
  className = 'w-36 h-36',
}: {
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-2xl bg-black overflow-hidden border border-[#F5B800]/45 shadow-xl p-1 shrink-0 ${className}`}
    >
      <img
        src={LOGO_FULL_SRC}
        alt="OILCOM Official Logo"
        className="w-full h-full object-contain"
      />
    </span>
  );
}

export function OilcomWordmark({
  className = 'w-28 h-8',
}: {
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-black overflow-hidden border border-white/15 px-1.5 shrink-0 ${className}`}
    >
      <img
        src={LOGO_WORDMARK_SRC}
        alt="Oilcom"
        className="w-full h-full object-cover object-center"
      />
    </span>
  );
}

export function GasCylinderGraphic({
  sizeKg = 15,
  className = 'w-14 h-16',
}: {
  sizeKg?: number;
  className?: string;
}) {
  const scale = sizeKg <= 6 ? 0.85 : sizeKg >= 38 ? 1.08 : 1;
  return (
    <svg
      viewBox="0 0 64 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ transform: `scale(${scale})` }}
      aria-hidden="true"
    >
      <rect x="24" y="6" width="16" height="8" rx="3" fill="#D92027" />
      <path d="M20 12C20 8.5 22.5 6 26 6H38C41.5 6 44 8.5 44 12V16H20V12Z" stroke="#F5B800" strokeWidth="2.5" />
      <rect x="29" y="13" width="6" height="5" fill="#D92027" />
      <rect x="14" y="18" width="36" height="44" rx="14" fill="#13419E" stroke="#0B2A6F" strokeWidth="2" />
      <rect x="14" y="34" width="36" height="10" fill="#F5B800" />
      <rect x="18" y="60" width="28" height="6" rx="2" fill="#0B2A6F" />
      <text
        x="32"
        y="41.5"
        textAnchor="middle"
        fill="#0B2A6F"
        fontSize="8.5"
        fontWeight="800"
        fontFamily="sans-serif"
      >
        {sizeKg}KG
      </text>
    </svg>
  );
}

export function formatTzs(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `TZS ${safe.toLocaleString('en-US')}`;
}

export function formatTimestamp(ts: unknown): string {
  if (!ts) return '—';
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts) {
    const d = (ts as { toDate: () => Date }).toDate();
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  }
  return '—';
}
