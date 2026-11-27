import React, { useMemo, useState } from 'react';
import {
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Fuel,
  Globe,
  MapPin,
  Minus,
  Plus,
  ShoppingCart,
  Smartphone,
  Store,
  Ticket,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import {
  findGisZoneForCoords,
  haversineDistanceKm,
  type MatchedGisZone,
} from '../data/oilcomGeoJson';
import { t } from '../i18n/translations';
import { placeCustomerOrder } from '../lib/firestoreActions';
import { downloadOrderReceiptPdf } from '../lib/pdfGenerator';
import type {
  AgentProfile,
  CustomerAddress,
  Language,
  OilcomUser,
  PaymentProvider,
  Product,
  Station,
  Voucher,
} from '../types/oilcom';
import { MapLocationPickerModal } from './MapLocationPickerModal';
import {
  formatTzs,
  GasCylinderGraphic,
  OILCOM_LPG_CYLINDERS_SRC,
} from './OilcomBrand';

interface FuelAndGasModuleProps {
  mode: 'gas' | 'fuel';
  lang: Language;
  user: OilcomUser;
  products: Product[];
  stations: Station[];
  dealers: AgentProfile[];
  addresses: CustomerAddress[];
  vouchers: Voucher[];
  preselectedStationId?: string | null;
  googleMapsApiKey: string;
  onOrderSuccess: (summary: {
    orderNumber: string;
    sandboxRef: string;
  }) => void;
}

interface CartItem {
  product: Product;
  quantity: number;
}

const PAYMENT_OPTIONS: {
  id: PaymentProvider;
  label: string;
  badge: string;
  badgeCls: string;
  hintSw: string;
  hintEn: string;
}[] = [
  {
    id: 'mpesa',
    label: 'M-Pesa',
    badge: 'M',
    badgeCls: 'bg-red-600 text-white',
    hintSw: 'Vodacom · 075X / 074X (Sandbox)',
    hintEn: 'Vodacom · 075X / 074X (Sandbox)',
  },
  {
    id: 'mixx_by_yas',
    label: 'Mixx by Yas',
    badge: 'Y',
    badgeCls: 'bg-blue-600 text-white',
    hintSw: 'Tigo · 071X / 065X (Sandbox)',
    hintEn: 'Tigo · 071X / 065X (Sandbox)',
  },
  {
    id: 'airtel_money',
    label: 'Airtel Money',
    badge: 'A',
    badgeCls: 'bg-rose-600 text-white',
    hintSw: 'Airtel · 078X / 068X (Sandbox)',
    hintEn: 'Airtel · 078X / 068X (Sandbox)',
  },
  {
    id: 'bank',
    label: 'Benki / Card',
    badge: 'B',
    badgeCls: 'bg-blue-800 text-[#F5B800]',
    hintSw: 'CRDB / NMB / Kadi (Sandbox)',
    hintEn: 'Bank / Card (Sandbox)',
  },
  {
    id: 'cod',
    label: 'Cash (COD)',
    badge: 'C',
    badgeCls: 'bg-neutral-800 text-[#F5B800]',
    hintSw: 'Lipa ukipokea mzigo',
    hintEn: 'Pay on delivery',
  },
];

export function FuelAndGasModule({
  mode,
  lang,
  user,
  products,
  stations,
  dealers,
  addresses,
  vouchers,
  preselectedStationId,
  googleMapsApiKey,
  onOrderSuccess,
}: FuelAndGasModuleProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [fulfillmentType, setFulfillmentType] = useState<'delivery' | 'pickup'>(
    mode === 'fuel' ? 'pickup' : 'delivery'
  );
  const [selectedStationId, setSelectedStationId] = useState(
    preselectedStationId || stations[0]?.id || ''
  );
  const [selectedDealerUid, setSelectedDealerUid] = useState(
    dealers[0]?.userId || ''
  );
  const [deliveryAddress, setDeliveryAddress] = useState(
    addresses.find((a) => a.isDefault)?.street ||
      addresses[0]?.street ||
      ''
  );
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [matchedGisZone, setMatchedGisZone] = useState<MatchedGisZone | null>(
    null
  );
  const [nearestStationMeta, setNearestStationMeta] = useState<{
    name: string;
    distanceKm: number;
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentProvider>('mpesa');
  const [phoneOrRef, setPhoneOrRef] = useState(user.phone || '+255 712 000 000');
  const [fuelLiters, setFuelLiters] = useState<number>(20);
  const [voucherInput, setVoucherInput] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState<Voucher | null>(null);
  const [voucherMsg, setVoucherMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [placedInfo, setPlacedInfo] = useState<{
    orderNumber: string;
    sandboxRef: string;
    provider: PaymentProvider;
    phone: string;
    totalTzs: number;
    discountTzs: number;
    voucherCode?: string;
    itemsSummary: string;
    deliveryAddress: string;
    fulfillmentType: 'delivery' | 'pickup';
    orderKind: 'gas' | 'fuel';
  } | null>(null);

  React.useEffect(() => {
    if (preselectedStationId && stations.some((s) => s.id === preselectedStationId)) {
      setSelectedStationId(preselectedStationId);
    } else if (!selectedStationId && stations[0]?.id) {
      setSelectedStationId(stations[0].id);
    }
  }, [preselectedStationId, stations, selectedStationId]);

  const activeVouchers = useMemo(
    () => vouchers.filter((v) => v.status === 'active'),
    [vouchers]
  );

  const filteredProducts = useMemo(() => {
    return products.filter(
      (p) => p.active && (p.roleScope === mode || p.roleScope === 'all')
    );
  }, [products, mode]);

  const addToCart = (product: Product, qty = 1) => {
    setPlacedInfo(null);
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id
            ? { ...c, quantity: c.quantity + qty }
            : c
        );
      }
      return [...prev, { product, quantity: qty }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.product.id === productId
            ? { ...c, quantity: c.quantity + delta }
            : c
        )
        .filter((c) => c.quantity > 0)
    );
  };

  const cartSubtotal = cart.reduce(
    (sum, item) => sum + item.product.priceTzs * item.quantity,
    0
  );
  const appliedDiscountTzs =
    appliedVoucher && cartSubtotal > 0
      ? Math.min(cartSubtotal, Math.max(0, appliedVoucher.discountTzs))
      : 0;
  const cartTotal = Math.max(0, cartSubtotal - appliedDiscountTzs);

  const handleApplyVoucherCode = (codeToApply?: string) => {
    const clean = (codeToApply ?? voucherInput).trim().toUpperCase();
    setVoucherMsg('');
    if (!clean) {
      setAppliedVoucher(null);
      return;
    }
    const found = activeVouchers.find((v) => v.promoCode.toUpperCase() === clean);
    if (!found) {
      setAppliedVoucher(null);
      setVoucherMsg(
        lang === 'sw'
          ? 'Vocha haijapatikana au tayari imetumika.'
          : 'Voucher code not found or no longer active.'
      );
      return;
    }
    setAppliedVoucher(found);
    setVoucherInput(found.promoCode);
    setVoucherMsg(
      lang === 'sw'
        ? `Punguzo la ${formatTzs(found.discountTzs)} limeongezwa!`
        : `Discount of ${formatTzs(found.discountTzs)} applied!`
    );
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (cart.length === 0) {
      setErrorMsg(
        lang === 'sw' ? 'Kikapu chako hakina bidhaa.' : 'Your cart is empty.'
      );
      return;
    }

    const station = stations.find((s) => s.id === selectedStationId);
    const resolvedAddress =
      fulfillmentType === 'pickup'
        ? `Pickup: ${station?.name || 'OILCOM Station'}`
        : deliveryAddress.trim();

    if (fulfillmentType === 'delivery' && resolvedAddress.length < 4) {
      setErrorMsg(
        lang === 'sw'
          ? 'Tafadhali weka anwani kamili ya kufikishiwa.'
          : 'Please enter a valid delivery address.'
      );
      return;
    }

    const itemsSummaryText = cart
      .map(
        (c) =>
          `${c.quantity}x ${lang === 'sw' ? c.product.nameSw : c.product.nameEn}`
      )
      .join(', ');

    setSubmitting(true);
    try {
      const res = await placeCustomerOrder({
        customerId: user.uid,
        customerName: user.fullName,
        customerPhone: user.phone || phoneOrRef,
        agentId: selectedDealerUid || '',
        stationId: selectedStationId || '',
        stationManagerUid: station?.managerUid || '',
        orderKind: mode,
        fulfillmentType,
        deliveryAddress: resolvedAddress,
        items: cart.map((c) => ({
          productId: c.product.id,
          productName: lang === 'sw' ? c.product.nameSw : c.product.nameEn,
          quantity: c.quantity,
          unitPriceTzs: c.product.priceTzs,
        })),
        paymentMethod,
        paymentPhoneOrRef: phoneOrRef,
        voucherId: appliedVoucher?.id,
        voucherCode: appliedVoucher?.promoCode,
        discountTzs: appliedDiscountTzs,
      });

      setCart([]);
      setAppliedVoucher(null);
      setVoucherInput('');
      setVoucherMsg('');
      setPlacedInfo({
        orderNumber: res.orderNumber,
        sandboxRef: res.sandboxRef,
        provider: paymentMethod,
        phone: phoneOrRef,
        totalTzs: res.finalTotalTzs,
        discountTzs: res.appliedDiscountTzs,
        voucherCode: appliedVoucher?.promoCode,
        itemsSummary: itemsSummaryText,
        deliveryAddress: resolvedAddress,
        fulfillmentType,
        orderKind: mode,
      });
      onOrderSuccess({
        orderNumber: res.orderNumber,
        sandboxRef: res.sandboxRef,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Order failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPaymentMeta =
    PAYMENT_OPTIONS.find((p) => p.id === paymentMethod) || PAYMENT_OPTIONS[0];

  return (
    <div className="space-y-3.5 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
            {mode === 'gas' ? t(lang, 'navGas') : t(lang, 'navFuel')}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
            {mode === 'gas'
              ? lang === 'sw'
                ? 'Chagua ukubwa wa mtungi (6kg, 15kg, 38kg) na agiza nyumbani au chukua kituoni.'
                : 'Select LPG cylinder sizes (6kg, 15kg, 38kg) for delivery or station pickup.'
              : lang === 'sw'
                ? 'Agiza vocha ya mafuta ya Petroli au Dizeli na ulipe mapema kwa urahisi.'
                : 'Prepay Petrol or Diesel fuel vouchers for fast station refueling.'}
          </p>
        </div>
        <span className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400">
          {t(lang, 'demoNotice')}
        </span>
      </div>

      {placedInfo && (
        <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold text-sm text-blue-950 dark:text-blue-100">
                  {lang === 'sw'
                    ? `Oda ${placedInfo.orderNumber} imetumwa kikamilifu!`
                    : `Order ${placedInfo.orderNumber} placed successfully!`}
                </p>
                <p className="text-xs text-blue-800 dark:text-blue-300 mt-1">
                  Sandbox Ref:{' '}
                  <span className="font-mono-num font-bold">
                    {placedInfo.sandboxRef}
                  </span>{' '}
                  · {formatTzs(placedInfo.totalTzs)}
                  {placedInfo.discountTzs > 0
                    ? ` (${lang === 'sw' ? 'Punguzo' : 'Saved'} ${formatTzs(placedInfo.discountTzs)})`
                    : ''}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                downloadOrderReceiptPdf(
                  {
                    orderNumber: placedInfo.orderNumber,
                    customerName: user.fullName,
                    customerPhone: placedInfo.phone,
                    fulfillmentType: placedInfo.fulfillmentType,
                    orderKind: placedInfo.orderKind,
                    deliveryAddress: placedInfo.deliveryAddress,
                    itemsSummary: placedInfo.itemsSummary,
                    totalTzs: placedInfo.totalTzs,
                    voucherCode: placedInfo.voucherCode,
                    discountTzs: placedInfo.discountTzs,
                    paymentMethod: placedInfo.provider,
                    paymentStatus: 'pending',
                    status: 'pending',
                  },
                  lang
                )
              }
              className="px-3.5 py-2 rounded-xl bg-[#0B2A6F] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#F5B800]" />
              <span>{lang === 'sw' ? 'Pakua Risiti (PDF)' : 'Download Receipt'}</span>
            </button>
          </div>

          {placedInfo.provider !== 'cod' && (
            <div className="p-3 rounded-xl bg-white dark:bg-[#0E172E] border border-blue-200 dark:border-blue-900 text-xs space-y-1">
              <p className="font-bold text-[#0B2A6F] dark:text-[#F5B800] flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 shrink-0" />
                {lang === 'sw'
                  ? `Muhtasari wa Malipo (${placedInfo.provider.replace(/_/g, ' ').toUpperCase()} — Sandbox STK Push)`
                  : `Payment Prompt Preview (${placedInfo.provider.replace(/_/g, ' ').toUpperCase()} — Sandbox)`}
              </p>
              <p className="text-neutral-600 dark:text-neutral-300">
                {lang === 'sw'
                  ? `Ujumbe wa jaribio la USSD umeandaliwa kwa namba ${placedInfo.phone}. Hakuna fedha halisi zilizokatwa; fungua kichupo cha Oda kufuatilia uwasilishaji.`
                  : `Sandbox USSD confirmation generated for ${placedInfo.phone}. No real funds are charged; open the Orders tab to track live delivery.`}
              </p>
            </div>
          )}
        </div>
      )}

      {cart.length > 0 && (
        <a
          href="#oilcom-checkout"
          className="lg:hidden rounded-2xl bg-[#0B2A6F] text-white p-3.5 flex items-center justify-between gap-3 border border-[#F5B800]/50"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <ShoppingCart className="w-4 h-4 text-[#F5B800] shrink-0" />
            <span className="text-xs font-semibold truncate">
              {cart.reduce((s, c) => s + c.quantity, 0)}{' '}
              {lang === 'sw' ? 'Kikapuni' : 'in Cart'} · {formatTzs(cartTotal)}
            </span>
          </div>
          <span className="px-3 py-1 rounded-lg bg-[#F5B800] text-[#0B2A6F] text-xs font-bold shrink-0">
            {t(lang, 'checkout')}
          </span>
        </a>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 sm:gap-5 lg:gap-6 items-start">
        {/* Product Grid */}
        <div className="lg:col-span-2 space-y-3 sm:space-y-4 min-w-0">
          {mode === 'gas' && (
            <div className="rounded-2xl bg-gradient-to-r from-[#081A4B] via-[#123B96] to-[#0B2A6F] text-white p-4 sm:p-5 border border-white/15 shadow-sm flex items-center justify-between gap-4 overflow-hidden">
              <div className="min-w-0 space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#FFD028]">
                  O-GAS · OILCOM Tanzania
                </p>
                <h2 className="font-display text-base sm:text-lg font-extrabold leading-snug">
                  {lang === 'sw'
                    ? 'Mitungi Halisi ya O-GAS (6kg, 15kg & 38kg)'
                    : 'Official O-GAS Cylinders (6kg, 15kg & 38kg)'}
                </h2>
                <p className="text-xs text-blue-100/85 max-w-md leading-relaxed">
                  {lang === 'sw'
                    ? 'Salama, nzito na yenye thamani halisi — agiza O-GAS ikufikie nyumbani au chukua kituo kilicho karibu nawe.'
                    : 'Clean, sealed & safety-checked O-GAS cylinders — delivered fast to your doorstep or ready for station pickup.'}
                </p>
              </div>
              <img
                src={OILCOM_LPG_CYLINDERS_SRC}
                alt="O-GAS Cylinders 6kg 15kg 38kg"
                className="h-32 sm:h-40 w-auto object-contain shrink-0 drop-shadow-[0_12px_26px_rgba(0,0,0,0.52)]"
              />
            </div>
          )}

          {mode === 'fuel' && (
            <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {lang === 'sw' ? 'Kiasi cha Lita za Mafuta' : 'Fuel Volume (Liters)'}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {lang === 'sw'
                    ? 'Chagua lita za kuongeza kwenye kikapu mara moja'
                    : 'Choose liter quantity when adding fuel vouchers'}
                </p>
              </div>
              <div className="grid grid-cols-4 sm:flex items-center gap-2 w-full sm:w-auto">
                {[10, 20, 40, 60].map((liters) => (
                  <button
                    key={liters}
                    type="button"
                    onClick={() => setFuelLiters(liters)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold text-center transition-colors cursor-pointer ${
                      fuelLiters === liters
                        ? 'bg-[#0B2A6F] text-[#F5B800]'
                        : 'bg-neutral-100 dark:bg-blue-950/60 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    {liters}L
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredProducts.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-8 sm:p-10 text-center text-sm text-neutral-500">
              {t(lang, 'noResults')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-5 flex flex-col justify-between gap-3.5 min-w-0"
                >
                  <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-neutral-100 dark:bg-blue-950/60 flex items-center justify-center shrink-0">
                      {mode === 'gas' ? (
                        <GasCylinderGraphic sizeKg={product.sizeKg || 15} className="w-9 h-11 sm:w-11 sm:h-12" />
                      ) : (
                        <Fuel className="w-6 h-6 sm:w-7 sm:h-7 text-[#0B2A6F] dark:text-[#F5B800]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                        {product.sku} · {product.unit}
                      </p>
                      <h3 className="font-display font-bold text-sm sm:text-base text-neutral-900 dark:text-white mt-0.5 leading-snug">
                        {lang === 'sw' ? product.nameSw : product.nameEn}
                      </h3>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 leading-snug">
                        {lang === 'sw' ? product.descriptionSw : product.descriptionEn}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-neutral-100 dark:border-blue-950/80 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono-num text-base sm:text-lg font-bold text-neutral-900 dark:text-white whitespace-nowrap">
                        {formatTzs(product.priceTzs)}
                      </p>
                      {product.isDemoPlaceholderPrice && (
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          {lang === 'sw' ? 'Bei ya mfano' : 'Demo placeholder'}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        addToCart(product, mode === 'fuel' ? fuelLiters : 1)
                      }
                      className="px-3 sm:px-3.5 py-2 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#071A4A] font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {mode === 'fuel' ? `+ ${fuelLiters}L` : t(lang, 'addToCart')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Authorized Nearby Dealers List */}
          <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-5">
            <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white mb-2.5 sm:mb-3">
              {lang === 'sw'
                ? 'Mawakala Walioidhinishwa wa OILCOM'
                : 'Authorized OILCOM Gas Dealers'}
            </h3>
            {dealers.length === 0 ? (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {lang === 'sw'
                  ? 'Oda itatumwa kwa kituo cha OILCOM kilicho karibu.'
                  : 'Orders will route to the nearest OILCOM station.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                {dealers.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDealerUid(d.userId)}
                    className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                      selectedDealerUid === d.userId
                        ? 'border-[#F5B800] bg-amber-50/40 dark:bg-amber-950/20'
                        : 'border-neutral-200 dark:border-blue-950'
                    }`}
                  >
                    <p className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                      {d.businessName}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                      {d.region} · {d.phone}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Checkout Cart Panel */}
        <form
          id="oilcom-checkout"
          onSubmit={handleCheckout}
          className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3.5 lg:sticky lg:top-20 min-w-0 w-full"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg text-neutral-900 dark:text-white flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-[#F5B800]" />
              {t(lang, 'checkout')}
            </h2>
            <span className="font-mono-num text-xs text-neutral-500">
              {cart.reduce((s, c) => s + c.quantity, 0)} items
            </span>
          </div>

          {cart.length === 0 ? (
            <p className="py-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
              {lang === 'sw'
                ? 'Chagua bidhaa kushoto ili kuanza oda yako.'
                : 'Select items on the left to build your order.'}
            </p>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-blue-950">
              {cart.map((item) => (
                <div
                  key={item.product.id}
                  className="py-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                      {lang === 'sw' ? item.product.nameSw : item.product.nameEn}
                    </p>
                    <p className="font-mono-num text-xs text-neutral-500">
                      {formatTzs(item.product.priceTzs * item.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateQty(item.product.id, -1)}
                      className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-blue-950 flex items-center justify-center cursor-pointer"
                    >
                      {item.quantity === 1 ? (
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      ) : (
                        <Minus className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <span className="font-mono-num text-xs font-bold w-6 text-center">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQty(item.product.id, 1)}
                      className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-blue-950 flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Fulfillment selector */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              {lang === 'sw' ? 'Njia ya Kupokea' : 'Fulfillment Method'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFulfillmentType('delivery')}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold border cursor-pointer ${
                  fulfillmentType === 'delivery'
                    ? 'bg-[#0B2A6F] text-[#F5B800] border-[#0B2A6F]'
                    : 'border-neutral-200 dark:border-blue-950 text-neutral-600 dark:text-neutral-300'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                {t(lang, 'delivery')}
              </button>
              <button
                type="button"
                onClick={() => setFulfillmentType('pickup')}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold border cursor-pointer ${
                  fulfillmentType === 'pickup'
                    ? 'bg-[#0B2A6F] text-[#F5B800] border-[#0B2A6F]'
                    : 'border-neutral-200 dark:border-blue-950 text-neutral-600 dark:text-neutral-300'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                {t(lang, 'pickup')}
              </button>
            </div>
          </div>

          {/* Preferred Fulfillment Station (shown for both delivery & pickup so station manager receives order) */}
          {stations.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                {fulfillmentType === 'pickup'
                  ? lang === 'sw'
                    ? 'Chagua Kituo cha Kuchukulia'
                    : 'Select Pickup Station'
                  : lang === 'sw'
                    ? 'Kituo cha OILCOM Kitakachohudumia'
                    : 'Fulfilling OILCOM Station'}
              </label>
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs text-neutral-900 dark:text-white"
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.city})
                  </option>
                ))}
              </select>
            </div>
          )}

          {fulfillmentType === 'delivery' && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  {lang === 'sw' ? 'Anwani ya Kufikishiwa' : 'Delivery Address'}
                </label>
                <button
                  type="button"
                  onClick={() => setMapPickerOpen(true)}
                  className="text-[11px] font-bold text-[#0B2A6F] dark:text-[#F5B800] flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {lang === 'sw' ? 'Chagua Kwenye Ramani' : 'Pick on Map'}
                </button>
              </div>
              {addresses.length > 0 && (
                <select
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full mb-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
                >
                  <option value="">
                    {lang === 'sw' ? '-- Chagua anwani --' : '-- Saved address --'}
                  </option>
                  {addresses.map((addr) => (
                    <option key={addr.id} value={`${addr.label}: ${addr.street}, ${addr.city}`}>
                      {addr.label} ({addr.street})
                    </option>
                  ))}
                </select>
              )}
              <div className="relative">
                <MapPin className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder={lang === 'sw' ? 'Mfano: Mikocheni B, Dar es Salaam' : 'e.g. Mikocheni B, Dar es Salaam'}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs text-neutral-900 dark:text-white"
                />
              </div>
              {(matchedGisZone || nearestStationMeta) && (
                <div className="mt-2 p-2.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/35 border border-blue-200 dark:border-blue-900 text-[11px] space-y-1">
                  {matchedGisZone && (
                    <p className="font-semibold text-blue-950 dark:text-blue-100 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-[#F5B800] shrink-0" />
                      <span className="truncate">
                        {lang === 'sw'
                          ? matchedGisZone.nameSw
                          : matchedGisZone.nameEn}
                      </span>
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-blue-800 dark:text-blue-300">
                    {matchedGisZone && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 shrink-0" />
                        ETA {matchedGisZone.eta} ·{' '}
                        {lang === 'sw' ? 'Usafiri' : 'Fee'}:{' '}
                        <strong className="font-mono-num">
                          {formatTzs(matchedGisZone.feeTzs)}
                        </strong>
                      </span>
                    )}
                    {nearestStationMeta && (
                      <span className="flex items-center gap-1 truncate">
                        <Store className="w-3 h-3 shrink-0" />
                        {nearestStationMeta.name} (
                        {nearestStationMeta.distanceKm.toFixed(1)} km)
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rewards Voucher Redemption at Checkout */}
          <div className="rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50/70 dark:bg-[#091022] p-3 space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
              <Ticket className="w-3.5 h-3.5 text-[#F5B800]" />
              <span>
                {lang === 'sw' ? 'Tumia Vocha ya Rewards' : 'Apply Rewards Voucher'}
              </span>
            </label>

            {activeVouchers.length > 0 && (
              <select
                value={appliedVoucher?.promoCode || ''}
                onChange={(e) => handleApplyVoucherCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-blue-900 bg-white dark:bg-[#0E172E] text-xs"
              >
                <option value="">
                  {lang === 'sw'
                    ? `-- Chagua vocha (${activeVouchers.length} hai) --`
                    : `-- Select active voucher (${activeVouchers.length}) --`}
                </option>
                {activeVouchers.map((v) => (
                  <option key={v.id} value={v.promoCode}>
                    {v.promoCode} · -{formatTzs(v.discountTzs)} ({v.title})
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={voucherInput}
                onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
                placeholder="OILV-XXXXX"
                className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-900 bg-white dark:bg-[#0E172E] text-xs font-mono-num uppercase"
              />
              {appliedVoucher ? (
                <button
                  type="button"
                  onClick={() => {
                    setAppliedVoucher(null);
                    setVoucherInput('');
                    setVoucherMsg('');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{lang === 'sw' ? 'Ondoa' : 'Remove'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleApplyVoucherCode()}
                  className="px-3 py-1.5 rounded-lg bg-[#0B2A6F] text-[#F5B800] text-xs font-bold cursor-pointer shrink-0"
                >
                  {lang === 'sw' ? 'Tumia' : 'Apply'}
                </button>
              )}
            </div>
            {voucherMsg && (
              <p
                className={`text-[11px] font-medium ${
                  appliedVoucher
                    ? 'text-blue-700 dark:text-[#F5B800]'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {voucherMsg}
              </p>
            )}
          </div>

          {/* Visual Mobile Money & Payment Selector */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              {lang === 'sw' ? 'Njia ya Malipo (Sandbox)' : 'Payment Provider (Sandbox)'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_OPTIONS.map((opt) => {
                const selected = paymentMethod === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPaymentMethod(opt.id)}
                    className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer flex items-center gap-2 ${
                      selected
                        ? 'border-[#F5B800] bg-amber-50/60 dark:bg-amber-950/25'
                        : 'border-neutral-200 dark:border-blue-950 bg-neutral-50/70 dark:bg-[#091022]'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${opt.badgeCls}`}
                    >
                      {opt.id === 'bank' ? (
                        <Building2 className="w-3.5 h-3.5" />
                      ) : opt.id === 'cod' ? (
                        <Banknote className="w-3.5 h-3.5" />
                      ) : (
                        opt.badge
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                        {opt.label}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              {lang === 'sw' ? selectedPaymentMeta.hintSw : selectedPaymentMeta.hintEn}
            </p>
            <input
              type="text"
              value={phoneOrRef}
              onChange={(e) => setPhoneOrRef(e.target.value)}
              placeholder="+255 7XX XXX XXX"
              className="w-full mt-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs text-neutral-900 dark:text-white font-mono-num"
            />
            <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">
              {t(lang, 'sandboxNotice')}
            </p>
          </div>

          {errorMsg && (
            <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
          )}

          <div className="pt-3 border-t border-neutral-200 dark:border-blue-950 space-y-1.5">
            {appliedDiscountTzs > 0 && (
              <>
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>{lang === 'sw' ? 'Bei ya Awali' : 'Subtotal'}</span>
                  <span className="font-mono-num">{formatTzs(cartSubtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-red-600 dark:text-red-400">
                  <span>
                    {lang === 'sw' ? 'Punguzo la Vocha' : 'Voucher Discount'} (
                    {appliedVoucher?.promoCode})
                  </span>
                  <span className="font-mono-num">
                    -{formatTzs(appliedDiscountTzs)}
                  </span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                {lang === 'sw' ? 'Jumla' : 'Total'}
              </span>
              <span className="font-mono-num text-lg font-extrabold text-neutral-900 dark:text-white">
                {formatTzs(cartTotal)}
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || cart.length === 0}
            className="w-full py-3 px-4 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#071A4A] font-bold text-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            {submitting ? t(lang, 'loading') : t(lang, 'placeOrder')}
          </button>
        </form>
      </div>

      <MapLocationPickerModal
        lang={lang}
        open={mapPickerOpen}
        googleMapsApiKey={googleMapsApiKey}
        initialAddress={deliveryAddress}
        onClose={() => setMapPickerOpen(false)}
        onConfirm={({ street, city, lat, lng, gisZone }) => {
          setDeliveryAddress(`${street}, ${city}`.slice(0, 220));
          const resolvedZone =
            gisZone !== undefined ? gisZone : findGisZoneForCoords(lat, lng);
          setMatchedGisZone(resolvedZone);
          if (stations.length > 0) {
            const activeStations = stations.filter((s) => s.status === 'active');
            const pool = activeStations.length > 0 ? activeStations : stations;
            let closest = pool[0];
            let bestDist = haversineDistanceKm(lat, lng, closest.lat, closest.lng);
            for (const st of pool) {
              const dist = haversineDistanceKm(lat, lng, st.lat, st.lng);
              if (dist < bestDist) {
                bestDist = dist;
                closest = st;
              }
            }
            setSelectedStationId(closest.id);
            setNearestStationMeta({ name: closest.name, distanceKm: bestDist });
          }
        }}
      />
    </div>
  );
}
