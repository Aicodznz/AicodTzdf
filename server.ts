import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createServer as createViteServer } from 'vite';

const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8')) as {
  projectId: string;
};

const adminApp = getApps().length
  ? getApp()
  : initializeApp({ projectId: firebaseConfig.projectId });
const adminAuth = getAuth(adminApp);

const HMAC_SECRET =
  process.env.OILCOM_HMAC_SECRET || crypto.randomBytes(32).toString('hex');

const usedQrNonces = new Map<string, number>();
const idempotencyCache = new Map<string, { expiresAt: number; body: unknown }>();
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function cleanupCaches(): void {
  const now = Date.now();
  for (const [key, exp] of usedQrNonces.entries()) {
    if (exp < now) usedQrNonces.delete(key);
  }
  for (const [key, val] of idempotencyCache.entries()) {
    if (val.expiresAt < now) idempotencyCache.delete(key);
  }
  for (const [key, bucket] of rateBuckets.entries()) {
    if (bucket.resetAt < now) rateBuckets.delete(key);
  }
}

setInterval(cleanupCaches, 60_000).unref();

function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please wait a moment before retrying.',
      });
      return;
    }
    bucket.count += 1;
    next();
  };
}

interface AuthedRequest extends Request {
  authUid?: string;
  authEmail?: string;
}

async function verifyFirebaseBearer(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Bearer authentication token.' });
    return;
  }
  const token = header.slice(7).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.authUid = decoded.uid;
    req.authEmail = decoded.email || '';
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

function signPayload(data: string): string {
  return crypto.createHmac('sha256', HMAC_SECRET).update(data).digest('hex');
}

function safeCompareHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'oilcom-super-app', mode: 'sandbox-ready' });
  });

  app.get('/api/public-config', (_req: Request, res: Response) => {
    const mapsKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      '';
    res.json({
      googleMapsApiKey: mapsKey,
      sandboxMode: true,
    });
  });

  // Issue cryptographically signed Loyalty QR payload (10-minute TTL, single-use nonce)
  app.post(
    '/api/qr/issue',
    rateLimit(30, 60_000),
    verifyFirebaseBearer,
    (req: AuthedRequest, res: Response) => {
      const customerCode = String(req.body?.customerCode || '').trim();
      if (!/^[A-Z0-9\-]{4,32}$/.test(customerCode)) {
        res.status(400).json({ error: 'Valid customerCode is required.' });
        return;
      }
      const issuedAt = Date.now();
      const expiresAt = issuedAt + 10 * 60 * 1000;
      const nonce = crypto.randomBytes(12).toString('hex');
      const raw = `${req.authUid}|${customerCode}|${issuedAt}|${expiresAt}|${nonce}`;
      const sig = signPayload(raw);
      const tokenObj = {
        v: 1,
        uid: req.authUid,
        code: customerCode,
        iat: issuedAt,
        exp: expiresAt,
        nonce,
        sig,
      };
      const qrToken = `OILCOM-QR:${Buffer.from(JSON.stringify(tokenObj)).toString('base64url')}`;
      res.json({
        qrToken,
        expiresAt,
        nonce,
      });
    }
  );

  // Verify signed Loyalty QR code on server (prevents tampering & duplicate replay)
  app.post(
    '/api/qr/verify',
    rateLimit(20, 60_000),
    verifyFirebaseBearer,
    (req: AuthedRequest, res: Response) => {
      const qrToken = String(req.body?.qrToken || '').trim();
      const amountTzs = Number(req.body?.amountTzs || 0);
      const pointsPer1000 = Number(req.body?.pointsPer1000Tzs || 10);

      if (!qrToken.startsWith('OILCOM-QR:')) {
        res.status(400).json({ error: 'Invalid OILCOM QR token format.' });
        return;
      }
      if (!Number.isFinite(amountTzs) || amountTzs <= 0 || amountTzs > 50_000_000) {
        res.status(400).json({ error: 'Purchase amount must be positive.' });
        return;
      }

      let parsed: {
        v: number;
        uid: string;
        code: string;
        iat: number;
        exp: number;
        nonce: string;
        sig: string;
      };
      try {
        const b64 = qrToken.slice('OILCOM-QR:'.length);
        parsed = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
      } catch {
        res.status(400).json({ error: 'Malformed QR payload.' });
        return;
      }

      if (
        !parsed.uid ||
        !parsed.code ||
        !parsed.nonce ||
        !parsed.sig ||
        typeof parsed.exp !== 'number'
      ) {
        res.status(400).json({ error: 'Incomplete QR fields.' });
        return;
      }

      if (Date.now() > parsed.exp) {
        res.status(400).json({ error: 'QR code has expired. Ask customer to refresh QR.' });
        return;
      }

      const raw = `${parsed.uid}|${parsed.code}|${parsed.iat}|${parsed.exp}|${parsed.nonce}`;
      const expectedSig = signPayload(raw);
      if (!safeCompareHex(parsed.sig, expectedSig)) {
        res.status(403).json({ error: 'QR signature verification failed.' });
        return;
      }

      if (usedQrNonces.has(parsed.nonce)) {
        res.status(409).json({
          error: 'Duplicate QR scan blocked: this QR nonce was already redeemed.',
        });
        return;
      }

      usedQrNonces.set(parsed.nonce, parsed.exp + 3_600_000);
      const pointsAwarded = Math.max(
        1,
        Math.floor((amountTzs / 1000) * Math.max(1, pointsPer1000))
      );

      res.json({
        verified: true,
        customerUid: parsed.uid,
        customerCode: parsed.code,
        nonce: parsed.nonce,
        pointsAwarded,
        verifiedAt: new Date().toISOString(),
      });
    }
  );

  // Sandbox Payment Initiation (M-Pesa, Airtel Money, Mixx by Yas, Bank, COD)
  app.post(
    '/api/payments/sandbox-initiate',
    rateLimit(15, 60_000),
    verifyFirebaseBearer,
    (req: AuthedRequest, res: Response) => {
      const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
      if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
        const cached = idempotencyCache.get(idempotencyKey)!;
        res.json(cached.body);
        return;
      }

      const provider = String(req.body?.provider || '');
      const amountTzs = Number(req.body?.amountTzs || 0);
      const phoneOrRef = String(req.body?.phoneOrRef || '').trim();
      const orderId = String(req.body?.orderId || '').trim();

      const validProviders = ['mpesa', 'airtel_money', 'mixx_by_yas', 'bank', 'cod'];
      if (!validProviders.includes(provider)) {
        res.status(400).json({ error: 'Unsupported payment provider.' });
        return;
      }
      if (!Number.isFinite(amountTzs) || amountTzs <= 0) {
        res.status(400).json({ error: 'Invalid payment amount.' });
        return;
      }
      if (phoneOrRef.length < 3 || !orderId) {
        res.status(400).json({ error: 'Order ID and phone/account reference are required.' });
        return;
      }

      const sandboxRef = `SBX-${provider.toUpperCase().slice(0, 4)}-${crypto
        .randomBytes(4)
        .toString('hex')
        .toUpperCase()}`;
      const issuedAt = Date.now();
      const callbackToken = signPayload(`${sandboxRef}|${orderId}|${amountTzs}|${req.authUid}`);

      const responseBody = {
        mode: 'SANDBOX_TEST',
        status: 'pending',
        sandboxRef,
        provider,
        amountTzs,
        issuedAt,
        callbackSignature: callbackToken,
        notice: 'Sandbox Test Mode active. Real carrier settlement is disabled until merchant credentials are configured.',
      };

      if (idempotencyKey) {
        idempotencyCache.set(idempotencyKey, {
          expiresAt: Date.now() + 5 * 60_000,
          body: responseBody,
        });
      }

      res.json(responseBody);
    }
  );

  // Verify Sandbox Payment Callback Signature on Server
  app.post(
    '/api/payments/sandbox-callback',
    rateLimit(15, 60_000),
    verifyFirebaseBearer,
    (req: AuthedRequest, res: Response) => {
      const sandboxRef = String(req.body?.sandboxRef || '').trim();
      const orderId = String(req.body?.orderId || '').trim();
      const amountTzs = Number(req.body?.amountTzs || 0);
      const outcome = req.body?.outcome === 'failed' ? 'failed' : 'successful';
      const callbackSignature = String(req.body?.callbackSignature || '').trim();
      const targetUserId = String(req.body?.targetUserId || req.authUid || '').trim();

      const expected = signPayload(`${sandboxRef}|${orderId}|${amountTzs}|${targetUserId}`);
      if (!callbackSignature || !safeCompareHex(callbackSignature, expected)) {
        res.status(403).json({
          verified: false,
          error: 'Sandbox callback signature mismatch.',
        });
        return;
      }

      res.json({
        verified: true,
        mode: 'SANDBOX_TEST',
        sandboxRef,
        status: outcome,
        verifiedAt: new Date().toISOString(),
      });
    }
  );

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr:
          process.env.DISABLE_HMR === 'true'
            ? false
            : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`OILCOM SUPER APP server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
