import React, { useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Package,
  QrCode,
  Store,
  Truck,
} from 'lucide-react';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { t } from '../i18n/translations';
import { verifySignedQr } from '../lib/api';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { createNotification, makeId } from '../lib/firestoreActions';
import type {
  AgentInventoryItem,
  AgentProfile,
  DeliveryRecord,
  GasOrder,
  Language,
  OilcomUser,
  OrderStatus,
  Product,
  Station,
  StockMovement,
  SystemSettings,
  UserRole,
} from '../types/oilcom';
import { formatTimestamp, formatTzs } from './OilcomBrand';
import { QrCameraScannerModal } from './QrCameraScannerModal';

interface AgentPortalModuleProps {
  lang: Language;
  user: OilcomUser;
  effectiveRole: UserRole;
  agentProfile: AgentProfile | null;
  orders: GasOrder[];
  deliveries: DeliveryRecord[];
  inventory: AgentInventoryItem[];
  movements: StockMovement[];
  stations: Station[];
  products: Product[];
  settings: SystemSettings;
}

export function AgentPortalModule({
  lang,
  user,
  effectiveRole,
  agentProfile,
  orders,
  deliveries,
  inventory,
  movements,
  products,
  settings,
}: AgentPortalModuleProps) {
  const [tab, setTab] = useState<'orders' | 'stock' | 'qr'>('orders');
  const [etaMinutes, setEtaMinutes] = useState(25);
  const [qrInput, setQrInput] = useState('');
  const [purchaseAmount, setPurchaseAmount] = useState(54000);
  const [qrResult, setQrResult] = useState('');
  const [stockProdId, setStockProdId] = useState('');
  const [stockDelta, setStockDelta] = useState(10);
  const [stockNote, setStockNote] = useState('Restock delivery');
  const [driverName, setDriverName] = useState('Juma Bakari');
  const [vehiclePlate, setVehiclePlate] = useState('T 452 DKM');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const gasProducts = products.filter((p) => p.roleScope === 'gas' || p.roleScope === 'all');

  const handleOrderStatus = async (order: GasOrder, nextStatus: OrderStatus) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'gas_orders', order.id), {
        status: nextStatus,
        agentId: order.agentId || user.uid,
        updatedAt: serverTimestamp(),
      });

      if (nextStatus === 'dispatched') {
        const delId = makeId('del');
        await setDoc(doc(db, 'deliveries', delId), {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerId: order.customerId,
          agentUid: user.uid,
          driverName: driverName.trim() || 'OILCOM Rider',
          driverPhone: user.phone || '+255 700 000 000',
          vehiclePlate: vehiclePlate.trim() || 'OILCOM-01',
          status: 'en_route',
          etaMinutes: Math.max(5, Number(etaMinutes) || 25),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (nextStatus === 'delivered') {
        const existingDel = deliveries.find(
          (d) => d.orderId === order.id && d.status !== 'delivered'
        );
        if (existingDel) {
          await updateDoc(doc(db, 'deliveries', existingDel.id), {
            status: 'delivered',
            updatedAt: serverTimestamp(),
          });
        }
      }

      if (nextStatus === 'delivered' && agentProfile) {
        const comm = Math.round(
          (order.totalTzs * (agentProfile.commissionRatePct || 4)) / 100
        );
        await updateDoc(doc(db, 'agents', agentProfile.id), {
          totalSalesTzs: (agentProfile.totalSalesTzs || 0) + order.totalTzs,
          totalCommissionTzs: (agentProfile.totalCommissionTzs || 0) + comm,
          updatedAt: serverTimestamp(),
        });
      }

      await createNotification({
        userId: order.customerId,
        titleSw: `Oda ${order.orderNumber}: ${nextStatus.toUpperCase()}`,
        titleEn: `Order ${order.orderNumber}: ${nextStatus.toUpperCase()}`,
        bodySw: `Hali ya oda yako imesasishwa kuwa ${nextStatus}.`,
        bodyEn: `Your order status was updated to ${nextStatus}.`,
        category: 'order',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `gas_orders/${order.id}`);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCustomerQr = async (e: React.FormEvent) => {
    e.preventDefault();
    setQrResult('');
    if (!qrInput.trim()) return;
    setBusy(true);
    try {
      const res = await verifySignedQr({
        qrToken: qrInput.trim(),
        amountTzs: purchaseAmount,
        pointsPer1000Tzs: settings.pointsPer1000Tzs,
      });

      const accRef = doc(db, 'rewards_accounts', res.customerUid);
      const snap = await getDoc(accRef);
      if (!snap.exists()) {
        throw new Error('Customer rewards account not found.');
      }
      const cur = snap.data() as {
        pointsBalance: number;
        lifetimePoints: number;
      };
      const nextBal = (cur.pointsBalance || 0) + res.pointsAwarded;
      const nextLife = (cur.lifetimePoints || 0) + res.pointsAwarded;
      const tier =
        nextLife >= 5000
          ? 'Camel VIP'
          : nextLife >= 2000
            ? 'Gold'
            : nextLife >= 500
              ? 'Silver'
              : 'Bronze';

      await updateDoc(accRef, {
        pointsBalance: nextBal,
        lifetimePoints: nextLife,
        tier,
        updatedAt: serverTimestamp(),
      });

      const txId = makeId('rtx');
      await setDoc(doc(db, 'rewards_transactions', txId), {
        userId: res.customerUid,
        customerCode: res.customerCode,
        type: 'earn',
        points: res.pointsAwarded,
        description: `Verified QR purchase (${formatTzs(purchaseAmount)})`,
        stationId: agentProfile?.stationId || 'station_demo_1',
        qrNonce: res.nonce,
        status: 'completed',
        processedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await createNotification({
        userId: res.customerUid,
        titleSw: `Umepata Pointi +${res.pointsAwarded}!`,
        titleEn: `Earned +${res.pointsAwarded} Points!`,
        bodySw: `Manunuzi ya ${formatTzs(purchaseAmount)} yamethibitishwa kwa QR.`,
        bodyEn: `QR purchase of ${formatTzs(purchaseAmount)} verified.`,
        category: 'rewards',
      });

      setQrResult(
        `Verified! +${res.pointsAwarded} pts credited to ${res.customerCode}.`
      );
      setQrInput('');
    } catch (err) {
      setQrResult(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleStockUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const prod = gasProducts.find((p) => p.id === (stockProdId || gasProducts[0]?.id));
    if (!prod) return;
    setBusy(true);
    const invId = `${user.uid}_${prod.id}`;
    const existingItem = inventory.find((i) => i.id === invId);
    const nextQty = Math.max(0, (existingItem?.quantityOnHand || 0) + stockDelta);

    try {
      await setDoc(doc(db, 'agent_inventory', invId), {
        agentUid: user.uid,
        productId: prod.id,
        productName: lang === 'sw' ? prod.nameSw : prod.nameEn,
        cylinderSizeKg: prod.sizeKg || 15,
        quantityOnHand: nextQty,
        reorderLevel: 10,
        updatedAt: serverTimestamp(),
      });

      const moveId = makeId('mov');
      await setDoc(doc(db, 'stock_movements', moveId), {
        agentUid: user.uid,
        productId: prod.id,
        productName: lang === 'sw' ? prod.nameSw : prod.nameEn,
        type: stockDelta >= 0 ? 'restock' : 'adjustment',
        quantityDelta: stockDelta,
        note: stockNote.slice(0, 200),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `agent_inventory/${invId}`);
    } finally {
      setBusy(false);
    }
  };

  if ((effectiveRole !== 'agent' && effectiveRole !== 'admin') || (!agentProfile && effectiveRole !== 'admin')) {
    return (
      <div className="max-w-xl mx-auto space-y-3.5 sm:space-y-5">
        <div className="rounded-2xl bg-[#0B2A6F] text-white p-5 sm:p-6">
          <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Store className="w-6 h-6 text-[#F5B800] shrink-0" />
            {t(lang, 'agentPortal')}
          </h1>
          <p className="text-xs sm:text-sm text-blue-100/80 mt-1">
            {lang === 'sw'
              ? 'Akaunti za Mawakala hutengenezwa na kuidhinishwa na Admin Mkuu pekee.'
              : 'Agent accounts are provisioned and approved strictly by Central Admin.'}
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-5 sm:p-6 text-xs sm:text-sm text-neutral-600 dark:text-neutral-300">
          {lang === 'sw'
            ? 'Ikiwa wewe ni wakala wa OILCOM Gas, tafadhali wasiliana na Admin Mkuu akusajili kupitia barua pepe yako ili upate ufikiaji wa dashibodi ya wakala.'
            : 'If you are an authorized OILCOM Gas dealer, please ask the Central Admin to provision your email for Agent access.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 sm:space-y-5">
      <div className="rounded-2xl bg-[#0B2A6F] text-white p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
        <div className="min-w-0">
          <p className="font-mono-num text-xs text-[#F5B800] truncate">
            {agentProfile
              ? `${agentProfile.licenseNumber} · ${agentProfile.approvalStatus.toUpperCase()}`
              : 'ADMIN AGENT OPERATIONS'}
          </p>
          <h1 className="font-display text-xl sm:text-2xl font-bold mt-0.5 truncate">
            {agentProfile?.businessName || t(lang, 'agentPortal')}
          </h1>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full sm:w-auto sm:flex sm:items-center sm:gap-6 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-white/10">
          <div>
            <p className="text-[11px] sm:text-xs opacity-75">Total Sales</p>
            <p className="font-mono-num text-base sm:text-lg font-bold text-[#F5B800]">
              {formatTzs(agentProfile?.totalSalesTzs || 0)}
            </p>
          </div>
          <div>
            <p className="text-[11px] sm:text-xs opacity-75">
              Commission ({agentProfile?.commissionRatePct ?? 4.5}%)
            </p>
            <p className="font-mono-num text-base sm:text-lg font-bold">
              {formatTzs(agentProfile?.totalCommissionTzs || 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 sm:inline-flex gap-1 p-1 rounded-xl bg-neutral-200/70 dark:bg-blue-950/60 w-full sm:w-fit">
        {(
          [
            ['orders', t(lang, 'incomingOrders')],
            ['stock', t(lang, 'inventoryStock')],
            ['qr', t(lang, 'qrScanner')],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-2.5 sm:px-4 py-1.5 rounded-lg text-xs font-semibold text-center truncate cursor-pointer ${
              tab === k
                ? 'bg-white dark:bg-[#0E172E] text-neutral-900 dark:text-[#F5B800]'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'orders' && (
        <div className="space-y-3 sm:space-y-4">
          <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <Truck className="w-4 h-4 text-[#F5B800]" />
              <span className="text-xs font-semibold">Dispatch Rider Defaults:</span>
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Driver Name"
                className="w-full sm:w-auto px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
              />
              <input
                type="text"
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
                placeholder="Vehicle Plate"
                className="w-full sm:w-auto px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
              />
              <input
                type="number"
                min={5}
                max={240}
                value={etaMinutes}
                onChange={(e) => setEtaMinutes(Number(e.target.value))}
                placeholder="ETA min"
                className="w-full sm:w-24 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
              />
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-8 sm:p-10 text-center text-sm text-neutral-500">
              {t(lang, 'noResults')}
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((ord) => (
                <div
                  key={ord.id}
                  className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="font-mono-num text-xs font-bold text-[#0B2A6F] dark:text-[#F5B800]">
                      {ord.orderNumber} · {ord.status.toUpperCase()}
                    </p>
                    <p className="font-semibold text-sm text-neutral-900 dark:text-white mt-0.5 truncate">
                      {ord.customerName} — {ord.itemsSummary}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                      {ord.deliveryAddress} · {formatTzs(ord.totalTzs)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto shrink-0">
                    {ord.status === 'pending' && (
                      <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleOrderStatus(ord, 'confirmed')}
                          className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold text-center cursor-pointer"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleOrderStatus(ord, 'cancelled')}
                          className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold text-center cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {ord.status === 'confirmed' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleOrderStatus(ord, 'processing')}
                        className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg bg-[#0B2A6F] text-white text-xs font-semibold text-center cursor-pointer"
                      >
                        Prepare Stock
                      </button>
                    )}
                    {ord.status === 'processing' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleOrderStatus(ord, 'dispatched')}
                        className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg bg-[#F5B800] text-[#071A4A] text-xs font-bold text-center cursor-pointer"
                      >
                        Dispatch Delivery
                      </button>
                    )}
                    {ord.status === 'dispatched' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleOrderStatus(ord, 'delivered')}
                        className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold text-center cursor-pointer"
                      >
                        Mark Delivered
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'stock' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-6">
          <form
            onSubmit={handleStockUpdate}
            className="min-w-0 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3.5 sm:space-y-4"
          >
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <Package className="w-4 h-4 text-[#F5B800]" />
              {lang === 'sw' ? 'Sasisha Hisa za Mitungi' : 'Adjust Cylinder Inventory'}
            </h3>
            <select
              value={stockProdId || gasProducts[0]?.id || ''}
              onChange={(e) => setStockProdId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
            >
              {gasProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {lang === 'sw' ? p.nameSw : p.nameEn}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                value={stockDelta}
                onChange={(e) => setStockDelta(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
              />
              <input
                type="text"
                value={stockNote}
                onChange={(e) => setStockNote(e.target.value)}
                placeholder="Note"
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-[#0B2A6F] text-white text-xs font-semibold cursor-pointer"
            >
              {t(lang, 'save')}
            </button>

            <div className="pt-3 border-t border-neutral-100 dark:border-blue-950 space-y-2">
              {inventory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between text-xs py-1 gap-2"
                >
                  <span className="font-medium truncate">{item.productName}</span>
                  <span className="font-mono-num font-bold text-[#0B2A6F] dark:text-[#F5B800] shrink-0">
                    {item.quantityOnHand} units
                  </span>
                </div>
              ))}
            </div>
          </form>

          <div className="min-w-0 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6">
            <h3 className="font-display font-bold text-base mb-3">
              {lang === 'sw' ? 'Historia ya Hisa' : 'Stock Movement History'}
            </h3>
            {movements.length === 0 ? (
              <p className="text-xs text-neutral-500 py-8 text-center">{t(lang, 'noResults')}</p>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-blue-950">
                {movements.slice(0, 8).map((mv) => (
                  <div key={mv.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{mv.productName}</p>
                      <p className="text-neutral-500 truncate">
                        {mv.note} · {formatTimestamp(mv.createdAt)}
                      </p>
                    </div>
                    <span className="font-mono-num font-bold shrink-0">
                      {mv.quantityDelta >= 0 ? `+${mv.quantityDelta}` : mv.quantityDelta}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'qr' && (
        <form
          onSubmit={handleVerifyCustomerQr}
          className="max-w-xl rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3.5 sm:space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display font-bold text-base sm:text-lg flex items-center gap-2">
              <QrCode className="w-5 h-5 text-[#F5B800] shrink-0" />
              {t(lang, 'qrScanner')}
            </h3>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-[#0B2A6F] hover:bg-[#13419E] text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
            >
              <Camera className="w-4 h-4 text-[#F5B800]" />
              {lang === 'sw' ? 'Scan kwa Kamera' : 'Open Camera Scanner'}
            </button>
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {lang === 'sw'
              ? 'Fungua kamera kuscan msimbo wa QR wa mteja au bandika token hapa chini ili kuthibitisha saini ya seva na kutoa pointi bila kurudiwa.'
              : 'Use the live camera scanner or paste the customer signed QR token below to validate HMAC signature, prevent replay, and award points.'}
          </p>
          <textarea
            rows={3}
            required
            value={qrInput}
            onChange={(e) => setQrInput(e.target.value)}
            placeholder="OILCOM-QR:eyJ2Ijox..."
            className="w-full p-3 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
          />
          <div>
            <label className="block text-xs font-semibold mb-1">
              {lang === 'sw' ? 'Kiasi cha Ununuzi (TZS)' : 'Eligible Purchase Amount (TZS)'}
            </label>
            <input
              type="number"
              min={1000}
              required
              value={purchaseAmount}
              onChange={(e) => setPurchaseAmount(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-sm font-mono-num"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-[#F5B800] text-[#071A4A] font-bold text-sm cursor-pointer"
          >
            {busy ? t(lang, 'loading') : lang === 'sw' ? 'Thibitisha QR & Toa Pointi' : 'Verify QR & Award Points'}
          </button>
          {qrResult && (
            <div className="p-3 rounded-xl bg-neutral-100 dark:bg-blue-950/60 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#F5B800] shrink-0" />
              {qrResult}
            </div>
          )}

          <QrCameraScannerModal
            lang={lang}
            open={scannerOpen}
            onClose={() => setScannerOpen(false)}
            onDetected={(decoded) => {
              setQrInput(decoded);
              setQrResult(
                lang === 'sw'
                  ? 'Msimbo wa QR umesomwa kwa kamera! Bofya "Thibitisha QR & Toa Pointi".'
                  : 'QR code captured by camera! Click "Verify QR & Award Points".'
              );
            }}
          />
        </form>
      )}
    </div>
  );
}
