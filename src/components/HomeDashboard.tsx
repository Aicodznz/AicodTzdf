import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Briefcase,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Flame,
  Fuel,
  Handshake,
  ImagePlus,
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
  HomepageSlide,
  Language,
  OilcomUser,
  Product,
  Promotion,
  RewardsAccount,
  Station,
  UserRole,
} from '../types/oilcom';
import {
  DEFAULT_HERO_TANKER_PHOTO,
  HomepageSlidesManagerModal,
} from './HomepageSlidesManager';
import { formatTzs, OilcomWordmark } from './OilcomBrand';

interface HomeDashboardProps {
  lang: Language;
  user?: OilcomUser | null;
  effectiveRole: UserRole;
  rewards: RewardsAccount | null;
  orders: GasOrder[];
  promotions: Promotion[];
  products: Product[];
  stations: Station[];
  homepageSlides?: HomepageSlide[];
  adminHomepageSlides?: HomepageSlide[];
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
  homepageSlides = [],
  adminHomepageSlides,
  onNavigate,
  onOpenAuth,
}: HomeDashboardProps) {
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [slidesModalOpen, setSlidesModalOpen] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const [newsIndex, setNewsIndex] = useState(0);

  const heroSlides = useMemo(() => {
    const active = [...homepageSlides]
      .filter((s) => s.active && Boolean(s.imageUrl))
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.id.localeCompare(b.id);
      });
    if (active.length > 0) return active;
    return [
      {
        id: 'default-hero',
        title: lang === 'sw' ? 'Usambazaji wa Uhakika' : 'Nationwide Distribution',
        caption: 'Petrol · Diesel · Kerosene · LPG',
        imageUrl: DEFAULT_HERO_TANKER_PHOTO,
        sortOrder: 0,
        active: true,
        createdBy: 'system',
      } satisfies HomepageSlide,
    ];
  }, [homepageSlides, lang]);

  useEffect(() => {
    if (slideIndex >= heroSlides.length) {
      setSlideIndex(0);
    }
  }, [heroSlides.length, slideIndex]);

  useEffect(() => {
    if (heroSlides.length <= 1 || slidesModalOpen) return;
    const timer = window.setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % heroSlides.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [heroSlides.length, slidesModalOpen]);

  const activeSlide = heroSlides[slideIndex % heroSlides.length] || heroSlides[0];
  const heroImgFailed = Boolean(activeSlide && failedUrls[activeSlide.imageUrl]);

  const isGuest = !user;
  const firstName = user?.fullName.split(' ')[0] || (lang === 'sw' ? 'Mgeni' : 'Guest');
  const points = rewards?.pointsBalance ?? 0;
  const activeOrder = orders.find(
    (o) => !['delivered', 'cancelled'].includes(o.status)
  );

  // Pull live catalog rates directly from Firestore products
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
              title: 'OILCOM inazindua mtandao mpana wa vituo kote Tanzania.',
              detail: 'Karibu ujaze mafuta safi au upate OILCOM Gas kwa huduma bora zaidi.',
              route: 'stations' as AppRoute,
            },
            {
              title: 'Agiza Mitungi ya OILCOM Gas Nyumbani',
              detail: 'Mitungi ya 6kg, 15kg na 38kg inapatikana mtandaoni kwa ufuatiliaji mubashara.',
              route: 'gas' as AppRoute,
            },
            {
              title: 'Kusanya Pointi za OILCOM Rewards',
              detail: 'Onyesha QR code yako kwenye kituo chochote kupata pointi na vocha za punguzo.',
              route: 'rewards' as AppRoute,
            },
          ]
        : [
            {
              title: 'Explore verified OILCOM Stations nationwide on 2D & 3D Maps.',
              detail: 'Real-time turn-by-turn navigation to fuel and OILCOM Gas hubs.',
              route: 'stations' as AppRoute,
            },
            {
              title: 'Fast OILCOM Gas Cylinder Delivery',
              detail: 'Order 6kg, 15kg, or 38kg LPG cylinders online with live order status.',
              route: 'gas' as AppRoute,
            },
            {
              title: 'Earn OILCOM Rewards Points',
              detail: 'Scan your verified member QR code at any station to earn points and vouchers.',
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
      subtitle: 'Petrol, Diesel & LPG',
      icon: <Fuel className="w-5 h-5 text-white" />,
      accentClass: 'bg-[#D92027]',
    },
    {
      route: 'orders',
      title: lang === 'sw' ? 'Usafirishaji Mafuta' : 'Fuel Logistics',
      subtitle: activeOrder
        ? `${activeOrder.orderNumber} · ${activeOrder.status}`
        : lang === 'sw'
          ? 'Salama na Kwa Wakati'
          : 'Safe & Reliable',
      icon: <Truck className="w-5 h-5 text-white" />,
      accentClass: 'bg-[#D92027]',
    },
    {
      route: 'stations',
      title: lang === 'sw' ? 'Vituo vya Mafuta' : 'Fuel Stations',
      subtitle: lang === 'sw' ? 'Kote Tanzania' : 'Across Tanzania',
      icon: <Store className="w-5 h-5 text-white" />,
      accentClass: 'bg-[#D92027]',
    },
    {
      route: 'gas',
      title: lang === 'sw' ? 'OILCOM Gas (LPG)' : 'OILCOM Gas (LPG)',
      subtitle: lang === 'sw' ? 'Mitungi 6kg, 15kg & 38kg' : '6kg, 15kg & 38kg LPG',
      icon: <Flame className="w-5 h-5 text-white" />,
      accentClass: 'bg-[#D92027]',
    },
    {
      route: effectiveRole === 'admin' ? 'admin' : 'rewards',
      title:
        effectiveRole === 'admin'
          ? lang === 'sw'
            ? 'Usimamizi Mkuu'
            : 'Admin Console'
          : lang === 'sw'
            ? 'Zawadi & Ushirika'
            : 'Rewards & Loyalty',
      subtitle:
        effectiveRole === 'admin'
          ? lang === 'sw'
            ? 'Kituo cha Utawala'
            : 'System Operations'
          : isGuest
            ? lang === 'sw'
              ? 'Pamoja Tunashinda'
              : 'Earn Member Points'
            : `${points.toLocaleString('en-US')} ${lang === 'sw' ? 'pointi' : 'pts'} · ${rewards?.tier || 'Bronze'}`,
      icon:
        effectiveRole === 'admin' ? (
          <ShieldCheck className="w-5 h-5 text-white" />
        ) : (
          <Handshake className="w-5 h-5 text-white" />
        ),
      accentClass: 'bg-[#D92027]',
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
    <div className="w-full min-h-full flex flex-col bg-white dark:bg-[#060B18]">
      {/* SECTION 1: Bright Royal-Cobalt Panoramic Hero + Translucent 5-Tile Bottom Dock */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#06247A] via-[#0F49CC] to-[#082A8C] text-white">
        {/* Desktop / Tablet Full-Right / Full-Bleed Hero Photo Layer */}
        {activeSlide && !heroImgFailed && (
          <div className="hidden sm:block absolute inset-0 lg:left-[30%] overflow-hidden pointer-events-none">
            <img
              key={activeSlide.id}
              src={activeSlide.imageUrl}
              alt={
                activeSlide.title ||
                'OILCOM Fuel Station and Tanker Fleet — Energy for a Better Tomorrow'
              }
              referrerPolicy="no-referrer"
              onError={() =>
                setFailedUrls((prev) => ({ ...prev, [activeSlide.imageUrl]: true }))
              }
              className="w-full h-full object-cover object-center brightness-105 contrast-105 saturate-115 transition-opacity duration-500"
            />
            {/* Smooth Luminous Royal-Blue Feather Blending Left Typography Side Into Vibrant Photo */}
            <div
              className="hidden lg:block absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, #0935A8 0%, rgba(11,61,180,0.88) 14%, rgba(15,73,204,0.34) 32%, rgba(15,73,204,0) 56%)',
              }}
            />
            <div
              className="hidden sm:block lg:hidden absolute inset-0"
              style={{
                background:
                  'linear-gradient(110deg, rgba(6,32,108,0.88) 0%, rgba(11,55,168,0.68) 55%, rgba(8,36,112,0.45) 100%)',
              }}
            />
          </div>
        )}

        {/* Luminous Soft Bottom Reflection Band Behind Dock */}
        <div
          className="hidden sm:block absolute inset-x-0 bottom-0 h-28 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(6,26,84,0) 0%, rgba(5,21,70,0.68) 70%, rgba(5,19,62,0.92) 100%)',
          }}
        />

        {/* Hero Inner Content Container */}
        <div className="relative z-10 w-full px-3.5 sm:px-6 lg:px-10 pt-4 sm:pt-7 pb-4 sm:pb-5 flex flex-col justify-between gap-4 sm:min-h-[430px] lg:min-h-[460px]">
          {/* Top Bar inside Hero: Signed-In Profile Badge + Slideshow Arrows + Admin Media Control */}
          {(!isGuest || heroSlides.length > 1 || effectiveRole === 'admin') && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {!isGuest ? (
                <div className="flex items-center gap-2.5 bg-[#061D5C]/75 backdrop-blur-md border border-white/20 rounded-xl px-3 py-1.5">
                  {user?.photoUrl ? (
                    <img
                      src={user.photoUrl}
                      alt={user.fullName}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-lg object-cover border border-[#F5B800]/75 shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-[#F5B800] text-[#071A4A] font-display font-extrabold text-xs flex items-center justify-center shrink-0">
                      {firstName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {t(lang, 'helloCustomer')}, {firstName}
                    </p>
                    <p className="text-[11px] text-[#F5B800] font-mono-num truncate">
                      {rewards?.customerCode || 'OILCOM'} · {points.toLocaleString('en-US')} pts
                    </p>
                  </div>
                </div>
              ) : (
                <div aria-hidden="true" className="hidden sm:block h-4" />
              )}

              <div className="flex items-center gap-2 ml-auto">
                {heroSlides.length > 1 && (
                  <div className="hidden sm:flex items-center gap-1.5 bg-[#061A4D]/75 backdrop-blur-md border border-white/25 rounded-full px-2.5 py-1">
                    <button
                      type="button"
                      onClick={() =>
                        setSlideIndex(
                          (prev) => (prev - 1 + heroSlides.length) % heroSlides.length
                        )
                      }
                      aria-label="Previous photo"
                      className="p-0.5 rounded-full hover:bg-white/15 text-white cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex items-center gap-1 px-1">
                      {heroSlides.map((s, idx) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSlideIndex(idx)}
                          aria-label={`Slide ${idx + 1}`}
                          className={`h-1.5 rounded-full transition-all cursor-pointer ${
                            idx === slideIndex % heroSlides.length
                              ? 'w-4 bg-[#F5B800]'
                              : 'w-1.5 bg-white/45 hover:bg-white/80'
                          }`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSlideIndex((prev) => (prev + 1) % heroSlides.length)
                      }
                      aria-label="Next photo"
                      className="p-0.5 rounded-full hover:bg-white/15 text-white cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {effectiveRole === 'admin' && (
                  <button
                    type="button"
                    onClick={() => setSlidesModalOpen(true)}
                    className="px-3.5 py-1.5 rounded-full bg-[#F5B800] hover:bg-[#e5aa00] text-[#071A4A] text-xs font-extrabold inline-flex items-center gap-1.5 shadow-lg cursor-pointer transition-colors"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>{lang === 'sw' ? 'Badilisha Picha' : 'Change Photo(s)'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Editorial Block (Mobile avoids duplicate large logo; Desktop keeps exact brand stack) */}
          <div className="max-w-lg space-y-2.5 sm:space-y-3.5 my-auto lg:pl-2">
            <div className="space-y-1">
              <div className="hidden sm:block">
                <OilcomWordmark className="h-[64px] lg:h-[76px] drop-shadow-[0_6px_18px_rgba(3,14,52,0.5)]" />
              </div>
              <div className="inline-block">
                <p className="text-xs sm:text-base italic font-bold text-white tracking-wide drop-shadow-xs">
                  <span className="sm:hidden text-[#FFD028] not-italic font-extrabold mr-1.5">OILCOM</span>
                  Energy for a Better Tomorrow
                </p>
                <div className="mt-0.5 h-[2px] w-40 sm:w-44 rounded-full bg-gradient-to-r from-[#D92027] via-[#F5B800] to-transparent" />
              </div>
            </div>

            <div className="space-y-1">
              <h1
                className="font-display font-extrabold tracking-tight leading-[1.08] text-white drop-shadow-[0_4px_14px_rgba(3,14,52,0.45)]"
                style={{ fontSize: 'clamp(1.75rem, 3.6vw, 3.1rem)' }}
              >
                {lang === 'sw' ? (
                  <>
                    Nishati Bora,{' '}
                    <span className="italic text-[#FFD028]">Maisha Bora</span>
                  </>
                ) : (
                  <>
                    Better Energy,{' '}
                    <span className="italic text-[#FFD028]">Better Life</span>
                  </>
                )}
              </h1>

              <p className="text-xs sm:text-[15px] italic text-blue-50/95 max-w-md leading-relaxed">
                {lang === 'sw'
                  ? 'Tunaweka nishati karibu nawe, kila wakati, mahali popote.'
                  : 'Putting clean fuel, OILCOM LPG, and certified stations near you anytime, anywhere.'}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('gas')}
                className="px-3.5 sm:px-5 py-2.5 rounded-full bg-[#D92027] hover:bg-[#b81b21] border border-white/25 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 sm:gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-[0_6px_18px_rgba(217,32,39,0.45)]"
              >
                <Fuel className="w-4 h-4 text-white shrink-0" />
                <span>{lang === 'sw' ? 'Huduma Zetu' : 'Our Services'}</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('stations')}
                className="px-3.5 sm:px-5 py-2.5 rounded-full bg-[#072166]/70 hover:bg-[#0B2A6F]/90 backdrop-blur-sm border border-white/70 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 sm:gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-md"
              >
                <MapPin className="w-4 h-4 text-[#FFD028] shrink-0" />
                <span>{lang === 'sw' ? 'Tazama Vituo' : 'View Stations'}</span>
              </button>
            </div>
          </div>

          {/* Mobile Crisp 16:9 Showcase Photo Frame (Prevents Cropped Pillar Zoom Behind Text) */}
          {activeSlide && !heroImgFailed && (
            <div className="sm:hidden relative rounded-2xl overflow-hidden border border-white/25 shadow-xl aspect-[16/9] bg-[#061A4D]">
              <img
                key={`mobile-${activeSlide.id}`}
                src={activeSlide.imageUrl}
                alt={
                  activeSlide.title ||
                  'OILCOM Fuel Station and Tanker Fleet — Energy for a Better Tomorrow'
                }
                referrerPolicy="no-referrer"
                onError={() =>
                  setFailedUrls((prev) => ({ ...prev, [activeSlide.imageUrl]: true }))
                }
                className="w-full h-full object-cover object-center brightness-105 contrast-105 saturate-110"
              />
              {heroSlides.length > 1 && (
                <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-[#061A4D]/80 backdrop-blur-md border border-white/25 rounded-full px-2 py-1">
                  <button
                    type="button"
                    onClick={() =>
                      setSlideIndex(
                        (prev) => (prev - 1 + heroSlides.length) % heroSlides.length
                      )
                    }
                    aria-label="Previous photo"
                    className="p-0.5 text-white cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono-num font-bold text-[#FFD028] px-1">
                    {(slideIndex % heroSlides.length) + 1}/{heroSlides.length}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSlideIndex((prev) => (prev + 1) % heroSlides.length)
                    }
                    aria-label="Next photo"
                    className="p-0.5 text-white cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Translucent Sapphire-Glass 5-Tile Navigation Dock (Compact 2x2 + Full-Width 5th on Phone) */}
          <div className="rounded-2xl bg-[#07236A]/85 backdrop-blur-md border border-white/25 p-1.5 sm:p-2 shadow-[0_14px_34px_rgba(3,12,48,0.45)]">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-1.5">
              {quickDockItems.map((item, idx) => (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => onNavigate(item.route)}
                  className={`group text-left rounded-xl bg-white/[0.06] hover:bg-white/[0.15] border border-white/15 hover:border-[#FFD028]/75 px-2.5 sm:px-3 py-2 flex items-center gap-2 sm:gap-2.5 transition-colors cursor-pointer ${
                    idx === quickDockItems.length - 1 ? 'col-span-2 lg:col-span-1' : ''
                  }`}
                >
                  <span
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0 border border-white/30 shadow-sm ${item.accentClass}`}
                  >
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold text-[11.5px] sm:text-[13px] text-white group-hover:text-[#FFD028] truncate">
                      {item.title}
                    </p>
                    <p className="text-[10.5px] sm:text-[11px] text-blue-100/85 truncate tabular-nums">
                      {item.subtitle}
                    </p>
                  </div>
                  <ChevronRight className="hidden sm:block w-4 h-4 text-blue-100/75 group-hover:text-[#FFD028] shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: Kuhusu OILCOM (Bright Photo Split Card) + Dhamira / Maono / Thamani Pillars */}
      <section
        id="kuhusu-oilcom"
        className="px-3.5 sm:px-6 lg:px-10 py-3.5 sm:py-4 bg-white dark:bg-[#060B18]"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
          {/* Left 5 cols: Kuhusu OILCOM Feature Card Matching Reference */}
          <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 shadow-sm overflow-hidden grid grid-cols-1 sm:grid-cols-12">
            <div className="sm:col-span-7 flex flex-col justify-between pb-3.5">
              <div>
                <div className="inline-block bg-[#D92027] text-white font-display font-extrabold text-sm sm:text-base px-5 py-1.5 rounded-br-2xl shadow-xs">
                  {lang === 'sw' ? 'Kuhusu OILCOM' : 'About OILCOM'}
                </div>
                <p className="px-4 pt-2.5 text-xs text-neutral-700 dark:text-neutral-200 leading-relaxed">
                  {lang === 'sw'
                    ? 'OILCOM ni kampuni inayoongoza katika sekta ya nishati Tanzania. Tunatoa mafuta ya hali ya juu, usafirishaji salama na huduma bora kwa wateja wetu.'
                    : 'OILCOM is a leading energy enterprise across Tanzania, delivering clean automotive fuels, OILCOM LPG gas, and dependable service.'}
                </p>
              </div>

              <div className="px-4 pt-2.5 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setAboutModalOpen(true)}
                  className="px-4 py-1.5 rounded-full bg-[#D92027] hover:bg-[#b81b21] text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors shadow-xs"
                >
                  <span>{lang === 'sw' ? 'Soma Zaidi' : 'Read More'}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-semibold tabular-nums">
                  {stations.length}+ {lang === 'sw' ? 'Vituo' : 'Hubs'} · 24/7
                </span>
              </div>
            </div>

            {/* Bright Un-Darkened Depot/Tanker Photo Panel */}
            <div className="sm:col-span-5 relative aspect-[16/9] sm:aspect-auto sm:min-h-full overflow-hidden">
              <img
                src={activeSlide?.imageUrl || DEFAULT_HERO_TANKER_PHOTO}
                alt="OILCOM Tanzania Depot & Logistics"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover brightness-105 saturate-110"
              />
              <div
                className="hidden sm:block absolute inset-y-0 left-0 w-10 pointer-events-none"
                style={{
                  background:
                    'linear-gradient(90deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0) 100%)',
                }}
              />
            </div>
          </div>

          {/* Right 7 cols: 3 Colored Corporate Pillars (Dhamira, Maono, Thamani) */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Dhamira Yetu */}
            <div className="rounded-2xl bg-gradient-to-br from-[#0E368F] to-[#081F5B] text-white p-3.5 sm:p-4 flex flex-col justify-between gap-2 shadow-sm border border-blue-900/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#F5B800] text-[#071A4A] flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <h3 className="font-display font-bold text-[15px] text-[#FFD028]">
                  {lang === 'sw' ? 'Dhamira Yetu' : 'Our Mission'}
                </h3>
              </div>
              <p className="text-xs text-blue-50/95 leading-relaxed">
                {lang === 'sw'
                  ? 'Kutoa nishati bora kwa wote, kwa ubora, usalama na huduma ya hali ya juu.'
                  : 'Delivering quality energy for all through operational safety and reliable service.'}
              </p>
            </div>

            {/* Maono Yetu */}
            <div className="rounded-2xl bg-gradient-to-br from-[#E2252C] to-[#B8161C] text-white p-3.5 sm:p-4 flex flex-col justify-between gap-2 shadow-sm border border-red-800/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white text-[#D92027] flex items-center justify-center shrink-0">
                  <Compass className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <h3 className="font-display font-bold text-[15px] text-[#FFD028]">
                  {lang === 'sw' ? 'Maono Yetu' : 'Our Vision'}
                </h3>
              </div>
              <p className="text-xs text-red-50/95 leading-relaxed">
                {lang === 'sw'
                  ? 'Kuwa kampuni bora ya nishati Afrika Mashariki.'
                  : 'To be East Africa’s leading and most trusted energy brand.'}
              </p>
            </div>

            {/* Thamani Zetu */}
            <div className="rounded-2xl bg-gradient-to-br from-[#091E59] to-[#06133A] text-white p-3.5 sm:p-4 flex flex-col justify-between gap-2 shadow-sm border border-blue-900/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/15 text-[#FFD028] flex items-center justify-center shrink-0">
                  <Award className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <h3 className="font-display font-bold text-[15px] text-[#FFD028]">
                  {lang === 'sw' ? 'Thamani Zetu' : 'Our Values'}
                </h3>
              </div>
              <ul className="grid grid-cols-2 sm:grid-cols-1 gap-x-3 gap-y-1 text-xs text-blue-50/95">
                {(lang === 'sw'
                  ? ['Uaminifu', 'Ubora', 'Ushirikiano', 'Huduma Bora']
                  : ['Integrity', 'Quality', 'Teamwork', 'Excellence']
                ).map((val) => (
                  <li key={val} className="flex items-center gap-1.5 sm:gap-2">
                    <Check className="w-3.5 h-3.5 text-[#FFD028] shrink-0" />
                    <span className="truncate">{val}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: Habari Muhimu Full-Width Ticker Bar with Curved Bottom-Right Red/Gold Swoosh */}
      {activeNews && (
        <section
          id="habari-muhimu"
          className="relative bg-gradient-to-r from-[#071D59] via-[#0B2B78] to-[#061A4D] text-white flex flex-col sm:flex-row items-stretch overflow-hidden border-t border-b border-white/10"
        >
          <div className="flex items-center justify-between gap-2 z-10 sm:contents">
            <div className="bg-[#D92027] text-white pl-4 sm:pl-10 pr-6 sm:pr-7 py-2 sm:py-2.5 flex items-center gap-2 font-display font-extrabold text-xs sm:text-sm shrink-0 rounded-r-full shadow-md">
              <Megaphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FFD028] shrink-0" />
              <span>{lang === 'sw' ? 'Habari Muhimu:' : 'Highlights:'}</span>
            </div>

            <div className="sm:hidden flex items-center gap-1.5 pr-3.5">
              <button
                type="button"
                onClick={() =>
                  setNewsIndex((i) => (i - 1 + newsItems.length) % newsItems.length)
                }
                aria-label="Previous update"
                className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setNewsIndex((i) => (i + 1) % newsItems.length)}
                aria-label="Next update"
                className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 px-3.5 sm:px-6 lg:pr-32 py-2.5 flex items-center justify-between gap-3 min-w-0 z-10">
            <button
              type="button"
              onClick={() => onNavigate(activeNews.route)}
              className="text-left min-w-0 flex-1 cursor-pointer group"
            >
              <p className="text-xs sm:text-[13px] font-semibold text-white group-hover:text-[#FFD028] line-clamp-2 sm:truncate transition-colors leading-snug">
                {activeNews.title}{' '}
                <span className="font-normal text-blue-100/85">
                  {activeNews.detail}
                </span>
              </p>
            </button>

            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setNewsIndex((i) => (i - 1 + newsItems.length) % newsItems.length)
                }
                aria-label="Previous update"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setNewsIndex((i) => (i + 1) % newsItems.length)}
                aria-label="Next update"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Signature Red & Gold Curved Bottom-Right Swoosh SVG */}
          <svg
            viewBox="0 0 180 56"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="hidden lg:block pointer-events-none absolute right-0 top-0 h-full w-36 z-0"
          >
            <path d="M25,56 C75,18 125,4 180,0 L180,56 Z" fill="#FFD028" />
            <path d="M55,56 C100,24 140,12 180,10 L180,56 Z" fill="#D92027" />
          </svg>
        </section>
      )}

      {/* Active Order Live Alert (Only when user has an active in-flight order) */}
      {activeOrder && (
        <button
          type="button"
          onClick={() => onNavigate('orders')}
          className="w-full text-left bg-white dark:bg-[#0E172E] border-b border-[#F5B800] px-4 sm:px-6 lg:px-10 py-3.5 flex items-center justify-between gap-4 hover:bg-amber-50/40 dark:hover:bg-blue-950/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-[#0B2A6F] text-[#F5B800] flex items-center justify-center shrink-0">
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
            </div>
          </div>
          <span className="px-4 py-2 rounded-full bg-[#0B2A6F] text-[#F5B800] text-xs font-bold inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            <span>{lang === 'sw' ? 'Fuatilia' : 'Track'}</span>
            <ChevronRight className="w-4 h-4" />
          </span>
        </button>
      )}

      {/* Role-Specific Operations Bar (Admin / Business / Agent) */}
      {roleExtras.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-neutral-200 dark:divide-blue-950 border-b border-neutral-200 dark:border-blue-950 bg-white dark:bg-[#0E172E]">
          {roleExtras.map((extra) => (
            <button
              key={extra.route}
              type="button"
              onClick={() => onNavigate(extra.route)}
              className="text-left px-5 lg:px-10 py-3.5 hover:bg-neutral-50 dark:hover:bg-blue-950/35 transition-colors cursor-pointer flex items-center gap-3.5"
            >
              <div className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-blue-950/60 flex items-center justify-center shrink-0">
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

      {/* SECTION 4: Below-the-Fold Live Catalog Rates, Account / Orders & Promotions */}
      <section className="px-3 sm:px-6 lg:px-10 py-4 bg-[#EEF3FA] dark:bg-[#060B18]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
          {/* Live Catalog Pricing Card */}
          <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-5 flex flex-col justify-between gap-3">
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
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">
                  Petrol (Unleaded)
                </span>
                <span className="font-mono-num font-bold text-neutral-900 dark:text-white">
                  {formatTzs(livePricing.petrol)}/L
                </span>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">
                  Diesel (AGO)
                </span>
                <span className="font-mono-num font-bold text-neutral-900 dark:text-white">
                  {formatTzs(livePricing.diesel)}/L
                </span>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">
                  OILCOM Gas 15kg
                </span>
                <span className="font-mono-num font-bold text-[#D92027] dark:text-[#F5B800]">
                  {formatTzs(livePricing.lpg15)}
                </span>
              </div>
            </div>
          </div>

          {/* Guest Account Onboarding or Recent Orders */}
          <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-5 flex flex-col justify-between">
            {isGuest ? (
              <div className="space-y-3">
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
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  {lang === 'sw'
                    ? 'Jisajili bure kuagiza OILCOM Gas nyumbani, kununua vocha za mafuta na kukusanya pointi.'
                    : 'Register free to order OILCOM LPG online, buy fuel vouchers, and earn Rewards points.'}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {onOpenAuth && (
                    <button
                      type="button"
                      onClick={onOpenAuth}
                      className="px-4 py-2 rounded-full bg-[#0B2A6F] hover:bg-[#092259] text-white text-xs font-bold cursor-pointer transition-colors"
                    >
                      {lang === 'sw' ? 'Ingia / Jisajili' : 'Sign In / Register'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigate('stations')}
                    className="px-3.5 py-2 rounded-full border border-neutral-200 dark:border-blue-900 hover:border-[#0B2A6F] text-neutral-800 dark:text-neutral-100 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    {lang === 'sw' ? 'Vituo' : 'Stations'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
                    {lang === 'sw' ? 'Oda za Hivi Karibuni' : 'Recent Orders'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => onNavigate('orders')}
                    className="text-xs font-semibold text-[#0B2A6F] dark:text-[#F5B800] hover:underline cursor-pointer"
                  >
                    {lang === 'sw' ? 'Zote' : 'View All'}
                  </button>
                </div>

                {orders.length === 0 ? (
                  <div className="py-4 text-center space-y-2.5">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {lang === 'sw'
                        ? 'Bado hujafanya oda yoyote.'
                        : 'No orders placed yet.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigate('gas')}
                      className="px-4 py-2 rounded-full bg-[#0B2A6F] text-white text-xs font-bold cursor-pointer"
                    >
                      {lang === 'sw' ? 'Agiza Gesi Sasa' : 'Order Gas Now'}
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-100 dark:divide-blue-950">
                    {orders.slice(0, 3).map((ord) => (
                      <div
                        key={ord.id}
                        className="py-2 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white truncate">
                            {ord.orderNumber} · {ord.itemsSummary}
                          </p>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                            {ord.status.toUpperCase()} · {ord.paymentStatus}
                          </p>
                        </div>
                        <span className="font-mono-num text-xs font-bold text-neutral-900 dark:text-white shrink-0">
                          {formatTzs(ord.totalTzs)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Promotions Card */}
          <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
                {lang === 'sw' ? 'Promosheni & Rewards' : 'Promotions & Rewards'}
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
              <div className="space-y-2">
                {promotions.slice(0, 2).map((promo) => (
                  <div
                    key={promo.id}
                    className="p-2.5 rounded-xl bg-neutral-50 dark:bg-blue-950/35 border border-neutral-200/80 dark:border-blue-900/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-xs text-neutral-900 dark:text-white truncate">
                        {lang === 'sw' ? promo.titleSw : promo.titleEn}
                      </p>
                      <span className="font-mono-num text-[11px] font-bold text-[#0B2A6F] dark:text-[#F5B800] shrink-0">
                        {promo.pointsMultiplier}x pts
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-neutral-600 dark:text-neutral-300 line-clamp-1">
                      {lang === 'sw' ? promo.descriptionSw : promo.descriptionEn}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {lang === 'sw'
                  ? 'Endelea kukusanya pointi kwa kila ununuzi wa mafuta au gesi.'
                  : 'Continue earning points on every fuel or LPG purchase.'}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 5: Full-Bleed Corporate Footer Strip */}
      <footer
        id="mawasiliano"
        className="mt-auto bg-[#071A4A] text-blue-100/90 border-t border-white/15 px-4 sm:px-6 lg:px-10 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="font-display font-bold text-white">
            OILCOM Tanzania Ltd
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-[#F5B800]" />
            Dar es Salaam, Tanzania
          </span>
          <a
            href="tel:+255736123456"
            className="inline-flex items-center gap-1 hover:text-[#F5B800]"
          >
            <Phone className="w-3.5 h-3.5 text-[#F5B800]" />
            +255 736 123 456
          </a>
          <a
            href="mailto:info@oilcom.co.tz"
            className="inline-flex items-center gap-1 hover:text-[#F5B800]"
          >
            <Mail className="w-3.5 h-3.5 text-[#F5B800]" />
            info@oilcom.co.tz
          </a>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="font-semibold text-[#F5B800] hover:underline cursor-pointer"
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
                  className="px-4 py-2 rounded-full bg-[#0B2A6F] text-white text-xs font-bold cursor-pointer"
                >
                  {lang === 'sw' ? 'Angalia Vituo Kwenye Ramani' : 'Explore Station Map'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAboutModalOpen(false);
                    onNavigate('gas');
                  }}
                  className="px-4 py-2 rounded-full bg-[#D92027] text-white text-xs font-bold cursor-pointer"
                >
                  {lang === 'sw' ? 'Agiza Huduma' : 'Order Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Quick Media Manager Modal */}
      {effectiveRole === 'admin' && (
        <HomepageSlidesManagerModal
          open={slidesModalOpen}
          lang={lang}
          slides={adminHomepageSlides ?? homepageSlides}
          onClose={() => setSlidesModalOpen(false)}
        />
      )}
    </div>
  );
}
