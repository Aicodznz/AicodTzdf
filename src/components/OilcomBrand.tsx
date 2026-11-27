import React, { useEffect, useState } from 'react';

const LOGO_EMBLEM_SRC =
  '/assets/aistudio/Glossy_Camel_Crest_Emblem_a2cca961.png';
const LOGO_OFFICIAL_SRC =
  '/assets/aistudio/Glossy_Oilcom_Logo_with_Camel_Emblem_5b45621d.png';
export const OILCOM_LPG_CYLINDERS_SRC =
  '/assets/aistudio/Vibrant_O-GAS_Cylinder_Display-removebg-preview_fe4ed4a1.png';

let cachedTransparentEmblemUrl: string | null = null;
let transparentEmblemPromise: Promise<string> | null = null;

let cachedTransparentWordmarkUrl: string | null = null;
let transparentWordmarkPromise: Promise<string> | null = null;

function cropOpaqueBounds(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  imageData: ImageData,
  fallbackSrc: string
): string {
  ctx.putImageData(imageData, 0, 0);
  const data = imageData.data;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX > minX && maxY > minY) {
    const pad = 2;
    const cropX = Math.max(0, minX - pad);
    const cropY = Math.max(0, minY - pad);
    const cropW = Math.min(w, maxX + pad + 1) - cropX;
    const cropH = Math.min(h, maxY + pad + 1) - cropY;
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d');
    if (cropCtx) {
      cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      return cropCanvas.toDataURL('image/png');
    }
  }

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return fallbackSrc;
  }
}

function buildTransparentEmblem(src: string): Promise<string> {
  if (cachedTransparentEmblemUrl) {
    return Promise.resolve(cachedTransparentEmblemUrl);
  }
  if (transparentEmblemPromise) {
    return transparentEmblemPromise;
  }

  transparentEmblemPromise = new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(src);
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(src);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const total = w * h;
        const bgMask = new Uint8Array(total);
        const queue = new Int32Array(total);
        let head = 0;
        let tail = 0;

        const isNearWhite = (p: number): boolean => {
          const i = p * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const minC = Math.min(r, g, b);
          const maxC = Math.max(r, g, b);
          return minC >= 224 && maxC - minC <= 22;
        };

        const enqueueIfBg = (x: number, y: number) => {
          if (x < 0 || x >= w || y < 0 || y >= h) return;
          const p = y * w + x;
          if (bgMask[p] !== 0) return;
          if (isNearWhite(p)) {
            bgMask[p] = 1;
            queue[tail++] = p;
          }
        };

        for (let x = 0; x < w; x++) {
          enqueueIfBg(x, 0);
          enqueueIfBg(x, h - 1);
        }
        for (let y = 0; y < h; y++) {
          enqueueIfBg(0, y);
          enqueueIfBg(w - 1, y);
        }

        while (head < tail) {
          const p = queue[head++];
          const x = p % w;
          const y = (p - x) / w;
          enqueueIfBg(x + 1, y);
          enqueueIfBg(x - 1, y);
          enqueueIfBg(x, y + 1);
          enqueueIfBg(x, y - 1);
        }

        for (let p = 0; p < total; p++) {
          const i = p * 4;
          if (bgMask[p] === 1) {
            data[i + 3] = 0;
            continue;
          }

          const x = p % w;
          const y = (p - x) / w;
          const touchesBg =
            (x > 0 && bgMask[p - 1] === 1) ||
            (x < w - 1 && bgMask[p + 1] === 1) ||
            (y > 0 && bgMask[p - w] === 1) ||
            (y < h - 1 && bgMask[p + w] === 1);

          if (touchesBg) {
            const minC = Math.min(data[i], data[i + 1], data[i + 2]);
            const maxC = Math.max(data[i], data[i + 1], data[i + 2]);
            if (minC > 135 && maxC - minC <= 26) {
              const alphaNorm = Math.min(1, Math.max(0.08, (245 - minC) / 110));
              data[i + 3] = Math.round(alphaNorm * 255);
            }
          }
        }

        const resultUrl = cropOpaqueBounds(canvas, ctx, w, h, imageData, src);
        cachedTransparentEmblemUrl = resultUrl;
        resolve(resultUrl);
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });

  return transparentEmblemPromise;
}

function buildTransparentWordmark(src: string): Promise<string> {
  if (cachedTransparentWordmarkUrl) {
    return Promise.resolve(cachedTransparentWordmarkUrl);
  }
  if (transparentWordmarkPromise) {
    return transparentWordmarkPromise;
  }

  transparentWordmarkPromise = new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(src);
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(src);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const total = w * h;
        const bgMask = new Uint8Array(total);
        const queue = new Int32Array(total);
        let head = 0;
        let tail = 0;

        const isNearBlack = (p: number): boolean => {
          const i = p * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          return maxC <= 34 || (maxC <= 52 && maxC - minC <= 14);
        };

        const enqueueIfBg = (x: number, y: number) => {
          if (x < 0 || x >= w || y < 0 || y >= h) return;
          const p = y * w + x;
          if (bgMask[p] !== 0) return;
          if (isNearBlack(p)) {
            bgMask[p] = 1;
            queue[tail++] = p;
          }
        };

        // Seed outer perimeter
        for (let x = 0; x < w; x++) {
          enqueueIfBg(x, 0);
          enqueueIfBg(x, h - 1);
        }
        for (let y = 0; y < h; y++) {
          enqueueIfBg(0, y);
          enqueueIfBg(w - 1, y);
        }

        // Seed enclosed black counter-holes ('O' and 'o') while protecting camel droplet interior above 'i'
        const camelLeft = Math.floor(w * 0.27);
        const camelRight = Math.ceil(w * 0.42);
        const camelTop = Math.floor(h * 0.1);
        const camelBottom = Math.ceil(h * 0.4);

        for (let y = Math.floor(h * 0.3); y < Math.floor(h * 0.68); y += 2) {
          for (let x = Math.floor(w * 0.05); x < Math.floor(w * 0.95); x += 2) {
            if (
              x >= camelLeft &&
              x <= camelRight &&
              y >= camelTop &&
              y <= camelBottom
            ) {
              continue;
            }
            const p = y * w + x;
            if (bgMask[p] === 0) {
              const i = p * 4;
              const maxC = Math.max(data[i], data[i + 1], data[i + 2]);
              const minC = Math.min(data[i], data[i + 1], data[i + 2]);
              if (maxC <= 26 && maxC - minC <= 10) {
                bgMask[p] = 1;
                queue[tail++] = p;
              }
            }
          }
        }

        while (head < tail) {
          const p = queue[head++];
          const x = p % w;
          const y = (p - x) / w;
          enqueueIfBg(x + 1, y);
          enqueueIfBg(x - 1, y);
          enqueueIfBg(x, y + 1);
          enqueueIfBg(x, y - 1);
        }

        // Make background transparent + smooth 1px edge un-premultiply so no black halo remains
        for (let p = 0; p < total; p++) {
          const i = p * 4;
          if (bgMask[p] === 1) {
            data[i + 3] = 0;
            continue;
          }

          const x = p % w;
          const y = (p - x) / w;
          const touchesBg =
            (x > 0 && bgMask[p - 1] === 1) ||
            (x < w - 1 && bgMask[p + 1] === 1) ||
            (y > 0 && bgMask[p - w] === 1) ||
            (y < h - 1 && bgMask[p + w] === 1);

          if (touchesBg) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const maxC = Math.max(r, g, b);
            if (maxC < 120) {
              const alphaNorm = Math.min(1, Math.max(0.08, (maxC - 20) / 100));
              data[i] = Math.min(255, Math.round(r / alphaNorm));
              data[i + 1] = Math.min(255, Math.round(g / alphaNorm));
              data[i + 2] = Math.min(255, Math.round(b / alphaNorm));
              data[i + 3] = Math.round(alphaNorm * 255);
            }
          }
        }

        const resultUrl = cropOpaqueBounds(canvas, ctx, w, h, imageData, src);
        cachedTransparentWordmarkUrl = resultUrl;
        resolve(resultUrl);
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });

  return transparentWordmarkPromise;
}

function useTransparentEmblemLogo(): string | null {
  const [url, setUrl] = useState<string | null>(cachedTransparentEmblemUrl);

  useEffect(() => {
    let active = true;
    if (cachedTransparentEmblemUrl) {
      setUrl(cachedTransparentEmblemUrl);
      return;
    }
    void buildTransparentEmblem(LOGO_EMBLEM_SRC).then((resolved) => {
      if (active) setUrl(resolved);
    });
    return () => {
      active = false;
    };
  }, []);

  return url;
}

function useTransparentOfficialLogo(): string | null {
  const [url, setUrl] = useState<string | null>(cachedTransparentWordmarkUrl);

  useEffect(() => {
    let active = true;
    if (cachedTransparentWordmarkUrl) {
      setUrl(cachedTransparentWordmarkUrl);
      return;
    }
    void buildTransparentWordmark(LOGO_OFFICIAL_SRC).then((resolved) => {
      if (active) setUrl(resolved);
    });
    return () => {
      active = false;
    };
  }, []);

  return url;
}

export function OilcomCamelMark({
  className = 'w-10 h-10',
}: {
  className?: string;
}) {
  const transparentEmblem = useTransparentEmblemLogo();

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
    >
      <img
        src={transparentEmblem || LOGO_EMBLEM_SRC}
        alt="OILCOM Emblem"
        className={`w-full h-full object-contain drop-shadow-[0_2px_8px_rgba(255,255,255,0.28)] transition-opacity duration-150 ${
          transparentEmblem ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </span>
  );
}

export function OilcomFullLogo({
  className = 'w-60',
}: {
  className?: string;
}) {
  const transparentEmblem = useTransparentEmblemLogo();
  const transparentWordmark = useTransparentOfficialLogo();

  return (
    <span
      className={`inline-flex flex-col items-center justify-center gap-2 shrink-0 ${className}`}
    >
      <img
        src={transparentEmblem || LOGO_EMBLEM_SRC}
        alt="OILCOM Camel Emblem"
        className={`w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-[0_4px_16px_rgba(255,255,255,0.28)] transition-opacity duration-150 ${
          transparentEmblem ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <img
        src={transparentWordmark || LOGO_OFFICIAL_SRC}
        alt="OILCOM Official Logo"
        className={`w-full h-auto max-h-20 object-contain drop-shadow-[0_2px_12px_rgba(255,255,255,0.38)] transition-opacity duration-150 ${
          transparentWordmark ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </span>
  );
}

export function OilcomWordmark({
  className = 'h-10',
}: {
  className?: string;
}) {
  const transparentEmblem = useTransparentEmblemLogo();
  const transparentWordmark = useTransparentOfficialLogo();

  return (
    <span
      className={`inline-flex items-center gap-1.5 shrink-0 ${className}`}
    >
      <img
        src={transparentEmblem || LOGO_EMBLEM_SRC}
        alt="OILCOM Camel"
        className={`h-full w-auto aspect-square object-contain drop-shadow-[0_2px_6px_rgba(255,255,255,0.28)] shrink-0 transition-opacity duration-150 ${
          transparentEmblem ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <img
        src={transparentWordmark || LOGO_OFFICIAL_SRC}
        alt="Oilcom"
        className={`h-[94%] w-auto object-contain drop-shadow-[0_1px_10px_rgba(255,255,255,0.42)] transition-opacity duration-150 ${
          transparentWordmark ? 'opacity-100' : 'opacity-0'
        }`}
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
      <rect x="24" y="6" width="16" height="8" rx="3" fill="#FFD028" />
      <path d="M20 12C20 8.5 22.5 6 26 6H38C41.5 6 44 8.5 44 12V16H20V12Z" stroke="#EAB308" strokeWidth="2.5" />
      <rect x="29" y="13" width="6" height="5" fill="#D97706" />
      <rect x="14" y="18" width="36" height="44" rx="14" fill="#FFD028" stroke="#CA8A04" strokeWidth="2" />
      <rect x="14" y="34" width="36" height="10" fill="#0B2A6F" />
      <rect x="18" y="60" width="28" height="6" rx="2" fill="#CA8A04" />
      <text
        x="32"
        y="41.5"
        textAnchor="middle"
        fill="#FFFFFF"
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
