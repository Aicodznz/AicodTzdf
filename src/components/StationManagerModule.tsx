import React, { useMemo, useState } from 'react';
import {
  Building2,
  Camera,
  CheckCircle2,
  Flame,
  Fuel,
  Plus,
  QrCode,
  Save,
  Trash2,
  Truck,
  Users,
} from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { t } from '../i18n/translations';
import { verifySignedQr } from '../lib/api';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  addStationStaffMember,
  createNotification,
  deleteStationStaffMember,
  makeId,
  updateStationStaffMember,
} from '../lib/firestoreActions';
import type {
  DeliveryRecord,
  GasOrder,
  Language,
  OilcomUser,
  OrderStatus,
  Station,
  StationStaffMember,
  StationStaffRole,
  SystemSettings,
  UserRole,
} from '../types/oilcom';
import { formatTzs } from './OilcomBrand';
import { QrCameraScannerModal } from './QrCameraScannerModal';

interface StationManagerModuleProps {
  lang: Language;
  user: OilcomUser;
  effectiveRole: UserRole;
  stations: Station[];
  staff: StationStaffMember[];
  orders: GasOrder[];
  deliveries: DeliveryRecord[];
  settings: SystemSettings;
}

export function StationManagerModule({
  lang,
  user,
  effectiveRole,
  stations,
  staff,
  orders,
  deliveries,
  settings,
}: StationManagerModuleProps) {
  const isAllowed =
    effectiveRole === 'station_manager' ||
    effectiveRole === 'gas_manager' ||
    effectiveRole === 'admin';

  // Scope exclusively to the station(s) assigned to this manager (Admin sees all for supervision/preview)
  const myStations = useMemo(() => {
    if (effectiveRole === 'admin') {
      if (user.assignedStationId) {
        const match = stations.filter((s) => s.id === user.assignedStationId);
        if (match.length > 0) return match;
      }
      return stations;
    }
    return stations.filter(
      (s) =>
        s.managerUid === user.uid ||
        (Boolean(user.assignedStationId) && s.id === user.assignedStationId)
    );
  }, [stations, user.uid, user.assignedStationId, effectiveRole]);

  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const activeStation = useMemo(() => {
    if (selectedStationId) {
      const found = myStations.find((s) => s.id === selectedStationId);
      if (found) return found;
    }
    return myStations[0] || null;
  }, [myStations, selectedStationId]);

  const [tab, setTab] = useState<'overview' | 'staff' | 'orders' | 'qr'>('overview');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  // Delivery dispatch defaults for station orders
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('+255 712 000 000');
  const [vehiclePlate, setVehiclePlate] = useState('T 452 OIL');
  const [etaMinutes, setEtaMinutes] = useState(25);

  // Station QR Rewards scanner state
  const [qrInput, setQrInput] = useState('');
  const [purchaseAmount, setPurchaseAmount] = useState(50000);
  const [qrResult, setQrResult] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  // Operations form state synced from activeStation
  const [opsDraft, setOpsDraft] = useState<{
    stationId: string;
    status: 'active' | 'maintenance' | 'inactive';
    open24Hours: boolean;
    petrolPriceTzs: number;
    dieselPriceTzs: number;
    pumpsCount: number;
    lpg6kgStock: number;
    lpg15kgStock: number;
    lpg38kgStock: number;
  } | null>(null);

  const currentOps = useMemo(() => {
    if (!activeStation) return null;
    if (opsDraft && opsDraft.stationId === activeStation.id) return opsDraft;
    return {
      stationId: activeStation.id,
      status: activeStation.status,
      open24Hours: Boolean(activeStation.open24Hours),
      petrolPriceTzs: activeStation.petrolPriceTzs ?? 3150,
      dieselPriceTzs: activeStation.dieselPriceTzs ?? 3040,
      pumpsCount: activeStation.pumpsCount ?? 6,
      lpg6kgStock: activeStation.lpg6kgStock ?? 0,
      lpg15kgStock: activeStation.lpg15kgStock ?? 0,
      lpg38kgStock: activeStation.lpg38kgStock ?? 0,
    };
  }, [activeStation, opsDraft]);

  // Add staff form
  const [newStaff, setNewStaff] = useState<{
    fullName: string;
    phone: string;
    staffRole: StationStaffRole;
    shift: 'morning' | 'evening' | 'night';
  }>({
    fullName: '',
    phone: '+255 ',
    staffRole: effectiveRole === 'gas_manager' ? 'gas_filler' : 'attendant',
    shift: 'morning',
  });

  const stationStaff = useMemo(() => {
    if (!activeStation) return [];
    return staff.filter((m) => m.stationId === activeStation.id);
  }, [staff, activeStation]);

  const activeStaffCount = useMemo(
    () => stationStaff.filter((m) => m.status === 'active').length,
    [stationStaff]
  );

  const stationOrders = useMemo(() => {
    if (!activeStation) return [];
    return orders.filter((o) => o.stationId === activeStation.id);
  }, [orders, activeStation]);

  const pendingOrdersCount = useMemo(
    () =>
      stationOrders.filter(
        (o) => o.status !== 'delivered' && o.status !== 'cancelled'
      ).length,
    [stationOrders]
  );

  const stationRevenueTzs = useMemo(
    () =>
      stationOrders
        .filter((o) => o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.totalTzs, 0),
    [stationOrders]
  );

  if (!isAllowed) {
    return (
      <div className="max-w-lg mx-auto rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-6 text-center space-y-2">
        <p className="font-display font-bold text-base text-neutral-900 dark:text-white">
          {lang === 'sw'
            ? 'Dashibodi ya Meneja wa Kituo Pekee'
            : 'Station Manager Access Only'}
        </p>
        <p className="text-xs text-neutral-500">
          {lang === 'sw'
            ? 'Ukurasa huu unapatikana kwa Mameneja wa Vituo vilivyoidhinishwa na Admin pekee.'
            : 'This workspace is restricted to Admin-provisioned Station and Gas Depot Managers.'}
        </p>
      </div>
    );
  }

  if (!activeStation || !currentOps) {
    return (
      <div className="max-w-xl mx-auto rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-6 sm:p-8 text-center space-y-3">
        <Building2 className="w-10 h-10 text-[#F5B800] mx-auto" />
        <h2 className="font-display text-lg font-bold text-neutral-900 dark:text-white">
          {lang === 'sw'
            ? 'Bado Hujapangiwa Kituo Chochote'
            : 'No Station Assigned Yet'}
        </h2>
        <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
          {lang === 'sw'
            ? 'Tafadhali wasiliana na Admin Mkuu akupangie kituo chako cha mafuta au bohari ya gesi ili kuanza kusimamia wafanyakazi, bei na oda.'
            : 'Please contact the Central Admin to assign a fuel station or gas depot to your manager account.'}
        </p>
      </div>
    );
  }

  const isGasPrimary =
    effectiveRole === 'gas_manager' ||
    activeStation.stationKind === 'gas' ||
    activeStation.hasGas;
  const isFuelPrimary =
    effectiveRole === 'station_manager' ||
    activeStation.stationKind === 'fuel' ||
    activeStation.stationKind === 'both' ||
    activeStation.hasFuel;

  const handleSaveOps = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback('');
    try {
      await updateDoc(doc(db, 'stations', activeStation.id), {
        status: currentOps.status,
        open24Hours: currentOps.open24Hours,
        petrolPriceTzs: Math.max(0, Number(currentOps.petrolPriceTzs) || 0),
        dieselPriceTzs: Math.max(0, Number(currentOps.dieselPriceTzs) || 0),
        pumpsCount: Math.max(0, Number(currentOps.pumpsCount) || 0),
        lpg6kgStock: Math.max(0, Number(currentOps.lpg6kgStock) || 0),
        lpg15kgStock: Math.max(0, Number(currentOps.lpg15kgStock) || 0),
        lpg38kgStock: Math.max(0, Number(currentOps.lpg38kgStock) || 0),
        updatedAt: serverTimestamp(),
      });
      setFeedback(
        lang === 'sw'
          ? `Taarifa za ${activeStation.name} zimesasishwa.`
          : `${activeStation.name} operations updated.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `stations/${activeStation.id}`);
    } finally {
      setBusy(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newStaff.fullName.trim().length < 2 || newStaff.phone.trim().length < 5) {
      return;
    }
    setBusy(true);
    setFeedback('');
    try {
      await addStationStaffMember({
        stationId: activeStation.id,
        stationName: activeStation.name,
        managerUid: activeStation.managerUid || user.uid,
        fullName: newStaff.fullName,
        phone: newStaff.phone,
        staffRole: newStaff.staffRole,
        shift: newStaff.shift,
      });
      setNewStaff({
        fullName: '',
        phone: '+255 ',
        staffRole: effectiveRole === 'gas_manager' ? 'gas_filler' : 'attendant',
        shift: 'morning',
      });
      setFeedback(
        lang === 'sw'
          ? 'Mfanyakazi mpya ameongezwa kwenye kituo.'
          : 'Staff member added to station.'
      );
    } finally {
      setBusy(false);
    }
  };

  const stationDrivers = useMemo(
    () =>
      stationStaff.filter(
        (m) => m.status === 'active' && m.staffRole === 'driver'
      ),
    [stationStaff]
  );

  const handleOrderStatus = async (order: GasOrder, nextStatus: OrderStatus) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'gas_orders', order.id), {
        status: nextStatus,
        paymentStatus: nextStatus === 'delivered' ? 'successful' : order.paymentStatus,
        updatedAt: serverTimestamp(),
      });

      if (nextStatus === 'dispatched') {
        const resolvedDriver =
          driverName.trim() || stationDrivers[0]?.fullName || user.fullName || 'OILCOM Rider';
        const resolvedPhone =
          driverPhone.trim() || stationDrivers[0]?.phone || user.phone || '+255 700 000 000';
        const delId = makeId('del');
        await setDoc(doc(db, 'deliveries', delId), {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerId: order.customerId,
          agentUid: user.uid,
          driverName: resolvedDriver.slice(0, 100),
          driverPhone: resolvedPhone.slice(0, 32),
          vehiclePlate: (vehiclePlate.trim() || 'OILCOM-01').slice(0, 24),
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

      await createNotification({
        userId: order.customerId,
        titleSw: `Oda ${order.orderNumber}: ${nextStatus.toUpperCase()}`,
        titleEn: `Order ${order.orderNumber}: ${nextStatus.toUpperCase()}`,
        bodySw: `${activeStation.name} imesasisha oda yako kuwa ${nextStatus}.`,
        bodyEn: `${activeStation.name} updated your order to ${nextStatus}.`,
        category: 'order',
      });

      setFeedback(`${order.orderNumber} -> ${nextStatus.toUpperCase()}`);
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
        description: `${activeStation.name}: QR purchase (${formatTzs(purchaseAmount)})`,
        stationId: activeStation.id,
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
        bodySw: `Manunuzi ya ${formatTzs(purchaseAmount)} katika ${activeStation.name} yamethibitishwa.`,
        bodyEn: `Purchase of ${formatTzs(purchaseAmount)} at ${activeStation.name} verified.`,
        category: 'rewards',
      });

      setQrResult(
        lang === 'sw'
          ? `Imethibitishwa! Pointi +${res.pointsAwarded} zimeongezwa kwa ${res.customerCode}.`
          : `Verified! +${res.pointsAwarded} pts credited to ${res.customerCode}.`
      );
      setQrInput('');
    } catch (err) {
      setQrResult(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const staffRoleLabel = (role: StationStaffRole) => {
    if (lang === 'sw') {
      const swMap: Record<StationStaffRole, string> = {
        attendant: 'Mhudumu wa Pampu',
        gas_filler: 'Mtaalamu wa Mitungi ya Gesi',
        cashier: 'Keshia',
        driver: 'Dereva wa Usafirishaji',
        supervisor: 'Msimamizi wa Zamu',
      };
      return swMap[role];
    }
    const enMap: Record<StationStaffRole, string> = {
      attendant: 'Pump Attendant',
      gas_filler: 'LPG Cylinder Specialist',
      cashier: 'Cashier',
      driver: 'Delivery Driver',
      supervisor: 'Shift Supervisor',
    };
    return enMap[role];
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="rounded-2xl bg-[#0B2A6F] text-white p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono-num text-[11px] font-bold uppercase text-[#F5B800]">
            {activeStation.code} ·{' '}
            {activeStation.stationKind === 'gas'
              ? lang === 'sw'
                ? 'KITUO / BOHARI YA GESI'
                : 'GAS DEPOT'
              : activeStation.stationKind === 'fuel'
                ? lang === 'sw'
                  ? 'KITUO CHA MAFUTA'
                  : 'FUEL STATION'
                : lang === 'sw'
                  ? 'KITUO CHA MAFUTA & GESI'
                  : 'FUEL & GAS STATION'}
          </p>
          <h1 className="font-display text-xl sm:text-2xl font-bold mt-0.5 truncate">
            {activeStation.name}
          </h1>
          <p className="text-xs text-blue-100/80 truncate mt-0.5">
            {activeStation.address}, {activeStation.city} ·{' '}
            {lang === 'sw' ? 'Meneja:' : 'Manager:'}{' '}
            {activeStation.managerName || user.fullName}
          </p>
        </div>

        {myStations.length > 1 && (
          <select
            value={activeStation.id}
            onChange={(e) => {
              setSelectedStationId(e.target.value);
              setOpsDraft(null);
            }}
            className="px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-xs font-semibold text-white shrink-0"
          >
            {myStations.map((s) => (
              <option key={s.id} value={s.id} className="text-neutral-900">
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        )}
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-xs text-blue-900 dark:text-blue-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Station KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-3.5 sm:p-4">
          <p className="text-[11px] sm:text-xs text-neutral-500">
            {lang === 'sw' ? 'Wafanyakazi Kituoni' : 'Station Staff'}
          </p>
          <p className="font-mono-num text-lg sm:text-xl font-extrabold text-neutral-900 dark:text-white mt-0.5">
            {activeStaffCount}{' '}
            <span className="text-xs font-medium text-neutral-500">
              / {stationStaff.length} {lang === 'sw' ? 'jumla' : 'total'}
            </span>
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-3.5 sm:p-4">
          <p className="text-[11px] sm:text-xs text-neutral-500">
            {lang === 'sw' ? 'Oda za Kituo' : 'Station Orders'}
          </p>
          <p className="font-mono-num text-lg sm:text-xl font-extrabold text-neutral-900 dark:text-white mt-0.5">
            {stationOrders.length}{' '}
            <span className="text-xs font-medium text-amber-600 dark:text-[#F5B800]">
              ({pendingOrdersCount} {lang === 'sw' ? 'zinazosubiri' : 'active'})
            </span>
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-3.5 sm:p-4">
          <p className="text-[11px] sm:text-xs text-neutral-500">
            {lang === 'sw' ? 'Mauzo ya Kituo' : 'Station Revenue'}
          </p>
          <p className="font-mono-num text-lg sm:text-xl font-extrabold text-neutral-900 dark:text-white mt-0.5 truncate">
            {formatTzs(stationRevenueTzs)}
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-3.5 sm:p-4">
          <p className="text-[11px] sm:text-xs text-neutral-500">
            {isGasPrimary && !isFuelPrimary
              ? lang === 'sw'
                ? 'Jumla Mitungi ya Gesi'
                : 'Total LPG Cylinders'
              : lang === 'sw'
                ? 'Hali & Pampu / Mitungi'
                : 'Status & Stock'}
          </p>
          <p className="font-mono-num text-lg sm:text-xl font-extrabold text-neutral-900 dark:text-white mt-0.5">
            {isGasPrimary && !isFuelPrimary
              ? `${
                  (activeStation.lpg6kgStock ?? 0) +
                  (activeStation.lpg15kgStock ?? 0) +
                  (activeStation.lpg38kgStock ?? 0)
                } cyl`
              : `${activeStation.status.toUpperCase()} · ${activeStation.pumpsCount ?? 0}P`}
          </p>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-200/70 dark:bg-blue-950/60 w-full sm:w-fit overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          [
            [
              'overview',
              lang === 'sw' ? 'Bei, Hisa & Hali ya Kituo' : 'Operations & Stock',
              isGasPrimary && !isFuelPrimary ? Flame : Fuel,
            ],
            [
              'staff',
              `${lang === 'sw' ? 'Wafanyakazi' : 'Staff'} (${stationStaff.length})`,
              Users,
            ],
            [
              'orders',
              `${lang === 'sw' ? 'Oda za Kituo' : 'Station Orders'} (${stationOrders.length})`,
              Truck,
            ],
            [
              'qr',
              lang === 'sw' ? 'Skana QR (Rewards)' : 'QR Scanner',
              QrCode,
            ],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              tab === k
                ? 'bg-white dark:bg-[#0E172E] text-neutral-900 dark:text-[#F5B800]'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Tab 1: Operations, Fuel Prices & Gas Cylinder Stock */}
      {tab === 'overview' && (
        <form
          onSubmit={handleSaveOps}
          className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-4 max-w-3xl"
        >
          <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
            {lang === 'sw'
              ? 'Usimamizi wa Uendeshaji wa Kituo'
              : 'Station Operations, Fuel Pricing & LPG Inventory'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">
                {lang === 'sw' ? 'Hali ya Kituo' : 'Station Status'}
              </label>
              <select
                value={currentOps.status}
                onChange={(e) =>
                  setOpsDraft({
                    ...currentOps,
                    status: e.target.value as 'active' | 'maintenance' | 'inactive',
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-semibold"
              >
                <option value="active">{lang === 'sw' ? 'Kinafanya Kazi (Active)' : 'Active'}</option>
                <option value="maintenance">{lang === 'sw' ? 'Matengenezo (Maintenance)' : 'Maintenance'}</option>
                <option value="inactive">{lang === 'sw' ? 'Kimefungwa (Inactive)' : 'Inactive'}</option>
              </select>
            </div>

            <div className="flex items-center gap-2 sm:pt-5">
              <input
                id="open24"
                type="checkbox"
                checked={currentOps.open24Hours}
                onChange={(e) =>
                  setOpsDraft({ ...currentOps, open24Hours: e.target.checked })
                }
              />
              <label htmlFor="open24" className="text-xs font-semibold cursor-pointer">
                {lang === 'sw' ? 'Kituo Kinafunguliwa Saa 24/7' : 'Open 24/7'}
              </label>
            </div>
          </div>

          {isFuelPrimary && (
            <div className="pt-2 border-t border-neutral-100 dark:border-blue-950">
              <p className="text-xs font-bold text-[#0B2A6F] dark:text-[#F5B800] mb-2 flex items-center gap-1.5">
                <Fuel className="w-3.5 h-3.5" />
                <span>
                  {lang === 'sw' ? 'Bei za Mafuta & Pampu' : 'Fuel Pump Pricing & Count'}
                </span>
              </p>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                    Petrol (TZS/L)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={currentOps.petrolPriceTzs}
                    onChange={(e) =>
                      setOpsDraft({
                        ...currentOps,
                        petrolPriceTzs: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                    Diesel (TZS/L)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={currentOps.dieselPriceTzs}
                    onChange={(e) =>
                      setOpsDraft({
                        ...currentOps,
                        dieselPriceTzs: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                    {lang === 'sw' ? 'Idadi ya Pampu' : 'Pumps'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={currentOps.pumpsCount}
                    onChange={(e) =>
                      setOpsDraft({
                        ...currentOps,
                        pumpsCount: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                  />
                </div>
              </div>
            </div>
          )}

          {isGasPrimary && (
            <div className="pt-2 border-t border-neutral-100 dark:border-blue-950">
              <p className="text-xs font-bold text-[#0B2A6F] dark:text-[#F5B800] mb-2 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" />
                <span>
                  {lang === 'sw' ? 'Hisa za Mitungi ya Gesi (LPG)' : 'LPG Cylinder Inventory'}
                </span>
              </p>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                    6kg Cylinders
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={currentOps.lpg6kgStock}
                    onChange={(e) =>
                      setOpsDraft({
                        ...currentOps,
                        lpg6kgStock: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                    15kg Cylinders
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={currentOps.lpg15kgStock}
                    onChange={(e) =>
                      setOpsDraft({
                        ...currentOps,
                        lpg15kgStock: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                    38kg Cylinders
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={currentOps.lpg38kgStock}
                    onChange={(e) =>
                      setOpsDraft({
                        ...currentOps,
                        lpg38kgStock: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                  />
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2.5 rounded-xl bg-[#F5B800] hover:bg-[#e5ab00] text-[#0B2A6F] font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{t(lang, 'save')}</span>
          </button>
        </form>
      )}

      {/* Tab 2: Station Staff Management */}
      {tab === 'staff' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <form
            onSubmit={handleAddStaff}
            className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3 h-fit"
          >
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#F5B800]" />
              <span>{lang === 'sw' ? 'Ongeza Mfanyakazi' : 'Add Station Staff'}</span>
            </h3>
            <input
              type="text"
              required
              value={newStaff.fullName}
              onChange={(e) => setNewStaff({ ...newStaff, fullName: e.target.value })}
              placeholder={lang === 'sw' ? 'Jina Kamili' : 'Full Name'}
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
            />
            <input
              type="tel"
              required
              value={newStaff.phone}
              onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
              placeholder="+255 7XX XXX XXX"
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
            />
            <select
              value={newStaff.staffRole}
              onChange={(e) =>
                setNewStaff({
                  ...newStaff,
                  staffRole: e.target.value as StationStaffRole,
                })
              }
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
            >
              <option value="attendant">{staffRoleLabel('attendant')}</option>
              <option value="gas_filler">{staffRoleLabel('gas_filler')}</option>
              <option value="cashier">{staffRoleLabel('cashier')}</option>
              <option value="driver">{staffRoleLabel('driver')}</option>
              <option value="supervisor">{staffRoleLabel('supervisor')}</option>
            </select>
            <select
              value={newStaff.shift}
              onChange={(e) =>
                setNewStaff({
                  ...newStaff,
                  shift: e.target.value as 'morning' | 'evening' | 'night',
                })
              }
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
            >
              <option value="morning">{lang === 'sw' ? 'Zamu ya Asubuhi' : 'Morning Shift'}</option>
              <option value="evening">{lang === 'sw' ? 'Zamu ya Jioni' : 'Evening Shift'}</option>
              <option value="night">{lang === 'sw' ? 'Zamu ya Usiku' : 'Night Shift'}</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-[#0B2A6F] text-white font-bold text-xs cursor-pointer disabled:opacity-60"
            >
              {lang === 'sw' ? 'Sajili Mfanyakazi' : 'Add Staff Member'}
            </button>
          </form>

          <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 divide-y divide-neutral-100 dark:divide-blue-950">
            {stationStaff.length === 0 ? (
              <p className="py-10 text-center text-xs text-neutral-500">
                {lang === 'sw'
                  ? 'Hakuna wafanyakazi waliosajiliwa kwenye kituo hiki bado.'
                  : 'No staff registered at this station yet.'}
              </p>
            ) : (
              stationStaff.map((member) => (
                <div
                  key={member.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                      {member.fullName}
                    </p>
                    <p className="text-neutral-500 font-mono-num truncate">
                      {staffRoleLabel(member.staffRole)} · {member.shift.toUpperCase()} ·{' '}
                      {member.phone}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        updateStationStaffMember(member.id, {
                          status: member.status === 'active' ? 'inactive' : 'active',
                        })
                      }
                      className={`px-2.5 py-1.5 rounded-lg font-semibold cursor-pointer border ${
                        member.status === 'active'
                          ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                          : 'border-neutral-300 text-neutral-500'
                      }`}
                    >
                      {member.status === 'active'
                        ? lang === 'sw'
                          ? 'Kazini (Active)'
                          : 'Active'
                        : lang === 'sw'
                          ? 'Hayupo (Inactive)'
                          : 'Inactive'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteStationStaffMember(member.id)}
                      aria-label="Remove staff"
                      className="p-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Station-Scoped Orders & Live Delivery Dispatch */}
      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-[#0B2A6F] dark:text-[#F5B800] flex items-center gap-1.5">
                <Truck className="w-4 h-4" />
                <span>
                  {lang === 'sw'
                    ? 'Dereva wa Usafirishaji (Wakati wa Kutuma Oda)'
                    : 'Delivery Dispatch Driver Details'}
                </span>
              </p>
              {stationDrivers.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    const dr = stationDrivers.find((d) => d.id === e.target.value);
                    if (dr) {
                      setDriverName(dr.fullName);
                      setDriverPhone(dr.phone);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-blue-900 bg-neutral-50 dark:bg-[#091022] text-[11px]"
                >
                  <option value="">
                    {lang === 'sw' ? '-- Chagua dereva wa kituo --' : '-- Pick station driver --'}
                  </option>
                  {stationDrivers.map((dr) => (
                    <option key={dr.id} value={dr.id}>
                      {dr.fullName} ({dr.phone})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder={
                  stationDrivers[0]?.fullName ||
                  (lang === 'sw' ? 'Jina la Dereva' : 'Driver Name')
                }
                className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
              />
              <input
                type="tel"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                placeholder="+255 7XX XXX XXX"
                className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
              />
              <input
                type="text"
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
                placeholder="T 452 OIL"
                className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
              />
              <input
                type="number"
                min={5}
                max={240}
                value={etaMinutes}
                onChange={(e) => setEtaMinutes(Number(e.target.value))}
                placeholder="ETA (min)"
                className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
              />
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 divide-y divide-neutral-100 dark:divide-blue-950">
            {stationOrders.length === 0 ? (
              <p className="py-10 text-center text-xs text-neutral-500">
                {lang === 'sw'
                  ? 'Hakuna oda zilizoelekezwa kwenye kituo hiki bado.'
                  : 'No orders assigned to this station yet.'}
              </p>
            ) : (
              stationOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-mono-num font-bold text-[#0B2A6F] dark:text-[#F5B800]">
                      {ord.orderNumber} · {ord.orderKind.toUpperCase()} · {ord.status.toUpperCase()}
                    </p>
                    <p className="font-semibold text-sm text-neutral-900 dark:text-white truncate mt-0.5">
                      {ord.itemsSummary}
                    </p>
                    <p className="text-neutral-500 truncate">
                      {ord.customerName} · {ord.deliveryAddress}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="font-mono-num font-bold text-sm mr-1">
                      {formatTzs(ord.totalTzs)}
                    </span>
                    {ord.status === 'pending' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleOrderStatus(ord, 'confirmed')}
                        className="px-3 py-1.5 rounded-lg bg-[#0B2A6F] text-white font-semibold cursor-pointer"
                      >
                        {lang === 'sw' ? 'Thibitisha' : 'Confirm'}
                      </button>
                    )}
                    {(ord.status === 'confirmed' || ord.status === 'processing') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleOrderStatus(ord, 'dispatched')}
                        className="px-3 py-1.5 rounded-lg bg-[#F5B800] text-[#071A4A] font-bold cursor-pointer"
                      >
                        {lang === 'sw' ? 'Tuma / Tayari' : 'Dispatch'}
                      </button>
                    )}
                    {ord.status === 'dispatched' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleOrderStatus(ord, 'delivered')}
                        className="px-3 py-1.5 rounded-lg bg-blue-700 text-white font-semibold cursor-pointer"
                      >
                        {lang === 'sw' ? 'Imekamilika' : 'Mark Delivered'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Station & Gas Depot QR Rewards Scanner */}
      {tab === 'qr' && (
        <form
          onSubmit={handleVerifyCustomerQr}
          className="max-w-xl rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3.5 sm:space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display font-bold text-base sm:text-lg flex items-center gap-2">
              <QrCode className="w-5 h-5 text-[#F5B800] shrink-0" />
              {lang === 'sw'
                ? 'Skana ya QR ya Kituo (OILCOM Rewards)'
                : 'Station QR Rewards Scanner'}
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
              ? `Scan QR ya mteja anaponunua mafuta au gesi katika ${activeStation.name} ili kumpa pointi halisi za OILCOM Rewards.`
              : `Scan a customer QR code when refueling or buying LPG at ${activeStation.name} to award verified OILCOM Rewards points.`}
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
            className="w-full py-3 rounded-xl bg-[#F5B800] text-[#071A4A] font-bold text-sm cursor-pointer disabled:opacity-60"
          >
            {busy
              ? t(lang, 'loading')
              : lang === 'sw'
                ? 'Thibitisha QR & Toa Pointi'
                : 'Verify QR & Award Points'}
          </button>
          {qrResult && (
            <div className="p-3 rounded-xl bg-neutral-100 dark:bg-blue-950/60 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#F5B800] shrink-0" />
              <span>{qrResult}</span>
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
