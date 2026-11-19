import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { initiateSandboxPayment } from './api';
import type { OrderStatus, PaymentProvider, PaymentStatus } from '../types/oilcom';

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
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
