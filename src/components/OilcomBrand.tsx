import React from 'react';

export function OilcomCamelMark({
  className = 'w-9 h-9',
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="OILCOM Camel Mark"
    >
      <path
        d="M52.5 11.5C50.8 10.6 48.5 11 47.4 12.6L43.2 18.8C41.8 20.8 39.4 21.8 37 21.2C35.2 20.7 33.8 18.5 32.1 15.2C30.1 11.4 27.6 8.5 23.8 8.5C19.9 8.5 17.5 11.6 15.8 15.8C14.3 19.4 11.8 21.2 9.2 22.3C7.4 23.1 6.4 25.1 6.7 27.1L7.3 31.2C7.4 31.9 8.1 32.4 8.8 32.2C9.4 32 9.8 31.4 9.7 30.8L9.3 27.8C10.5 27.2 12 27.4 12.9 28.4L13.4 42.5C13.4 43.3 14.1 44 14.9 44H16.6C17.4 44 18.1 43.3 18.1 42.5V31.6C19.8 32.1 22.4 32.3 25.1 32.1L25.5 42.5C25.5 43.3 26.2 44 27 44H28.7C29.5 44 30.2 43.3 30.2 42.5L29.9 31.4C31.9 30.8 33.7 29.8 35.1 28.6L35.7 42.5C35.7 43.3 36.4 44 37.2 44H38.9C39.7 44 40.4 43.3 40.4 42.5L40.1 27.4C42.9 26.8 45.4 25 46.9 22.1L50.1 15.9L53.6 16.4C55.1 16.6 56.5 15.6 56.7 14.1C56.9 12.9 55.9 11.7 54.6 11.6L52.5 11.5Z"
        fill="#F5B800"
      />
      <circle cx="52.6" cy="13.2" r="0.9" fill="#08291A" />
    </svg>
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
      <rect x="24" y="6" width="16" height="8" rx="3" fill="#0B3B24" />
      <path d="M20 12C20 8.5 22.5 6 26 6H38C41.5 6 44 8.5 44 12V16H20V12Z" stroke="#F5B800" strokeWidth="2.5" />
      <rect x="29" y="13" width="6" height="5" fill="#F5B800" />
      <rect x="14" y="18" width="36" height="44" rx="14" fill="#0D4028" stroke="#165B3A" strokeWidth="2" />
      <rect x="14" y="34" width="36" height="10" fill="#F5B800" />
      <rect x="18" y="60" width="28" height="6" rx="2" fill="#072215" />
      <text
        x="32"
        y="41.5"
        textAnchor="middle"
        fill="#08291A"
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
