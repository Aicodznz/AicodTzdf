import { auth } from './firebase';
import type { PaymentProvider } from '../types/oilcom';

async function getBearerHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required.');
  }
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(extra || {}),
  };
}

async function parseJsonResponse<T>(
  res: Response,
  fallbackError: string
): Promise<T> {
  const raw = await res.text();
  if (!raw || !raw.trim()) {
    throw new Error(`${fallbackError} (HTTP ${res.status || 0})`);
  }
  let parsed: (T & { error?: string }) | null = null;
  try {
    parsed = JSON.parse(raw) as T & { error?: string };
  } catch {
    throw new Error(`${fallbackError} (HTTP ${res.status || 0})`);
  }
  if (!res.ok) {
    throw new Error(parsed?.error || `${fallbackError} (HTTP ${res.status})`);
  }
  return parsed;
}

export async function fetchPublicConfig(): Promise<{
  googleMapsApiKey: string;
  sandboxMode: boolean;
}> {
  try {
    const res = await fetch('/api/public-config');
    if (!res.ok) {
      return { googleMapsApiKey: '', sandboxMode: true };
    }
    return await parseJsonResponse<{
      googleMapsApiKey: string;
      sandboxMode: boolean;
    }>(res, 'Config unavailable');
  } catch {
    return { googleMapsApiKey: '', sandboxMode: true };
  }
}

export async function issueSignedQr(customerCode: string): Promise<{
  qrToken: string;
  expiresAt: number;
  nonce: string;
}> {
  const headers = await getBearerHeaders();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch('/api/qr/issue', {
        method: 'POST',
        headers,
        body: JSON.stringify({ customerCode }),
      });
      return await parseJsonResponse<{
        qrToken: string;
        expiresAt: number;
        nonce: string;
      }>(res, 'Failed to issue QR code.');
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to issue QR code.');
}

export async function verifySignedQr(params: {
  qrToken: string;
  amountTzs: number;
  pointsPer1000Tzs: number;
}): Promise<{
  verified: boolean;
  customerUid: string;
  customerCode: string;
  nonce: string;
  pointsAwarded: number;
  verifiedAt: string;
}> {
  const headers = await getBearerHeaders();
  const res = await fetch('/api/qr/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  return parseJsonResponse<{
    verified: boolean;
    customerUid: string;
    customerCode: string;
    nonce: string;
    pointsAwarded: number;
    verifiedAt: string;
  }>(res, 'QR verification failed.');
}

export async function initiateSandboxPayment(
  params: {
    orderId: string;
    provider: PaymentProvider;
    amountTzs: number;
    phoneOrRef: string;
  },
  idempotencyKey: string
): Promise<{
  mode: 'SANDBOX_TEST';
  status: 'pending';
  sandboxRef: string;
  provider: PaymentProvider;
  amountTzs: number;
  issuedAt: number;
  callbackSignature: string;
  notice: string;
}> {
  const headers = await getBearerHeaders({ 'Idempotency-Key': idempotencyKey });
  const res = await fetch('/api/payments/sandbox-initiate', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  return parseJsonResponse<{
    mode: 'SANDBOX_TEST';
    status: 'pending';
    sandboxRef: string;
    provider: PaymentProvider;
    amountTzs: number;
    issuedAt: number;
    callbackSignature: string;
    notice: string;
  }>(res, 'Failed to initiate sandbox payment.');
}

export async function verifySandboxCallback(params: {
  sandboxRef: string;
  orderId: string;
  amountTzs: number;
  outcome: 'successful' | 'failed';
  callbackSignature: string;
  targetUserId?: string;
}): Promise<{
  verified: boolean;
  mode: 'SANDBOX_TEST';
  sandboxRef: string;
  status: 'successful' | 'failed';
  verifiedAt: string;
}> {
  const headers = await getBearerHeaders();
  const res = await fetch('/api/payments/sandbox-callback', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  return parseJsonResponse<{
    verified: boolean;
    mode: 'SANDBOX_TEST';
    sandboxRef: string;
    status: 'successful' | 'failed';
    verifiedAt: string;
  }>(res, 'Callback verification failed.');
}
