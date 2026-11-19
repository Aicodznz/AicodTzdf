import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  auth,
  db,
  getProvisionerAuth,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { initiateSandboxPayment } from './api';
import type {
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  ProvisionedRole,
  StationStaffRole,
} from '../types/oilcom';

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const normalized = input.trim().toLowerCase();
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function writeAuditLog(params: {
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const logId = makeId('log');
  try {
    await setDoc(doc(db, 'audit_logs', logId), {
      actorId: uid,
      actorEmail: auth.currentUser?.email || '',
      action: params.action,
      targetCollection: params.targetCollection,
      targetId: params.targetId,
      summary: params.summary.slice(0, 300),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `audit_logs/${logId}`);
  }
}

export async function createNotification(params: {
  userId: string;
  titleSw: string;
  titleEn: string;
  bodySw: string;
  bodyEn: string;
  category: 'order' | 'rewards' | 'business' | 'agent' | 'system';
}): Promise<void> {
  const notifId = makeId('ntf');
  try {
    await setDoc(doc(db, 'notifications', notifId), {
      userId: params.userId,
      titleSw: params.titleSw.slice(0, 120),
      titleEn: params.titleEn.slice(0, 120),
      bodySw: params.bodySw.slice(0, 300),
      bodyEn: params.bodyEn.slice(0, 300),
      category: params.category,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `notifications/${notifId}`);
  }
}

export async function placeCustomerOrder(params: {
  customerId: string;
  customerName: string;
  customerPhone: string;
  agentId: string;
  stationId: string;
  stationManagerUid?: string;
  orderKind: 'gas' | 'fuel';
  fulfillmentType: 'delivery' | 'pickup';
  deliveryAddress: string;
  items: { productId: string; productName: string; quantity: number; unitPriceTzs: number }[];
  paymentMethod: PaymentProvider;
  paymentPhoneOrRef: string;
}): Promise<{
  orderId: string;
  orderNumber: string;
  paymentId: string;
  sandboxRef: string;
  callbackSignature: string;
}> {
  const orderId = makeId('ord');
  const orderNumber = `OIL-${Date.now().toString().slice(-6)}`;
  const itemsCount = params.items.reduce((acc, it) => acc + it.quantity, 0);
  const totalTzs = params.items.reduce(
    (acc, it) => acc + it.quantity * it.unitPriceTzs,
    0
  );
  const itemsSummary = params.items
    .map((it) => `${it.quantity}x ${it.productName}`)
    .join(', ')
    .slice(0, 300);

  const sandbox = await initiateSandboxPayment(
    {
      orderId,
      provider: params.paymentMethod,
      amountTzs: totalTzs,
      phoneOrRef: params.paymentPhoneOrRef || params.customerPhone || 'CASH-DELIVERY',
    },
    `idem-${orderId}`
  );

  try {
    await setDoc(doc(db, 'gas_orders', orderId), {
      orderNumber,
      customerId: params.customerId,
      customerName: params.customerName.slice(0, 120),
      customerPhone: (params.customerPhone || '').slice(0, 32),
      agentId: params.agentId || '',
      stationId: params.stationId || '',
      stationManagerUid: params.stationManagerUid || '',
      orderKind: params.orderKind,
      fulfillmentType: params.fulfillmentType,
      deliveryAddress: params.deliveryAddress.slice(0, 240),
      itemsSummary,
      itemsCount,
      totalTzs,
      paymentMethod: params.paymentMethod,
      paymentStatus: 'pending',
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `gas_orders/${orderId}`);
  }

  for (const item of params.items) {
    const itemId = makeId('itm');
    try {
      await setDoc(doc(db, 'order_items', itemId), {
        orderId,
        orderType: 'gas',
        customerId: params.customerId,
        productId: item.productId,
        productName: item.productName.slice(0, 140),
        quantity: item.quantity,
        unitPriceTzs: item.unitPriceTzs,
        subtotalTzs: item.quantity * item.unitPriceTzs,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `order_items/${itemId}`);
    }
  }

  const paymentId = makeId('pay');
  try {
    await setDoc(doc(db, 'payments', paymentId), {
      orderId,
      orderType: params.orderKind,
      userId: params.customerId,
      provider: params.paymentMethod,
      amountTzs: totalTzs,
      phoneOrRef: (params.paymentPhoneOrRef || 'COD').slice(0, 80),
      sandboxRef: sandbox.sandboxRef,
      mode: 'SANDBOX_TEST',
      status: 'pending',
      callbackVerified: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `payments/${paymentId}`);
  }

  await createNotification({
    userId: params.customerId,
    titleSw: `Oda ${orderNumber} Imepokelewa`,
    titleEn: `Order ${orderNumber} Placed`,
    bodySw: `${itemsSummary} — Malipo ya Sandbox (${sandbox.sandboxRef}) yanasubiri uthibitisho.`,
    bodyEn: `${itemsSummary} — Sandbox payment (${sandbox.sandboxRef}) is pending verification.`,
    category: 'order',
  });

  return {
    orderId,
    orderNumber,
    paymentId,
    sandboxRef: sandbox.sandboxRef,
    callbackSignature: sandbox.callbackSignature,
  };
}

export async function cancelCustomerOrder(
  orderId: string,
  reason: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'gas_orders', orderId), {
      status: 'cancelled' as OrderStatus,
      cancelReason: reason.slice(0, 200),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `gas_orders/${orderId}`);
  }
}

export async function submitRewardRedemption(params: {
  userId: string;
  customerCode: string;
  pointsCost: number;
  title: string;
  discountTzs: number;
  canApproveDirectly: boolean;
}): Promise<void> {
  const txId = makeId('rtx');
  const voucherId = makeId('vch');
  const promoCode = `OILV-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  if (params.canApproveDirectly) {
    const accRef = doc(db, 'rewards_accounts', params.userId);
    const snap = await getDoc(accRef);
    if (!snap.exists()) throw new Error('Rewards account not found.');
    const cur = snap.data() as { pointsBalance: number; lifetimePoints: number };
    if (cur.pointsBalance < params.pointsCost) {
      throw new Error('Pointi hazitoshi / Insufficient points.');
    }
    const nextBalance = cur.pointsBalance - params.pointsCost;
    const tier =
      cur.lifetimePoints >= 5000
        ? 'Camel VIP'
        : cur.lifetimePoints >= 2000
          ? 'Gold'
          : cur.lifetimePoints >= 500
            ? 'Silver'
            : 'Bronze';

    try {
      await updateDoc(accRef, {
        pointsBalance: nextBalance,
        tier,
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'rewards_transactions', txId), {
        userId: params.userId,
        customerCode: params.customerCode,
        type: 'redeem_approved',
        points: params.pointsCost,
        description: `Voucher: ${params.title}`,
        status: 'completed',
        processedBy: auth.currentUser?.uid || 'system',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'vouchers', voucherId), {
        userId: params.userId,
        promoCode,
        title: params.title,
        pointsCost: params.pointsCost,
        discountTzs: params.discountTzs,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `rewards_accounts/${params.userId}`);
    }
  } else {
    try {
      await setDoc(doc(db, 'rewards_transactions', txId), {
        userId: params.userId,
        customerCode: params.customerCode,
        type: 'redeem_request',
        points: params.pointsCost,
        description: `Redemption request: ${params.title}`,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'vouchers', voucherId), {
        userId: params.userId,
        promoCode,
        title: params.title,
        pointsCost: params.pointsCost,
        discountTzs: params.discountTzs,
        status: 'pending_approval',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `rewards_transactions/${txId}`);
    }
  }

  await createNotification({
    userId: params.userId,
    titleSw: params.canApproveDirectly ? 'Vocha Imewashwa!' : 'Ombi la Kukomboa Pointi Limetumwa',
    titleEn: params.canApproveDirectly ? 'Voucher Activated!' : 'Redemption Request Submitted',
    bodySw: `${params.title} (${promoCode}) — ${params.pointsCost} pointi.`,
    bodyEn: `${params.title} (${promoCode}) — ${params.pointsCost} points.`,
    category: 'rewards',
  });
}

export async function settleSandboxPaymentInFirestore(params: {
  paymentId: string;
  orderId?: string;
  orderKind?: 'gas' | 'fuel';
  newStatus: PaymentStatus;
  verified: boolean;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'payments', params.paymentId), {
      status: params.newStatus,
      callbackVerified: params.verified,
      updatedAt: serverTimestamp(),
    });
    if (params.orderId && (params.orderKind === 'gas' || params.orderKind === 'fuel')) {
      await updateDoc(doc(db, 'gas_orders', params.orderId), {
        paymentStatus: params.newStatus,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `payments/${params.paymentId}`);
  }
}

export async function provisionRoleAccount(params: {
  email: string;
  fullName: string;
  phone?: string;
  role: ProvisionedRole;
  assignedStationId?: string;
  assignedStationName?: string;
  region?: string;
  businessName?: string;
  licenseNumber?: string;
  tinNumber?: string;
  initialPassword?: string;
  existingUserUid?: string;
}): Promise<{
  provisionId: string;
  authCreated: boolean;
  authNote: string;
}> {
  const adminUid = auth.currentUser?.uid;
  if (!adminUid) throw new Error('Admin authentication required.');
  const cleanEmail = params.email.trim().toLowerCase().slice(0, 160);
  const cleanName = params.fullName.trim().slice(0, 120);
  const provisionId = await sha256Hex(cleanEmail);

  let createdAuthUid = params.existingUserUid || '';
  let authCreated = false;
  let authNote = '';

  if (params.initialPassword && params.initialPassword.length >= 6 && !createdAuthUid) {
    try {
      const secAuth = getProvisionerAuth();
      const cred = await createUserWithEmailAndPassword(
        secAuth,
        cleanEmail,
        params.initialPassword
      );
      await updateProfile(cred.user, { displayName: cleanName });
      createdAuthUid = cred.user.uid;
      authCreated = true;
      await signOut(secAuth);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        authNote = 'google_only';
      } else if (code === 'auth/email-already-in-use') {
        authNote = 'email_exists';
      } else {
        authNote = err instanceof Error ? err.message : 'auth_skipped';
      }
    }
  }

  const provRef = doc(db, 'role_provisions', provisionId);
  const existingProv = await getDoc(provRef);
  const isAlreadyActiveUid = Boolean(createdAuthUid);

  const provPayload = {
    email: cleanEmail,
    fullName: cleanName,
    phone: (params.phone || '').trim().slice(0, 32),
    role: params.role,
    assignedStationId: (params.assignedStationId || '').slice(0, 128),
    assignedStationName: (params.assignedStationName || '').slice(0, 120),
    region: (params.region || 'Dar es Salaam').trim().slice(0, 80),
    businessName: (params.businessName || cleanName).trim().slice(0, 140),
    licenseNumber: (params.licenseNumber || `OIL-LIC-${provisionId.slice(0, 6).toUpperCase()}`).trim().slice(0, 60),
    tinNumber: (params.tinNumber || '').trim().slice(0, 40),
    status: isAlreadyActiveUid ? 'claimed' : 'pending',
    claimedUid: createdAuthUid || '',
    createdBy: adminUid,
    createdAt: existingProv.exists()
      ? existingProv.data().createdAt
      : serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(provRef, provPayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `role_provisions/${provisionId}`);
  }

  if (createdAuthUid) {
    try {
      const targetUserRef = doc(db, 'users', createdAuthUid);
      const uSnap = await getDoc(targetUserRef);
      if (uSnap.exists()) {
        await updateDoc(targetUserRef, {
          role: params.role,
          assignedStationId: params.assignedStationId || '',
          provisionedBy: adminUid,
          provisionId,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(targetUserRef, {
          uid: createdAuthUid,
          fullName: cleanName,
          phone: (params.phone || '').trim().slice(0, 32),
          email: cleanEmail,
          role: params.role,
          assignedStationId: params.assignedStationId || '',
          provisionedBy: adminUid,
          provisionId,
          language: 'sw',
          status: 'active',
          photoUrl: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (params.role === 'agent') {
        await setDoc(doc(db, 'agents', createdAuthUid), {
          userId: createdAuthUid,
          businessName: provPayload.businessName,
          licenseNumber: provPayload.licenseNumber,
          stationId: params.assignedStationId || '',
          provisionId,
          region: provPayload.region,
          phone: provPayload.phone || '+255700000000',
          approvalStatus: 'approved',
          commissionRatePct: 5,
          totalSalesTzs: 0,
          totalCommissionTzs: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (params.role === 'admin') {
        await setDoc(doc(db, 'admins', createdAuthUid), {
          uid: createdAuthUid,
          email: cleanEmail,
          provisionId,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${createdAuthUid}`);
    }
  }

  if (
    (params.role === 'station_manager' || params.role === 'gas_manager') &&
    params.assignedStationId
  ) {
    try {
      await updateDoc(doc(db, 'stations', params.assignedStationId), {
        managerUid: createdAuthUid || '',
        managerName: cleanName,
        managerEmail: cleanEmail,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `stations/${params.assignedStationId}`
      );
    }
  }

  await writeAuditLog({
    action: 'PROVISION_ROLE_ACCOUNT',
    targetCollection: 'role_provisions',
    targetId: provisionId,
    summary: `Provisioned ${cleanEmail} as ${params.role}${params.assignedStationName ? ` @ ${params.assignedStationName}` : ''}`,
  });

  return { provisionId, authCreated, authNote };
}

export async function addStationStaffMember(params: {
  stationId: string;
  stationName: string;
  managerUid?: string;
  fullName: string;
  phone: string;
  staffRole: StationStaffRole;
  shift: 'morning' | 'evening' | 'night';
}): Promise<string> {
  const actorUid = auth.currentUser?.uid;
  if (!actorUid) throw new Error('Not signed in');
  const staffId = makeId('stf');
  try {
    await setDoc(doc(db, 'station_staff', staffId), {
      stationId: params.stationId,
      stationName: params.stationName.slice(0, 120),
      managerUid: params.managerUid || '',
      fullName: params.fullName.trim().slice(0, 120),
      phone: params.phone.trim().slice(0, 32),
      staffRole: params.staffRole,
      shift: params.shift,
      status: 'active',
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return staffId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `station_staff/${staffId}`);
  }
}

export async function updateStationStaffMember(
  staffId: string,
  updates: {
    fullName?: string;
    phone?: string;
    staffRole?: StationStaffRole;
    shift?: 'morning' | 'evening' | 'night';
    status?: 'active' | 'inactive';
  }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'station_staff', staffId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `station_staff/${staffId}`);
  }
}

export async function deleteStationStaffMember(staffId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'station_staff', staffId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `station_staff/${staffId}`);
  }
}
