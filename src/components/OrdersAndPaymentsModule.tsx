import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  MapPin,
  Phone,
  ShieldAlert,
  Truck,
  XCircle,
} from 'lucide-react';
import { t } from '../i18n/translations';
import {
  cancelCustomerOrder,
  settleSandboxPaymentInFirestore,
} from '../lib/firestoreActions';
import { downloadOrderReceiptPdf } from '../lib/pdfGenerator';
import type {
  DeliveryRecord,
  GasOrder,
  Language,
  OrderStatus,
  PaymentRecord,
  Station,
  UserRole,
} from '../types/oilcom';
import { formatTimestamp, formatTzs } from './OilcomBrand';
import { OrderTrackingMap } from './OrderTrackingMap';

interface OrdersAndPaymentsModuleProps {
  lang: Language;
  effectiveRole: UserRole;
  orders: GasOrder[];
  payments: PaymentRecord[];
  deliveries: DeliveryRecord[];
  stations: Station[];
  googleMapsApiKey: string;
}

const STATUS_STEPS: OrderStatus[] = [
  'pending',
  'confirmed',
  'processing',
  'dispatched',
  'delivered',
];

const STATUS_LABELS: Record<
  OrderStatus,
  { sw: string; en: string }
> = {
  pending: { sw: 'Subiri', en: 'Pending' },
  confirmed: { sw: 'Thibitishwa', en: 'Confirmed' },
  processing: { sw: 'Andaliwa', en: 'Prep' },
  dispatched: { sw: 'Njiani', en: 'On Way' },
  delivered: { sw: 'Imefika', en: 'Arrived' },
  cancelled: { sw: 'Imeghairiwa', en: 'Cancelled' },
};

export function OrdersAndPaymentsModule({
  lang,
  effectiveRole,
  orders,
  payments,
  deliveries,
  stations,
  googleMapsApiKey,
}: OrdersAndPaymentsModuleProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  const activeCount = orders.filter(
    (o) => !['delivered', 'cancelled'].includes(o.status)
  ).length;
  const completedCount = orders.filter((o) =>
    ['delivered', 'cancelled'].includes(o.status)
  ).length;

  const filteredOrders = orders.filter((o) => {
    if (filter === 'active') {
      return !['delivered', 'cancelled'].includes(o.status);
    }
    if (filter === 'completed') {
      return ['delivered', 'cancelled'].includes(o.status);
    }
    return true;
  });

  const handleCancel = async (order: GasOrder) => {
    setBusyId(order.id);
    setFeedback('');
    try {
      await cancelCustomerOrder(
        order.id,
        lang === 'sw' ? 'Imeghairiwa na mteja' : 'Cancelled by customer'
      );
      setFeedback(
        lang === 'sw'
          ? `Oda ${order.orderNumber} imeghairiwa.`
          : `Order ${order.orderNumber} cancelled.`
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Cancel failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAdminSandboxSettle = async (
    pay: PaymentRecord,
    status: 'successful' | 'failed' | 'refunded'
  ) => {
    setBusyId(pay.id);
    setFeedback('');
    try {
      await settleSandboxPaymentInFirestore({
        paymentId: pay.id,
        orderId: pay.orderId,
        orderKind: pay.orderType === 'fuel' ? 'fuel' : 'gas',
        newStatus: status,
        verified: status === 'successful',
      });
      setFeedback(`Sandbox payment ${pay.sandboxRef} marked ${status}.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3.5 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
            {t(lang, 'navOrders')}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
            {lang === 'sw'
              ? 'Fuatilia hali ya oda zako za mafuta/gesi na miamala ya malipo ya Sandbox.'
              : 'Track live order fulfilment and Sandbox payment verification statuses.'}
          </p>
        </div>

        <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 rounded-xl bg-neutral-200/70 dark:bg-blue-950/60 w-full sm:w-auto">
          {(['all', 'active', 'completed'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold text-center whitespace-nowrap transition-colors cursor-pointer ${
                filter === tab
                  ? 'bg-white dark:bg-[#0E172E] text-neutral-900 dark:text-[#F5B800] shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {tab === 'all'
                ? `${lang === 'sw' ? 'Zote' : 'All'} (${orders.length})`
                : tab === 'active'
                  ? `${lang === 'sw' ? 'Hivi Sasa' : 'Active'} (${activeCount})`
                  : `${lang === 'sw' ? 'Kamili' : 'Done'} (${completedCount})`}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200">
          {feedback}
        </div>
      )}

      {/* Orders List */}
      <div className="space-y-3 sm:space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-8 sm:p-10 text-center text-sm text-neutral-500">
            {t(lang, 'noResults')}
          </div>
        ) : (
          filteredOrders.map((order) => {
            const delivery = deliveries.find((d) => d.orderId === order.id);
            const activeStepIdx = STATUS_STEPS.indexOf(order.status);
            const canCancel =
              order.status === 'pending' || order.status === 'confirmed';

            return (
              <div
                key={order.id}
                className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono-num text-[11px] sm:text-xs font-bold text-[#0B2A6F] dark:text-[#F5B800] truncate">
                      {order.orderNumber} · {order.orderKind.toUpperCase()} ·{' '}
                      {order.fulfillmentType.toUpperCase()}
                    </p>
                    <h3 className="font-display font-bold text-sm sm:text-base text-neutral-900 dark:text-white mt-0.5 leading-snug">
                      {order.itemsSummary}
                    </h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-snug">
                      {order.deliveryAddress} · {formatTimestamp(order.createdAt)}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-mono-num text-base sm:text-lg font-extrabold text-neutral-900 dark:text-white whitespace-nowrap">
                      {formatTzs(order.totalTzs)}
                    </p>
                    <p className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      {order.paymentMethod.toUpperCase()} · {order.paymentStatus}
                    </p>
                  </div>
                </div>

                {/* Progress Timeline */}
                {order.status === 'cancelled' ? (
                  <div className="flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>
                      CANCELLED {order.cancelReason ? `— ${order.cancelReason}` : ''}
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-5 gap-1.5 sm:gap-2 pt-0.5">
                    {STATUS_STEPS.map((st, idx) => {
                      const done = activeStepIdx >= idx;
                      return (
                        <div key={st} className="space-y-1">
                          <div
                            className={`h-1.5 rounded-full ${
                              done
                                ? 'bg-[#F5B800]'
                                : 'bg-neutral-200 dark:bg-blue-950'
                            }`}
                          />
                          <p
                            className={`text-[9.5px] sm:text-[11px] font-medium text-center leading-tight ${
                              done
                                ? 'text-neutral-900 dark:text-white'
                                : 'text-neutral-400'
                            }`}
                          >
                            {lang === 'sw' ? STATUS_LABELS[st].sw : STATUS_LABELS[st].en}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {delivery && (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-neutral-50 dark:bg-blue-950/40 text-xs flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium text-neutral-800 dark:text-neutral-200 min-w-0">
                      <Truck className="w-4 h-4 text-[#F5B800] shrink-0" />
                      <span className="truncate">
                        {delivery.driverName} ({delivery.vehiclePlate || 'OILCOM'})
                      </span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono-num text-[11px] font-bold text-blue-700 dark:text-blue-300 whitespace-nowrap">
                        {delivery.status.toUpperCase()}
                        {delivery.etaMinutes ? ` · ETA ${delivery.etaMinutes}m` : ''}
                      </span>
                      {delivery.driverPhone && (
                        <a
                          href={`tel:${delivery.driverPhone}`}
                          className="px-2 py-1 rounded-lg bg-[#0B2A6F] text-[#F5B800] text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <Phone className="w-3 h-3" />
                          <span>{lang === 'sw' ? 'Piga' : 'Call'}</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2 pt-0.5">
                  {order.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() =>
                        setTrackingOrderId(
                          trackingOrderId === order.id ? null : order.id
                        )
                      }
                      className="w-full sm:w-auto px-3 py-2 rounded-xl border border-[#0B2A6F]/20 dark:border-blue-900 bg-neutral-50 dark:bg-blue-950/40 text-xs font-semibold text-[#0B2A6F] dark:text-[#F5B800] flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        {trackingOrderId === order.id
                          ? lang === 'sw'
                            ? 'Funga Ramani'
                            : 'Hide Map'
                          : lang === 'sw'
                            ? 'Fuatilia Ramani'
                            : 'Track Map'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => downloadOrderReceiptPdf(order, lang)}
                    className={`${
                      order.status === 'cancelled' ? 'col-span-2 sm:col-span-1' : ''
                    } w-full sm:w-auto px-3 py-2 rounded-xl bg-[#0B2A6F] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap`}
                  >
                    <Download className="w-3.5 h-3.5 text-[#F5B800] shrink-0" />
                    <span>{lang === 'sw' ? 'Risiti (PDF)' : 'Receipt PDF'}</span>
                  </button>

                  {canCancel && (
                    <button
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => handleCancel(order)}
                      className="col-span-2 sm:col-span-1 w-full sm:w-auto px-3 py-2 rounded-xl border border-red-200 dark:border-red-900 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center cursor-pointer whitespace-nowrap"
                    >
                      {lang === 'sw' ? 'Ghairi Oda' : 'Cancel Order'}
                    </button>
                  )}
                </div>

                {trackingOrderId === order.id && order.status !== 'cancelled' && (
                  <OrderTrackingMap
                    lang={lang}
                    order={order}
                    delivery={delivery}
                    stations={stations}
                    googleMapsApiKey={googleMapsApiKey}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Payments & Sandbox Architecture */}
      <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 mb-3 sm:mb-4">
          <h2 className="font-display font-bold text-base sm:text-lg text-neutral-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#F5B800] shrink-0" />
            {lang === 'sw' ? 'Historia ya Malipo (Sandbox)' : 'Payments Ledger (Sandbox)'}
          </h2>
          <span className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span>{t(lang, 'sandboxNotice')}</span>
          </span>
        </div>

        {payments.length === 0 ? (
          <p className="text-xs text-neutral-500 py-6 text-center">
            {lang === 'sw' ? 'Hakuna miamala ya malipo.' : 'No payment records yet.'}
          </p>
        ) : (
          <>
            {/* Mobile Compact Ledger Cards (no horizontal clipping) */}
            <div className="md:hidden divide-y divide-neutral-100 dark:divide-blue-950">
              {payments.map((pay) => (
                <div key={pay.id} className="py-3 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono-num font-bold text-neutral-900 dark:text-white truncate">
                        {pay.sandboxRef}
                      </p>
                      <p className="text-[11px] text-neutral-500 uppercase mt-0.5">
                        {pay.provider.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <p className="font-mono-num font-extrabold text-sm text-neutral-900 dark:text-white shrink-0">
                      {formatTzs(pay.amountTzs)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="inline-flex items-center gap-1 font-semibold text-neutral-800 dark:text-neutral-200">
                      {pay.status === 'successful' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                      )}
                      {pay.status}
                    </span>
                    <span className="text-neutral-500 dark:text-neutral-400 font-medium">
                      Callback: {pay.callbackVerified ? 'Verified' : 'Awaiting'}
                    </span>
                  </div>
                  {(effectiveRole === 'admin' || effectiveRole === 'agent') &&
                    pay.status === 'pending' && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          disabled={busyId === pay.id}
                          onClick={() => handleAdminSandboxSettle(pay, 'successful')}
                          className="py-1.5 px-2.5 rounded-lg bg-blue-700 text-white font-semibold text-center cursor-pointer"
                        >
                          Verify Success
                        </button>
                        <button
                          type="button"
                          disabled={busyId === pay.id}
                          onClick={() => handleAdminSandboxSettle(pay, 'failed')}
                          className="py-1.5 px-2.5 rounded-lg bg-red-600 text-white font-semibold text-center cursor-pointer"
                        >
                          Mark Failed
                        </button>
                      </div>
                    )}
                </div>
              ))}
            </div>

            {/* Desktop Ledger Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-blue-950 text-neutral-500">
                    <th className="py-2.5 pr-4">Sandbox Ref</th>
                    <th className="py-2.5 pr-4">Provider</th>
                    <th className="py-2.5 pr-4">Amount</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 pr-4">Callback</th>
                    {(effectiveRole === 'admin' || effectiveRole === 'agent') && (
                      <th className="py-2.5 text-right">Reconcile (Sandbox)</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-blue-950">
                  {payments.map((pay) => (
                    <tr key={pay.id}>
                      <td className="py-3 pr-4 font-mono-num font-semibold">
                        {pay.sandboxRef}
                      </td>
                      <td className="py-3 pr-4 uppercase">{pay.provider.replace(/_/g, ' ')}</td>
                      <td className="py-3 pr-4 font-mono-num">
                        {formatTzs(pay.amountTzs)}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center gap-1 font-medium">
                          {pay.status === 'successful' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                          )}
                          {pay.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {pay.callbackVerified ? 'Verified' : 'Awaiting'}
                      </td>
                      {(effectiveRole === 'admin' || effectiveRole === 'agent') && (
                        <td className="py-3 text-right space-x-2 whitespace-nowrap">
                          {pay.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                disabled={busyId === pay.id}
                                onClick={() => handleAdminSandboxSettle(pay, 'successful')}
                                className="px-2.5 py-1 rounded-lg bg-blue-700 text-white font-medium cursor-pointer"
                              >
                                Verify Success
                              </button>
                              <button
                                type="button"
                                disabled={busyId === pay.id}
                                onClick={() => handleAdminSandboxSettle(pay, 'failed')}
                                className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-medium cursor-pointer"
                              >
                                Mark Failed
                              </button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
