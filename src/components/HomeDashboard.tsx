import React from 'react';
import {
  Briefcase,
  ChevronRight,
  Flame,
  Fuel,
  Gift,
  MapPin,
  ShieldCheck,
  Store,
  Truck,
} from 'lucide-react';
import { t } from '../i18n/translations';
import type {
  AppRoute,
  GasOrder,
  Language,
  OilcomUser,
  Promotion,
  RewardsAccount,
  UserRole,
} from '../types/oilcom';
import { formatTzs } from './OilcomBrand';

interface HomeDashboardProps {
  lang: Language;
  user: OilcomUser;
  effectiveRole: UserRole;
  rewards: RewardsAccount | null;
  orders: GasOrder[];
  promotions: Promotion[];
  onNavigate: (route: AppRoute) => void;
}

export function HomeDashboard({
  lang,
  user,
  effectiveRole,
  rewards,
  orders,
  promotions,
  onNavigate,
}: HomeDashboardProps) {
  const firstName = user.fullName.split(' ')[0] || 'Mteja';
  const points = rewards?.pointsBalance ?? 0;
  const activeOrder = orders.find(
    (o) => !['delivered', 'cancelled'].includes(o.status)
  );

  const serviceTiles: {
    route: AppRoute;
    title: string;
    desc: string;
    icon: React.ReactNode;
    roles: UserRole[];
  }[] = [
    {
      route: 'fuel',
      title: t(lang, 'navFuel'),
      desc: t(lang, 'buyFuelDesc'),
      icon: <Fuel className="w-7 h-7 text-[#0B2A6F] dark:text-[#60A5FA]" />,
      roles: ['customer', 'admin'],
    },
    {
      route: 'gas',
      title: t(lang, 'navGas'),
      desc: t(lang, 'gasDesc'),
      icon: <Flame className="w-7 h-7 text-[#D92027] dark:text-red-400" />,
      roles: ['customer', 'admin'],
    },
    {
      route: 'rewards',
      title: t(lang, 'navRewards'),
      desc: t(lang, 'rewardsDesc'),
      icon: <Gift className="w-7 h-7 text-[#D99B00] dark:text-[#F5B800]" />,
      roles: ['customer', 'admin'],
    },
    {
      route: 'business',
      title: t(lang, 'navBusiness'),
      desc: t(lang, 'businessDesc'),
      icon: <Briefcase className="w-7 h-7 text-[#0B2A6F] dark:text-blue-300" />,
      roles: ['business', 'admin'],
    },
    {
      route: 'orders',
      title: t(lang, 'navOrders'),
      desc: t(lang, 'ordersDesc'),
      icon: <Truck className="w-7 h-7 text-blue-700 dark:text-blue-400" />,
      roles: ['customer', 'admin'],
    },
    {
      route: 'stations',
      title: t(lang, 'navStations'),
      desc: t(lang, 'stationsDesc'),
      icon: <MapPin className="w-7 h-7 text-[#D92027] dark:text-red-400" />,
      roles: ['customer', 'admin'],
    },
    {
      route: 'agent',
      title: t(lang, 'navAgent'),
      desc:
        lang === 'sw'
          ? 'Dhibiti hisa, oda za wateja na mauzo'
          : 'Manage cylinder stock, incoming orders & sales',
      icon: <Store className="w-7 h-7 text-amber-600 dark:text-[#F5B800]" />,
      roles: ['agent', 'admin'],
    },
    {
      route: 'admin',
      title: t(lang, 'navAdmin'),
      desc:
        lang === 'sw'
          ? 'Usimamizi mkuu, ripoti, bei na idhini'
          : 'Central console, approvals, pricing & audit logs',
      icon: <ShieldCheck className="w-7 h-7 text-blue-800 dark:text-blue-300" />,
      roles: ['admin'],
    },
  ];

  const visibleTiles = serviceTiles.filter((tile) =>
    tile.roles.includes(effectiveRole)
  );

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* Hero Greeting Card */}
      <div className="relative overflow-hidden rounded-2xl bg-[#0B2A6F] text-white p-4 sm:p-7 flex flex-col gap-3.5 sm:gap-4">
        <div className="absolute top-0 inset-x-0 h-1 grid grid-cols-3">
          <span className="bg-[#2563EB]" />
          <span className="bg-[#D92027]" />
          <span className="bg-[#F5B800]" />
        </div>
        <div className="flex flex-row items-center justify-between gap-3 sm:gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] sm:text-xs font-medium text-[#F5B800] truncate">
              {rewards?.customerCode || 'OILCOM MEMBER'} · {rewards?.tier || 'Bronze'}
            </p>
            <h1 className="font-display text-xl sm:text-3xl font-bold mt-0.5 truncate">
              {t(lang, 'helloCustomer')}, {firstName}!
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-blue-100/80 max-w-xl leading-snug">
              {t(lang, 'homeSubtitle')}
            </p>
          </div>

          <div className="flex items-center shrink-0">
            {user.photoUrl ? (
              <img
                src={user.photoUrl}
                alt={user.fullName}
                referrerPolicy="no-referrer"
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-[#F5B800]"
              />
            ) : (
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#F5B800] text-[#0B2A6F] font-display font-extrabold text-lg sm:text-xl flex items-center justify-center">
                {firstName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => onNavigate('gas')}
            className="px-3.5 py-2 rounded-xl bg-[#D92027] hover:bg-[#b91c1c] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Flame className="w-3.5 h-3.5 text-[#F5B800]" />
            <span>{lang === 'sw' ? 'Agiza Gesi' : 'Order Gas'}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('stations')}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <MapPin className="w-3.5 h-3.5 text-[#F5B800]" />
            <span>{lang === 'sw' ? 'Vituo 3D' : '3D Stations'}</span>
          </button>
        </div>
      </div>

      {/* Golden Rewards Banner */}
      <button
        type="button"
        onClick={() => onNavigate('rewards')}
        className="w-full text-left rounded-2xl bg-[#F5B800] hover:bg-[#e5ab00] text-[#071A4A] p-4 sm:p-6 flex items-center justify-between gap-3 sm:gap-4 transition-colors cursor-pointer"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] sm:text-xs font-bold tracking-wide uppercase opacity-80">
            OILCOM REWARDS
          </p>
          <p className="font-display text-xl sm:text-3xl font-extrabold tabular-nums mt-0.5">
            {t(lang, 'pointsLabel')}: {points.toLocaleString('en-US')}
          </p>
          <p className="text-xs font-medium mt-1 opacity-85 leading-snug">
            {lang === 'sw'
              ? 'Bofya kuona QR code yako ya kupata pointi na kukomboa vocha'
              : 'Tap to open your verified QR code and redeem digital vouchers'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Gift className="w-7 h-7 sm:w-9 sm:h-9" />
          <ChevronRight className="w-5 h-5" />
        </div>
      </button>

      {/* Active Order Live Bar */}
      {activeOrder && (
        <button
          type="button"
          onClick={() => onNavigate('orders')}
          className="w-full text-left rounded-2xl bg-white dark:bg-[#0E172E] border border-[#F5B800]/60 p-3.5 sm:p-5 flex items-center justify-between gap-3 hover:border-[#F5B800] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-[#0B2A6F] text-[#F5B800] flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono-num text-[11px] font-bold uppercase text-[#0B2A6F] dark:text-[#F5B800] truncate">
                {lang === 'sw' ? 'Oda Inayoendelea' : 'Active Order'} ·{' '}
                {activeOrder.orderNumber} · {activeOrder.status.toUpperCase()}
              </p>
              <p className="font-semibold text-sm text-neutral-900 dark:text-white truncate mt-0.5">
                {activeOrder.itemsSummary}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                {activeOrder.deliveryAddress}
              </p>
            </div>
          </div>
          <span className="px-3 py-2 rounded-xl bg-[#0B2A6F] text-[#F5B800] text-xs font-bold flex items-center gap-1 shrink-0 whitespace-nowrap">
            <span>{lang === 'sw' ? 'Fuatilia' : 'Track'}</span>
            <ChevronRight className="w-4 h-4" />
          </span>
        </button>
      )}

      {/* Main Service Grid */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 sm:gap-2 mb-2.5 sm:mb-3">
          <h2 className="font-display text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
            {lang === 'sw' ? 'Huduma Kuu za OILCOM' : 'OILCOM Core Services'}
          </h2>
          <span className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 leading-snug">
            {t(lang, 'demoNotice')}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {visibleTiles.map((tile) => (
            <button
              key={tile.route}
              type="button"
              onClick={() => onNavigate(tile.route)}
              className="group text-left rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-3.5 sm:p-5 hover:border-[#F5B800] transition-colors cursor-pointer flex flex-col justify-between min-h-[116px] sm:min-h-[140px]"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-neutral-100 dark:bg-blue-950/60 flex items-center justify-center shrink-0">
                {tile.icon}
              </div>
              <div className="mt-2.5 sm:mt-4 min-w-0">
                <h3 className="font-display font-bold text-sm sm:text-base text-neutral-900 dark:text-white group-hover:text-[#0B2A6F] dark:group-hover:text-[#F5B800] truncate">
                  {tile.title}
                </h3>
                <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-snug">
                  {tile.desc}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Active Orders & Promotions Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-6">
        <div className="min-w-0 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
              {lang === 'sw' ? 'Oda za Hivi Karibuni' : 'Recent Orders'}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="text-xs font-semibold text-[#0B2A6F] dark:text-[#F5B800] hover:underline cursor-pointer"
            >
              {lang === 'sw' ? 'Tazama Zote' : 'View All'}
            </button>
          </div>
          {orders.length === 0 ? (
            <div className="py-6 sm:py-8 text-center">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {lang === 'sw'
                  ? 'Bado hujafanya oda yoyote.'
                  : 'You have not placed any orders yet.'}
              </p>
              <button
                type="button"
                onClick={() => onNavigate('gas')}
                className="mt-3 px-4 py-2 rounded-xl bg-[#0B2A6F] text-white text-xs font-semibold cursor-pointer"
              >
                {lang === 'sw' ? 'Agiza OILCOM Gas' : 'Order OILCOM Gas'}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-blue-950">
              {orders.slice(0, 4).map((ord) => (
                <div
                  key={ord.id}
                  className="py-2.5 sm:py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                      {ord.orderNumber} · {ord.itemsSummary}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                      {ord.status.toUpperCase()} · {ord.fulfillmentType} ·{' '}
                      {ord.paymentStatus}
                    </p>
                  </div>
                  <span className="font-mono-num text-sm font-semibold text-neutral-900 dark:text-white shrink-0">
                    {formatTzs(ord.totalTzs)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
              {lang === 'sw' ? 'Promosheni Maalum' : 'Special Promotions'}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('rewards')}
              className="text-xs font-semibold text-[#0B2A6F] dark:text-[#F5B800] hover:underline cursor-pointer"
            >
              {t(lang, 'viewRewards')}
            </button>
          </div>
          {promotions.length === 0 ? (
            <p className="text-sm text-neutral-500 py-6 sm:py-8 text-center">
              {lang === 'sw'
                ? 'Hakuna promosheni zinazoendelea kwa sasa.'
                : 'No active promotions right now.'}
            </p>
          ) : (
            <div className="space-y-2.5 sm:space-y-3">
              {promotions.slice(0, 3).map((promo) => (
                <div
                  key={promo.id}
                  className="p-3.5 sm:p-4 rounded-xl bg-neutral-50 dark:bg-blue-950/30 border border-neutral-200/80 dark:border-blue-900/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                      {lang === 'sw' ? promo.titleSw : promo.titleEn}
                    </p>
                    <span className="font-mono-num text-xs font-bold text-[#0B2A6F] dark:text-[#F5B800] shrink-0">
                      {promo.pointsMultiplier}x pts
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300 leading-snug">
                    {lang === 'sw' ? promo.descriptionSw : promo.descriptionEn}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
