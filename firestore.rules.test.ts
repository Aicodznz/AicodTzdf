/**
 * OILCOM SUPER APP — Firestore Security Rules Adversarial Test Suite (Dirty Dozen)
 * Validates that identity spoofing, privilege escalation, points tampering,
 * payment forgery, shadow fields, and terminal state overrides are denied.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  operation: 'create' | 'update' | 'get' | 'list';
  expected: 'PERMISSION_DENIED';
  payload: Record<string, unknown>;
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Self-Role Escalation on User Creation',
    collection: 'users/attacker-uid',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      uid: 'attacker-uid',
      fullName: 'Attacker',
      email: 'attacker@example.com',
      role: 'admin',
      language: 'sw',
      status: 'active',
    },
  },
  {
    id: 2,
    name: 'Profile Role Mutation by Owner',
    collection: 'users/customer-uid',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { role: 'agent' },
  },
  {
    id: 3,
    name: 'Self-Crediting Loyalty Points Balance',
    collection: 'rewards_accounts/customer-uid',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { pointsBalance: 999999, lifetimePoints: 999999 },
  },
  {
    id: 4,
    name: 'Fake Completed Earn Transaction by Customer',
    collection: 'rewards_transactions/tx-fake-1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      userId: 'customer-uid',
      customerCode: 'OIL-10001',
      type: 'earn',
      points: 5000,
      description: 'Forged points',
      status: 'completed',
    },
  },
  {
    id: 5,
    name: 'Spoofed Successful Payment on Create',
    collection: 'payments/pay-fake-1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      orderId: 'order-1',
      orderType: 'gas',
      userId: 'customer-uid',
      provider: 'mpesa',
      amountTzs: 25000,
      phoneOrRef: '+255700000000',
      sandboxRef: 'SBX-FAKE',
      mode: 'SANDBOX_TEST',
      status: 'successful',
      callbackVerified: true,
    },
  },
  {
    id: 6,
    name: 'Client Payment Status Tampering on Update',
    collection: 'payments/pay-1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { status: 'successful', callbackVerified: true },
  },
  {
    id: 7,
    name: 'Shadow Ghost Field Injection on Gas Order',
    collection: 'gas_orders/order-shadow',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      orderNumber: 'ORD-9999',
      customerId: 'customer-uid',
      customerName: 'Test',
      orderKind: 'gas',
      fulfillmentType: 'delivery',
      deliveryAddress: 'Kinondoni, Dar es Salaam',
      itemsSummary: '15kg LPG',
      itemsCount: 1,
      totalTzs: 50000,
      paymentMethod: 'mpesa',
      paymentStatus: 'pending',
      status: 'pending',
      isVerified: true,
    },
  },
  {
    id: 8,
    name: 'Terminal State Override After Delivery',
    collection: 'gas_orders/order-delivered',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { status: 'cancelled', cancelReason: 'Force refund' },
  },
  {
    id: 9,
    name: 'Business Self-Approval and Credit Limit Fraud',
    collection: 'businesses/biz-fraud',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      ownerId: 'customer-uid',
      companyName: 'Fraud Corp',
      tinNumber: '123-456-789',
      contactEmail: 'fraud@corp.tz',
      contactPhone: '+255700000001',
      creditLimitTzs: 50000000,
      creditUsedTzs: 0,
      paymentTermsDays: 60,
      approvalStatus: 'approved',
    },
  },
  {
    id: 10,
    name: 'Cross-User PII Scraping on Users Collection',
    collection: 'users',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    payload: { callerUid: 'customer-uid' },
  },
  {
    id: 11,
    name: 'Forged Timestamp Spoofing',
    collection: 'gas_orders/order-backdate',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      orderNumber: 'ORD-0001',
      customerId: 'customer-uid',
      createdAt: '2020-01-01T00:00:00Z',
    },
  },
  {
    id: 12,
    name: 'Unverified Email Admin Spoof',
    collection: 'system_settings/global',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: {
      authTokenEmail: 'amytzee@gmail.com',
      email_verified: false,
      pointsPer1000Tzs: 1000,
    },
  },
];
