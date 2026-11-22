import React, { useMemo, useState } from 'react';
import {
  Award,
  Briefcase,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Flame,
  Fuel,
  Gift,
  Mail,
  MapPin,
  Megaphone,
  Phone,
  ShieldCheck,
  Store,
  Target,
  Truck,
  X,
} from 'lucide-react';
import { t } from '../i18n/translations';
import type {
  AppRoute,
  GasOrder,
  Language,
  OilcomUser,
  Product,
  Promotion,
  RewardsAccount,
  Station,
  UserRole,
} from '../types/oilcom';
import { formatTzs, OilcomWordmark } from './OilcomBrand';

const HERO_TANKER_PHOTO =
  '/assets/aistudio/WhatsApp_Image_2026-11-21_at_11.41.08_PM__1__e4bdacfd.jpeg';

interface HomeDashboardProps {
  lang: Language;
  user?: OilcomUser | null;
  effectiveRole: UserRole;
  rewards: RewardsAccount | null;
  orders: GasOrder[];
  promotions: Promotion[];
  products: Product[];
  stations: Station[];
  onNavigate: (route: AppRoute) => void;
  onOpenAuth?: () => void;
}

export function HomeDashboard({
  lang,
  user,
  effectiveRole,
  rewards,
  orders,
  promotions,
  products,
  stations,
  onNavigate,
  onOpenAuth,
}: HomeDashboardProps) {
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [newsIndex, setNewsIndex] = useState(0);

  const isGuest = !user;
  const firstName = user?.fullName.split(' ')[0] || (lang === 'sw' ? 'Mgeni' : 'Guest');
  const points = rewards?.pointsBalance ?? 0;
  const activeOrder = orders.find(
    (o) => !['delivered', 'cancelled'].includes(o.status)
  );

  // Pull live prices directly from catalog products
  const livePricing = useMemo(() => {
    const findPrice = (matcher: RegExp, fallback: number) => {
      const match = products.find(
        (p) =>
          p.active &&
          (matcher.test(p.nameEn) || matcher.test(p.nameSw) || matcher.test(p.sku || ''))
      );
      return match ? match.priceTzs : fallback;
    };
    return {
      petrol: findPrice(/petrol|super/i, 3150),
      diesel: findPrice(/diesel/i, 3040),
      lpg15: findPrice(/15\s*kg|lpg.*15/i, 52000),
    };
  }, [products]);

  const newsItems = useMemo(() => {
    const base =
      lang === 'sw'
        ? [
            {
              title: 'OILCOM Vituo Halisi Kote Tanzania',
              detail:
                'Tafuta vituo vyote vya mafuta na gesi ya OILCOM kwenye ramani shirikishi ya 2D na 3D na upate maelekezo ya papo hapo.',
              route: 'stations' as AppRoute,
            },
            {
              title: 'Agiza Mitungi ya OILCOM Gas Nyumbani',
              detail:
                'Mitungi ya 6kg, 15kg na 38kg inapatikana kwa uagizaji wa haraka na ufuatiliaji wa dereva mubashara.',
              route: 'gas' as AppRoute,
            },
            {
              title: 'Kusanya Pointi za OILCOM Rewards',
              detail:
                'Onyesha QR code yako kwenye kituo chochote cha OILCOM kupata pointi na kukomboa vocha za punguzo.',
              route: 'rewards' as AppRoute,
            },
          ]
        : [
            {
              title: 'OILCOM Stations Nationwide',
              detail:
                'Explore verified OILCOM fuel and LPG gas stations on our interactive 2D & 3D map with turn-by-turn routing.',
              route: 'stations' as AppRoute,
            },
            {
              title: 'Fast OILCOM Gas Cylinder Delivery',
              detail:
                'Order 6kg, 15kg, or 38kg LPG cylinders online with live order status and station dispatch.',
              route: 'gas' as AppRoute,
            },
            {
              title: 'Earn OILCOM Rewards Points',
              detail:
                'Scan your verified member QR code at any OILCOM pump or depot to collect points and redeem vouchers.',
              route: 'rewards' as AppRoute,
            },
          ];

    if (promotions.length > 0) {
      const promoNotices = promotions.map((p) => ({
        title: lang === 'sw' ? p.titleSw : p.titleEn,
        detail: lang === 'sw' ? p.descriptionSw : p.descriptionEn,
        route: 'rewards' as AppRoute,
      }));
      return [...promoNotices, ...base];
    }
    return base;
  }, [lang, promotions]);

  const activeNews = newsItems[newsIndex % newsItems.length] || newsItems[0];

  const quickDockItems: {
    route: AppRoute;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    accentClass: string;
  }[] = [
    {
      route: 'fuel',
      title: lang === 'sw' ? 'Huduma za Mafuta' : 'Fuel Services',
      subtitle: lang === 'sw' ? 'Petrol, Diesel & Kerosene' : 'Petrol, Diesel & Kerosene',
      icon: <Fuel className="w-5 h-5 text-white" />,
      accentClass: 'bg-[#D92027]',
    },
    {
      route: 'gas',
      title: lang === 'sw' ? 'OILCOM Gas (LPG)' : 'OILCOM Gas (LPG)',
      subtitle: lang === 'sw' ? 'Mitungi 6kg, 15kg & 38kg' : '6kg, 15kg & 38kg Cylinders',
      icon: <Flame className="w-5 h-5 text-[#071A4A]" />,
      accentClass: 'bg-[#F5B800]',
    },
    {
      route: 'stations',
      title: lang === 'sw' ? 'Vituo vya Mafuta' : 'Station Network',
      subtitle: lang === 'sw' ? 'Ramani & Maelekezo 3D' : '2D & 3D Map Locator',
      icon: <MapPin className="w-5 h-5 text-white" />,
      accentClass: 'bg-[#13419E]',
    },
    {
      route: 'orders',
      title: lang === 'sw' ? 'Usafirishaji & Oda' : 'Delivery & Orders',
      subtitle: activeOrder
        ? `${activeOrder.orderNumber} · ${activeOrder.status}`
        : lang === 'sw'
          ? 'Salama na Kwa Wakati'
          : 'Safe & Reliable Tracking',
      icon: <Truck className="w-5 h-5 text-white" />,
      accentClass: 'bg-[#0B2A6F]',
    },
    {
      route: effectiveRole === 'admin' ? 'admin' : 'rewards',
      title:
        effectiveRole === 'admin'
          ? lang === 'sw'
            ? 'Kituo cha Utawala'
            : 'Admin Console'
          : lang === 'sw'
            ? 'Zawadi za OILCOM'
            : 'OILCOM Rewards',
      subtitle:
        effectiveRole === 'admin'
          ? lang === 'sw'
            ? 'Usimamizi & Takwimu'
            : 'Management & Analytics'
          : isGuest
            ? lang === 'sw'
              ? 'Jisajili kupata pointi'
              : 'Sign up to earn points'
            : `${points.toLocaleString('en-US')} ${lang === 'sw' ? 'pointi' : 'pts'} · ${rewards?.tier || 'Bronze'}`,
      icon:
        effectiveRole === 'admin' ? (
          <ShieldCheck className="w-5 h-5 text-white" />
        ) : (
          <Gift className="w-5 h-5 text-white" />
        ),
      accentClass: effectiveRole === 'admin' ? 'bg-[#0B2A6F]' : 'bg-[#D92027]',
    },
  ];

  const allRoleExtras: {
    route: AppRoute;
    title: string;
    desc: string;
    icon: React.ReactNode;
    roles: UserRole[];
  }[] = [
    {
      route: 'business',
      title: t(lang, 'navBusiness'),
      desc: t(lang, 'businessDesc'),
      icon: <Briefcase className="w-5 h-5 text-[#0B2A6F] dark:text-blue-300" />,
      roles: ['business', 'admin'],
    },
    {
      route: 'agent',
      title: t(lang, 'navAgent'),
      desc:
        lang === 'sw'
          ? 'Dhibiti hisa za mitungi, oda za wateja na mauzo.'
          : 'Manage cylinder stock, incoming orders & sales.',
      icon: <Store className="w-5 h-5 text-[#D99B00] dark:text-[#F5B800]" />,
      roles: ['agent', 'admin'],
    },
    {
      route: 'admin',
      title: t(lang, 'navAdmin'),
      desc:
        lang === 'sw'
          ? 'Usimamizi mkuu, ripoti, bei na vituo.'
          : 'Central console, approvals, pricing & audit logs.',
      icon: <ShieldCheck className="w-5 h-5 text-[#D92027] dark:text-red-400" />,
      roles: ['admin'],
    },
  ];
  const roleExtras = allRoleExtras.filter((x) =>
    x.roles.includes(effectiveRole)
  );

  return (
    <div className="space-y-5 sm:space-y-7">
      {/* SECTION 1: Hero Banner + Real OILCOM Station & Fleet Visual */}
      <section className="relative overflow-hidden rounded-2xl bg-[#071A4A] text-white border border-blue-900/60 shadow-lg">
        {/* Brand Tri-Color Top Stripe */}
        <div className="h-1.5 w-full grid grid-cols-3">
          <span className="bg-[#1D4ED8]" />
          <span className="bg-[#D92027]" />
          <span className="bg-[#F5B800]" />
        </div>

        {/* Hero 2-Column Split (Balanced Height) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          {/* Left Content Zone */}
          <div className="lg:col-span-7 p-5 sm:p-8 lg:p-10 flex flex-col justify-between gap-6">
            {/* Clean Member Metadata Header Bar (Zero-Pill Rule) */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/10">
              {isGuest ? (
                <>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#F5B800]">
                      OILCOM Tanzania Limited
                    </p>
                    <p className="text-[11px] text-blue-100/80">
                      {lang === 'sw'
                        ? 'Mafuta Safi · OILCOM Gas · Vituo Kote Nchini'
                        : 'Clean Fuels · OILCOM Gas · Nationwide Stations'}
                    </p>
                  </div>
                  {onOpenAuth && (
                    <button
                      type="button"
                      onClick={onOpenAuth}
                      className="px-3.5 py-1.5 rounded-lg bg-[#F5B800] hover:bg-[#e5ab00] text-[#071A4A] text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors"
                    >
                      {lang === 'sw' ? 'Ingia / Sajili' : 'Sign In / Register'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 min-w-0">
                    {user?.photoUrl ? (
                      <img
                        src={user.photoUrl}
                        alt={user.fullName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-xl object-cover border border-[#F5B800]/70 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-[#F5B800] text-[#071A4A] font-display font-extrabold text-base flex items-center justify-center shrink-0">
                        {firstName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-blue-100/80 truncate">
                        {t(lang, 'helloCustomer')},{' '}
                        <span className="font-bold text-white">{firstName}</span>
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-[#F5B800] font-mono-num truncate">
                        <span>{rewards?.customerCode || 'OILCOM'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{rewards?.tier || 'Bronze'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{points.toLocaleString('en-US')} pts</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigate('rewards')}
                    className="text-xs font-semibold text-[#F5B800] hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Gift className="w-3.5 h-3.5" />
                    <span>{lang === 'sw' ? 'Kadi ya QR' : 'Member QR'}</span>
                  </button>
                </>
              )}
            </div>

            {/* Hero Editorial Core */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <OilcomWordmark className="h-9 sm:h-11" />
                <span className="text-xs sm:text-sm italic font-medium text-blue-100/85">
                  Energy for a Better Tomorrow
                </span>
              </div>

              <h1
                className="font-display font-extrabold tracking-tight leading-[1.08] text-white"
                style={{ fontSize: 'clamp(1.85rem, 3.6vw, 3.15rem)' }}
              >
                {lang === 'sw' ? (
                  <>
                    Nishati Bora,{' '}
                    <span className="text-[#F5B800]">Maisha Bora.</span>
                  </>
                ) : (
                  <>
                    Better Energy,{' '}
                    <span className="text-[#F5B800]">Better Life.</span>
                  </>
                )}
              </h1>

              <p className="text-sm sm:text-base text-blue-100/85 max-w-2xl leading-relaxed">
                {lang === 'sw'
                  ? 'Tunaweka nishati karibu nawe, kila wakati, mahali popote. Pata Petrol na Diesel halisi, mitungi ya OILCOM Gas, na huduma ya vituo vilivyothibitishwa kote Tanzania.'
                  : 'Putting reliable energy within your reach anytime, anywhere. Access clean Petrol and Diesel, certified OILCOM LPG cylinders, and our nationwide station network.'}
              </p>
            </div>

            {/* Action Buttons Row */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('gas')}
                className="px-5 py-2.5 rounded-xl bg-[#D92027] hover:bg-[#b81b21] text-white text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-md"
              >
                <Flame className="w-4 h-4 text-[#F5B800]" />
                <span>{lang === 'sw' ? 'Agiza Gesi au Mafuta' : 'Order Gas or Fuel'}</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('stations')}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <MapPin className="w-4 h-4 text-[#F5B800]" />
                <span>{lang === 'sw' ? 'Tazama Vituo Kote TZ' : 'Explore Station Map'}</span>
              </button>

              <button
                type="button"
                onClick={() => setAboutModalOpen(true)}
                className="px-3.5 py-2.5 text-sm font-semibold text-blue-100 hover:text-[#F5B800] underline-offset-4 hover:underline transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {lang === 'sw' ? 'Kuhusu OILCOM' : 'About OILCOM'}
              </button>
            </div>
          </div>

          {/* Right Media Frame (Real OILCOM Station & Tanker Photo) */}
          <div className="lg:col-span-5 relative min-h-[240px] sm:min-h-[300px] lg:min-h-full bg-[#0B2A6F] overflow-hidden">
            {!heroImgFailed ? (
              <img
                src={HERO_TANKER_PHOTO}
                alt="OILCOM Fuel Station and Tanker Fleet — Energy for a Better Tomorrow"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="w-full h-full object-cover object-center lg:h-full"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-[#0B2A6F] via-[#13419E] to-[#071A4A] text-center">
                <Fuel className="w-14 h-14 text-[#F5B800] mb-3" />
                <p className="font-display font-bold text-lg text-white">OILCOM Tanzania</p>
                <p className="text-xs text-blue-100/80 mt-1">
                  Petrol · Diesel · Kerosene · OILCOM Gas
                </p>
              </div>
            )}

            {/* Measured contrast scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#071A4A] via-[#071A4A]/25 to-transparent lg:bg-gradient-to-r lg:from-[#071A4A]/70 lg:via-transparent lg:to-transparent pointer-events-none" />

            {/* Clean unboxed telemetry overlay */}
            <div className="absolute bottom-3.5 inset-x-4 flex items-end justify-between gap-2 text-xs">
              <div>
                <p className="font-display font-bold text-white text-sm">
                  {lang === 'sw' ? 'Usambazaji wa Uhakika' : 'Nationwide Distribution'}
                </p>
                <p className="text-[11px] text-blue-100/85">
                  Petrol · Diesel · Kerosene · LPG
                </p>
              </div>
              <span className="font-mono-num text-xs font-bold text-[#F5B800] shrink-0">
                24/7 Tanzania
              </span>
            </div>
          </div>
        </div>

        {/* Integrated 5-Card Quick Service Strip at Base of Hero */}
        <div className="border-t border-white/15 bg-[#06153D]/95 p-3 sm:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {quickDockItems.map((item) => (
              <button
                key={item.route}
                type="button"
                onClick={() => onNavigate(item.route)}
                className="group text-left rounded-xl bg-white/5 hover:bg-white/12 border border-white/10 hover:border-[#F5B800]/60 px-3.5 py-3 flex items-center gap-3 transition-colors cursor-pointer"
              >
                <span
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${item.accentClass}`}
                >
                  {item.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-xs sm:text-[13px] text-white group-hover:text-[#F5B800] truncate">
                    {item.title}
                  </p>
                  <p className="text-[11px] text-blue-100/75 truncate mt-0.5 tabular-nums">
                    {item.subtitle}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-blue-200/60 group-hover:text-[#F5B800] shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Active Order Live Alert (Only rendered when user has an active in-flight order) */}
      {activeOrder && (
        <button
          type="button"
          onClick={() => onNavigate('orders')}
          className="w-full text-left rounded-2xl bg-white dark:bg-[#0E172E] border border-[#F5B800] p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-amber-50/40 dark:hover:bg-blue-950/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="w-11 h-11 rounded-xl bg-[#0B2A6F] text-[#F5B800] flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] font-mono-num font-bold text-[#0B2A6F] dark:text-[#F5B800] uppercase">
                <span>{lang === 'sw' ? 'Oda Inayoendelea' : 'Active Order'}</span>
                <span aria-hidden="true">·</span>
                <span>{activeOrder.orderNumber}</span>
                <span aria-hidden="true">·</span>
                <span>{activeOrder.status}</span>
              </div>
              <p className="font-semibold text-sm text-neutral-900 dark:text-white truncate mt-0.5">
                {activeOrder.itemsSummary}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                {activeOrder.deliveryAddress}
              </p>
            </div>
          </div>
          <span className="px-4 py-2 rounded-xl bg-[#0B2A6F] text-[#F5B800] text-xs font-bold inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            <span>{lang === 'sw' ? 'Fuatilia' : 'Track'}</span>
            <ChevronRight className="w-4 h-4" />
          </span>
        </button>
      )}

      {/* Role-Specific Tools Strip (for Admin / Business / Agent accounts) */}
      {roleExtras.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {roleExtras.map((extra) => (
            <button
              key={extra.route}
              type="button"
              onClick={() => onNavigate(extra.route)}
              className="text-left rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 hover:border-[#F5B800] transition-colors cursor-pointer flex items-center gap-3.5"
            >
              <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-blue-950/60 flex items-center justify-center shrink-0">
                {extra.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold text-sm text-neutral-900 dark:text-white truncate">
                  {extra.title}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                  {extra.desc}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* SECTION 2: Kuhusu OILCOM, Dhamira, Maono, Thamani & Bei Elekezi */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch">
        {/* Left Feature Card: Kuhusu OILCOM */}
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 overflow-hidden flex flex-col justify-between">
          <div>
            <div className="bg-gradient-to-br from-[#071A4A] via-[#0B2A6F] to-[#13419E] p-6 flex items-center justify-between gap-4 border-b border-blue-900/40">
              <div className="space-y-1">
                <OilcomWordmark className="h-9" />
                <h2 className="font-display font-bold text-lg text-white pt-1">
                  {lang === 'sw' ? 'Kuhusu OILCOM Tanzania' : 'About OILCOM Tanzania'}
                </h2>
              </div>
              <span className="font-mono-num text-xs font-bold text-[#F5B800] shrink-0">
                TZ · EA
              </span>
            </div>

            <div className="p-5 sm:p-6 space-y-3">
              <p className="text-sm text-neutral-700 dark:text-neutral-200 leading-relaxed">
                {lang === 'sw'
                  ? 'OILCOM ni kampuni inayoongoza katika sekta ya nishati Tanzania na Afrika Mashariki. Tunatoa mafuta ya hali ya juu, gesi ya kupikia (LPG), usafirishaji salama na huduma za kisasa za kidijitali kwa wateja binafsi na biashara.'
                  : 'OILCOM is a leading energy enterprise across Tanzania and East Africa, supplying high-grade automotive fuels, clean LPG cooking gas, bulk transport, and digital customer services.'}
              </p>
              <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums pt-1">
                <span>
                  {stations.length}+{' '}
                  {lang === 'sw' ? 'Vituo Vilivyosajiliwa' : 'Registered Hubs'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{lang === 'sw' ? 'Huduma 24/7' : '24/7 Operations'}</span>
              </div>
            </div>
          </div>

          <div className="px-5 sm:px-6 pb-5 sm:pb-6 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setAboutModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#D92027] hover:bg-[#b81b21] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
            >
              <span>{lang === 'sw' ? 'Soma Zaidi' : 'Read More'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('stations')}
              className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-blue-900 hover:border-[#0B2A6F] dark:hover:border-[#F5B800] text-neutral-800 dark:text-neutral-100 text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors"
            >
              {lang === 'sw' ? 'Vituo Vyote Kwenye Ramani' : 'All Stations on Map'}
            </button>
          </div>
        </div>

        {/* Right 2x2 Pillar + Live Pricing Bento Grid */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Dhamira Yetu */}
          <div className="rounded-2xl bg-[#0B2A6F] text-white p-5 sm:p-6 flex flex-col justify-between gap-4 border border-blue-900/50">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#F5B800] text-[#071A4A] flex items-center justify-center shrink-0">
                <Target className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-base text-[#F5B800]">
                {lang === 'sw' ? 'Dhamira Yetu' : 'Our Mission'}
              </h3>
            </div>
            <p className="text-sm text-blue-50/90 leading-relaxed">
              {lang === 'sw'
                ? 'Kutoa nishati bora kwa wote — kwa ubora, usalama wa hali ya juu na huduma ya haraka kila mahali.'
                : 'To deliver reliable, high-grade energy for everyone through operational safety and responsive service.'}
            </p>
          </div>

          {/* Maono Yetu */}
          <div className="rounded-2xl bg-[#D92027] text-white p-5 sm:p-6 flex flex-col justify-between gap-4 border border-red-800/50">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-white text-[#D92027] flex items-center justify-center shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-base text-white">
                {lang === 'sw' ? 'Maono Yetu' : 'Our Vision'}
              </h3>
            </div>
            <p className="text-sm text-red-50/95 leading-relaxed">
              {lang === 'sw'
                ? 'Kuwa kampuni bora na inayoaminika zaidi katika usambazaji wa nishati Afrika Mashariki.'
                : 'To be East Africa’s benchmark energy provider trusted for quality fuel, clean LPG, and modern logistics.'}
            </p>
          </div>

          {/* Thamani Zetu */}
          <div className="rounded-2xl bg-[#091C4E] text-white p-5 sm:p-6 flex flex-col justify-between gap-3 border border-blue-900/50">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-white/10 text-[#F5B800] flex items-center justify-center shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-base text-[#F5B800]">
                {lang === 'sw' ? 'Thamani Zetu' : 'Our Core Values'}
              </h3>
            </div>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:text-sm text-blue-50/90">
              {(lang === 'sw'
                ? ['Uaminifu', 'Ubora', 'Ushirikiano', 'Huduma Bora']
                : ['Integrity', 'Quality', 'Teamwork', 'Service Excellence']
              ).map((val) => (
                <li key={val} className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#F5B800] shrink-0" />
                  <span className="truncate">{val}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Live Catalog Pricing Card (Real Data from Firestore Catalog) */}
          <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-5 sm:p-6 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
                {lang === 'sw' ? 'Bei Elekezi za Sasa' : 'Current Catalog Rates'}
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('fuel')}
                className="text-xs font-semibold text-[#0B2A6F] dark:text-[#F5B800] hover:underline cursor-pointer whitespace-nowrap"
              >
                {lang === 'sw' ? 'Agiza' : 'Order'}
              </button>
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-blue-950 text-xs sm:text-sm">
              <div className="py-1.5 flex items-center justify-between gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">
                  Petrol (Unleaded)
                </span>
                <span className="font-mono-num font-bold text-neutral-900 dark:text-white">
                  {formatTzs(livePricing.petrol)}/L
                </span>
              </div>
              <div className="py-1.5 flex items-center justify-between gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">
                  Diesel (AGO)
                </span>
                <span className="font-mono-num font-bold text-neutral-900 dark:text-white">
                  {formatTzs(livePricing.diesel)}/L
                </span>
              </div>
              <div className="py-1.5 flex items-center justify-between gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">
                  OILCOM Gas 15kg
                </span>
                <span className="font-mono-num font-bold text-[#D92027] dark:text-[#F5B800]">
                  {formatTzs(livePricing.lpg15)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: Live Orders & Promotions / Habari Muhimu */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* Recent Orders or Guest Account Onboarding Card */}
        <div className="min-w-0 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-5 sm:p-6 flex flex-col justify-between">
          {isGuest ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
                  {lang === 'sw'
                    ? 'Akaunti ya Mteja na Biashara'
                    : 'Customer & Business Account'}
                </h3>
                <span className="text-xs font-semibold text-[#0B2A6F] dark:text-[#F5B800]">
                  OILCOM Digital
                </span>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {lang === 'sw'
                  ? 'Ingia au jisajili bure ili kuagiza mitungi ya OILCOM Gas nyumbani, kununua vocha za mafuta, kufuatilia usafirishaji na kukusanya pointi za zawadi.'
                  : 'Sign in or register for free to order OILCOM LPG cylinders online, purchase fuel vouchers, track deliveries, and earn OILCOM Rewards points.'}
              </p>
              <ul className="space-y-1.5 text-xs text-neutral-600 dark:text-neutral-300">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#D92027] shrink-0" />
                  <span>
                    {lang === 'sw'
                      ? 'Uagizaji wa gesi (6kg, 15kg, 38kg) na mafuta mtandaoni'
                      : 'Online LPG cylinder (6kg, 15kg, 38kg) and fuel ordering'}
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#D92027] shrink-0" />
                  <span>
                    {lang === 'sw'
                      ? 'Kadi ya QR ya OILCOM Rewards na vocha za punguzo'
                      : 'Verified OILCOM Rewards QR card and discount vouchers'}
                  </span>
                </li>
              </ul>
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                {onOpenAuth && (
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    className="px-4 py-2 rounded-xl bg-[#0B2A6F] hover:bg-[#092259] text-white text-xs font-bold cursor-pointer transition-colors"
                  >
                    {lang === 'sw' ? 'Ingia au Jisajili Sasa' : 'Sign In or Register'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate('stations')}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-blue-900 hover:border-[#0B2A6F] dark:hover:border-[#F5B800] text-neutral-800 dark:text-neutral-100 text-xs font-semibold cursor-pointer transition-colors"
                >
                  {lang === 'sw' ? 'Tazama Vituo Kwanza' : 'Browse Stations First'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
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
                <div className="py-6 text-center space-y-3">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {lang === 'sw'
                      ? 'Bado hujafanya oda yoyote.'
                      : 'You have not placed any orders yet.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('gas')}
                    className="px-4 py-2 rounded-xl bg-[#0B2A6F] hover:bg-[#092259] text-white text-xs font-bold cursor-pointer transition-colors"
                  >
                    {lang === 'sw' ? 'Agiza OILCOM Gas Sasa' : 'Order OILCOM Gas Now'}
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-neutral-100 dark:divide-blue-950">
                  {orders.slice(0, 4).map((ord) => (
                    <div
                      key={ord.id}
                      className="py-2.5 flex items-center justify-between gap-3"
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
                      <span className="font-mono-num text-sm font-bold text-neutral-900 dark:text-white shrink-0">
                        {formatTzs(ord.totalTzs)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Promotions & Interactive Habari Muhimu */}
        <div className="min-w-0 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
                {lang === 'sw' ? 'Promosheni & Matangazo' : 'Promotions & Highlights'}
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('rewards')}
                className="text-xs font-semibold text-[#0B2A6F] dark:text-[#F5B800] hover:underline cursor-pointer"
              >
                {t(lang, 'viewRewards')}
              </button>
            </div>

            {promotions.length > 0 ? (
              <div className="space-y-2.5">
                {promotions.slice(0, 2).map((promo) => (
                  <div
                    key={promo.id}
                    className="p-3.5 rounded-xl bg-neutral-50 dark:bg-blue-950/35 border border-neutral-200/80 dark:border-blue-900/50"
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
            ) : (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 py-3">
                {lang === 'sw'
                  ? 'Hakuna promosheni maalum kwa sasa — endelea kukusanya pointi kwa kila ununuzi.'
                  : 'No active multiplier campaign right now — continue earning points on every purchase.'}
              </p>
            )}
          </div>

          {/* Habari Muhimu Switcher Bar (inspired by reference banner) */}
          {activeNews && (
            <div className="rounded-xl bg-[#071A4A] text-white p-3.5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onNavigate(activeNews.route)}
                className="flex items-start gap-2.5 text-left min-w-0 flex-1 cursor-pointer group"
              >
                <Megaphone className="w-4 h-4 text-[#F5B800] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#F5B800] group-hover:underline truncate">
                    {lang === 'sw' ? 'Habari Muhimu' : 'Highlight'} · {activeNews.title}
                  </p>
                  <p className="text-[11px] text-blue-100/85 line-clamp-1 mt-0.5">
                    {activeNews.detail}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setNewsIndex((i) => (i - 1 + newsItems.length) % newsItems.length)
                  }
                  aria-label="Previous update"
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setNewsIndex((i) => (i + 1) % newsItems.length)}
                  aria-label="Next update"
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 4: Quiet Contact & Corporate Footer Strip */}
      <footer className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-neutral-600 dark:text-neutral-300">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="font-display font-bold text-neutral-900 dark:text-white">
            OILCOM Tanzania Ltd
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-[#D92027]" />
            Dar es Salaam, Tanzania
          </span>
          <a
            href="tel:+255736123456"
            className="inline-flex items-center gap-1 hover:text-[#0B2A6F] dark:hover:text-[#F5B800]"
          >
            <Phone className="w-3.5 h-3.5 text-[#0B2A6F] dark:text-[#F5B800]" />
            +255 736 123 456
          </a>
          <a
            href="mailto:info@oilcom.co.tz"
            className="inline-flex items-center gap-1 hover:text-[#0B2A6F] dark:hover:text-[#F5B800]"
          >
            <Mail className="w-3.5 h-3.5 text-[#0B2A6F] dark:text-[#F5B800]" />
            info@oilcom.co.tz
          </a>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="font-semibold text-[#0B2A6F] dark:text-[#F5B800] hover:underline cursor-pointer"
          >
            {lang === 'sw' ? 'Msaada & Mawasiliano' : 'Support & Contact'}
          </button>
        </div>
      </footer>

      {/* About OILCOM Interactive Modal */}
      {aboutModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setAboutModalOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#0B2A6F] text-white px-5 py-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#F5B800]">
                  Energy for a Better Tomorrow
                </p>
                <h3 className="font-display font-bold text-lg">
                  {lang === 'sw' ? 'Kuhusu OILCOM Tanzania' : 'About OILCOM Tanzania'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAboutModalOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4 text-sm text-neutral-700 dark:text-neutral-200 leading-relaxed">
              <p>
                {lang === 'sw'
                  ? 'OILCOM Tanzania Limited inaendesha mtandao mpana wa vituo vya mafuta, vituo vya ujazaji na usambazaji wa gesi ya kupikia (OILCOM Gas LPG), vilainishi na usafirishaji wa nishati kote nchini.'
                  : 'OILCOM Tanzania Limited operates a nationwide network of retail fuel stations, LPG cylinder distribution hubs, lubricants supply, and industrial fleet refueling solutions across Tanzania.'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-blue-950/40 border border-neutral-200 dark:border-blue-900">
                  <p className="font-bold text-[#0B2A6F] dark:text-[#F5B800] mb-1">
                    {lang === 'sw' ? 'Bidhaa Kuu' : 'Core Products'}
                  </p>
                  <p className="text-neutral-600 dark:text-neutral-300">
                    Super Petrol, Automotive Diesel, Kerosene, OILCOM LPG (6kg, 15kg, 38kg), na Vilainishi.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-blue-950/40 border border-neutral-200 dark:border-blue-900">
                  <p className="font-bold text-[#0B2A6F] dark:text-[#F5B800] mb-1">
                    {lang === 'sw' ? 'Huduma za Kidijitali' : 'Digital Services'}
                  </p>
                  <p className="text-neutral-600 dark:text-neutral-300">
                    {lang === 'sw'
                      ? 'Uagizaji mtandaoni, ramani ya vituo 2D/3D, na mfumo wa zawadi wa OILCOM Rewards.'
                      : 'Online ordering, 2D/3D station locator, and instant OILCOM Rewards QR loyalty points.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAboutModalOpen(false);
                    onNavigate('stations');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#0B2A6F] text-white text-xs font-bold cursor-pointer"
                >
                  {lang === 'sw' ? 'Angalia Vituo Kwenye Ramani' : 'Explore Station Map'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAboutModalOpen(false);
                    onNavigate('gas');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#D92027] text-white text-xs font-bold cursor-pointer"
                >
                  {lang === 'sw' ? 'Agiza Huduma' : 'Order Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
