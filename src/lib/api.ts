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

export async function fetchPublicConfig(): Promise<{
  googleMapsApiKey: string;
  sandboxMode: boolean;
}> {
  const res = await fetch('/api/public-config');
  if (!res.ok) {
    return { googleMapsApiKey: '', sandboxMode: true };
  }
  return res.json();
}

export async function issueSignedQr(customerCode: string): Promise<{
  qrToken: string;
  expiresAt: number;
  nonce: string;
}> {
  const headers = await getBearerHeaders();
  const res = await fetch('/api/qr/issue', {
    method: 'POST',
    headers,
    body: JSON.stringify({ customerCode }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to issue QR code.');
  return data;
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
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'QR verification failed.');
  return data;
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
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to initiate sandbox payment.');
  return data;
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
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Callback verification failed.');
  return data;
}
