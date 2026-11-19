import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Bell,
  Briefcase,
  Flame,
  Fuel,
  Gift,
  Globe,
  Home,
  MapPin,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Store,
  Sun,
  Truck,
  User as UserIcon,
  X,
} from 'lucide-react';
import { AdminConsoleModule } from './components/AdminConsoleModule';
import { AgentPortalModule } from './components/AgentPortalModule';
import { AuthScreen } from './components/AuthScreen';
import { BusinessPortalModule } from './components/BusinessPortalModule';
import { FuelAndGasModule } from './components/FuelAndGasModule';
import { HomeDashboard } from './components/HomeDashboard';
import { OilcomCamelMark } from './components/OilcomBrand';
import { OrdersAndPaymentsModule } from './components/OrdersAndPaymentsModule';
import { ProfileAndSupportModule } from './components/ProfileAndSupportModule';
import { OfflineIndicator, PWAInstallButton } from './components/PwaControls';
import { RewardsModule } from './components/RewardsModule';
import { StationsMapModule } from './components/StationsMapModule';
import { t } from './i18n/translations';
import { fetchPublicConfig } from './lib/api';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import {
  DEFAULT_SYSTEM_SETTINGS,
  DEMO_PRODUCTS,
  DEMO_PROMOTIONS,
  DEMO_STATIONS,
  ensureUserDocuments,
  seedCatalogIfAdmin,
} from './lib/seedData';
import type {
  AgentInventoryItem,
  AgentProfile,
  AppNotification,
  AppRoute,
  AuditLogEntry,
  BusinessAccount,
  BusinessMember,
  BusinessOrder,
  CustomerAddress,
  CustomerProfile,
  DeliveryRecord,
  GasOrder,
  Invoice,
  Language,
  OilcomUser,
  PaymentRecord,
  Product,
  Promotion,
  RewardsAccount,
  RewardsTransaction,
  Station,
  StockMovement,
  SystemSettings,
  ThemeMode,
  UserRole,
  Voucher,
} from './types/oilcom';

const FALLBACK_STATIONS: Station[] = DEMO_STATIONS.map((st, idx) => ({
  ...st,
  id: `station_demo_${idx + 1}`,
}));

const FALLBACK_PRODUCTS: Product[] = DEMO_PRODUCTS.map((p, idx) => ({
  ...p,
  id: `prod_demo_${idx + 1}`,
}));

const FALLBACK_PROMOTIONS: Promotion[] = DEMO_PROMOTIONS.map((p, idx) => ({
  ...p,
  id: `promo_demo_${idx + 1}`,
}));

function sortByCreatedDesc<T extends { createdAt?: unknown }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta =
      a.createdAt && typeof a.createdAt === 'object' && 'toMillis' in a.createdAt
        ? (a.createdAt as { toMillis: () => number }).toMillis()
        : 0;
    const tb =
      b.createdAt && typeof b.createdAt === 'object' && 'toMillis' in b.createdAt
        ? (b.createdAt as { toMillis: () => number }).toMillis()
        : 0;
    return tb - ta;
  });
}

export default function App() {
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('oilcom_lang');
    return saved === 'en' ? 'en' : 'sw';
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('oilcom_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [route, setRoute] = useState<AppRoute>('home');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchText, setSearchText] = useState('');

  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [bootstrappedAdmin, setBootstrappedAdmin] = useState(false);
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null);

  const [userDoc, setUserDoc] = useState<OilcomUser | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [rewardsAccount, setRewardsAccount] = useState<RewardsAccount | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [stations, setStations] = useState<Station[]>(FALLBACK_STATIONS);
  const [products, setProducts] = useState<Product[]>(FALLBACK_PRODUCTS);
  const [promotions, setPromotions] = useState<Promotion[]>(FALLBACK_PROMOTIONS);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);

  const [orders, setOrders] = useState<GasOrder[]>([]);
  const [agentOrders, setAgentOrders] = useState<GasOrder[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [agentDeliveries, setAgentDeliveries] = useState<DeliveryRecord[]>([]);
  const [rewardsTx, setRewardsTx] = useState<RewardsTransaction[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const [businesses, setBusinesses] = useState<BusinessAccount[]>([]);
  const [businessMembers, setBusinessMembers] = useState<BusinessMember[]>([]);
  const [businessOrders, setBusinessOrders] = useState<BusinessOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [approvedDealers, setApprovedDealers] = useState<AgentProfile[]>([]);
  const [myAgents, setMyAgents] = useState<AgentProfile[]>([]);
  const [allAgentsAdmin, setAllAgentsAdmin] = useState<AgentProfile[]>([]);
  const [inventory, setInventory] = useState<AgentInventoryItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const [allUsersAdmin, setAllUsersAdmin] = useState<OilcomUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('oilcom_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem('oilcom_lang', lang);
  }, [lang]);

  useEffect(() => {
    fetchPublicConfig()
      .then((cfg) => {
        if (cfg.googleMapsApiKey) {
          setGoogleMapsApiKey(cfg.googleMapsApiKey);
        }
      })
      .catch(() => {
        // Keep env fallback
      });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFbUser(u);
      if (u) {
        try {
          const { isBootstrappedAdmin } = await ensureUserDocuments(u, lang);
          setBootstrappedAdmin(isBootstrappedAdmin);
          if (isBootstrappedAdmin) {
            await seedCatalogIfAdmin();
          }
        } catch (err) {
          console.error('Bootstrap error:', err);
        }
      } else {
        setBootstrappedAdmin(false);
        setUserDoc(null);
        setCustomerProfile(null);
        setRewardsAccount(null);
        setPreviewRole(null);
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Core user + catalog Firestore subscriptions (guarded by authReady && fbUser)
  useEffect(() => {
    if (!authReady || !fbUser) return;
    const uid = fbUser.uid;
    const unsubs: (() => void)[] = [];

    unsubs.push(
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          if (snap.exists()) {
            setUserDoc(snap.data() as OilcomUser);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'customer_profiles', uid),
        (snap) => {
          if (snap.exists()) {
            setCustomerProfile(snap.data() as CustomerProfile);
          }
        },
        (err) =>
          handleFirestoreError(err, OperationType.GET, `customer_profiles/${uid}`)
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'rewards_accounts', uid),
        (snap) => {
          if (snap.exists()) {
            setRewardsAccount(snap.data() as RewardsAccount);
          }
        },
        (err) =>
          handleFirestoreError(err, OperationType.GET, `rewards_accounts/${uid}`)
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'system_settings', 'global'),
        (snap) => {
          if (snap.exists()) {
            setSettings(snap.data() as SystemSettings);
          }
        },
        (err) =>
          handleFirestoreError(err, OperationType.GET, 'system_settings/global')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'stations'),
        (snap) => {
          if (!snap.empty) {
            setStations(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Station, 'id'>) }))
            );
          } else {
            setStations(FALLBACK_STATIONS);
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'stations')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'products'),
        (snap) => {
          if (!snap.empty) {
            setProducts(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Product, 'id'>) }))
            );
          } else {
            setProducts(FALLBACK_PRODUCTS);
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'products')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'promotions'),
        (snap) => {
          if (!snap.empty) {
            setPromotions(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Promotion, 'id'>) }))
            );
          } else {
            setPromotions(FALLBACK_PROMOTIONS);
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'promotions')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'customer_addresses'), where('userId', '==', uid)),
        (snap) => {
          setAddresses(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<CustomerAddress, 'id'>),
            }))
          );
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, 'customer_addresses')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'vouchers'), where('userId', '==', uid)),
        (snap) => {
          setVouchers(
            sortByCreatedDesc(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<Voucher, 'id'>),
              }))
            )
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'vouchers')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'notifications'), where('userId', '==', uid)),
        (snap) => {
          setNotifications(
            sortByCreatedDesc(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<AppNotification, 'id'>),
              }))
            )
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'agents'), where('approvalStatus', '==', 'approved')),
        (snap) => {
          setApprovedDealers(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<AgentProfile, 'id'>),
            }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'agents')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'agents'), where('userId', '==', uid)),
        (snap) => {
          setMyAgents(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<AgentProfile, 'id'>),
            }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'agents/mine')
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, fbUser]);

  // Role-scoped & admin-scoped Firestore queries aligned strictly with firestore.rules
  useEffect(() => {
    if (!authReady || !fbUser) return;
    const uid = fbUser.uid;
    const isBAdmin = bootstrappedAdmin;
    const unsubs: (() => void)[] = [];

    const ordersQuery = isBAdmin
      ? collection(db, 'gas_orders')
      : query(collection(db, 'gas_orders'), where('customerId', '==', uid));
    unsubs.push(
      onSnapshot(
        ordersQuery,
        (snap) => {
          setOrders(
            sortByCreatedDesc(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<GasOrder, 'id'>),
              }))
            )
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'gas_orders')
      )
    );

    if (!isBAdmin) {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'gas_orders'), where('agentId', '==', uid)),
          (snap) => {
            setAgentOrders(
              sortByCreatedDesc(
                snap.docs.map((d) => ({
                  id: d.id,
                  ...(d.data() as Omit<GasOrder, 'id'>),
                }))
              )
            );
          },
          (err) =>
            handleFirestoreError(err, OperationType.LIST, 'gas_orders/agent')
        )
      );
    } else {
      setAgentOrders([]);
    }

    const paymentsQuery = isBAdmin
      ? collection(db, 'payments')
      : query(collection(db, 'payments'), where('userId', '==', uid));
    unsubs.push(
      onSnapshot(
        paymentsQuery,
        (snap) => {
          setPayments(
            sortByCreatedDesc(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<PaymentRecord, 'id'>),
              }))
            )
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
      )
    );

    const deliveriesQuery = isBAdmin
      ? collection(db, 'deliveries')
      : query(collection(db, 'deliveries'), where('customerId', '==', uid));
    unsubs.push(
      onSnapshot(
        deliveriesQuery,
        (snap) => {
          setDeliveries(
            sortByCreatedDesc(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<DeliveryRecord, 'id'>),
              }))
            )
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'deliveries')
      )
    );

    if (!isBAdmin) {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'deliveries'), where('agentUid', '==', uid)),
          (snap) => {
            setAgentDeliveries(
              sortByCreatedDesc(
                snap.docs.map((d) => ({
                  id: d.id,
                  ...(d.data() as Omit<DeliveryRecord, 'id'>),
                }))
              )
            );
          },
          (err) =>
            handleFirestoreError(err, OperationType.LIST, 'deliveries/agent')
        )
      );
    } else {
      setAgentDeliveries([]);
    }

    const rtxQuery = isBAdmin
      ? collection(db, 'rewards_transactions')
      : query(collection(db, 'rewards_transactions'), where('userId', '==', uid));
    unsubs.push(
      onSnapshot(
        rtxQuery,
        (snap) => {
          setRewardsTx(
            sortByCreatedDesc(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<RewardsTransaction, 'id'>),
              }))
            )
          );
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, 'rewards_transactions')
      )
    );

    const bizQuery = isBAdmin
      ? collection(db, 'businesses')
      : query(collection(db, 'businesses'), where('ownerId', '==', uid));
    unsubs.push(
      onSnapshot(
        bizQuery,
        (snap) => {
          setBusinesses(
            sortByCreatedDesc(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<BusinessAccount, 'id'>),
              }))
            )
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'businesses')
      )
    );

    const membersQuery = isBAdmin
      ? collection(db, 'business_members')
      : query(collection(db, 'business_members'), where('ownerId', '==', uid));
    unsubs.push(
      onSnapshot(
        membersQuery,
        (snap) => {
          setBusinessMembers(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<BusinessMember, 'id'>),
            }))
          );
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, 'business_members')
      )
    );

    const bOrdersQuery = isBAdmin
      ? collection(db, 'business_orders')
      : query(collection(db, 'business_orders'), where('ownerId', '==', uid));
    unsubs.push(
      onSnapshot(
        bOrdersQuery,
        (snap) => {
          setBusinessOrders(
            sortByCreatedDesc(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<BusinessOrder, 'id'>),
              }))
            )
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'business_orders')
      )
    );

    const invQuery = isBAdmin
      ? collection(db, 'invoices')
      : query(collection(db, 'invoices'), where('ownerId', '==', uid));
    unsubs.push(
      onSnapshot(
        invQuery,
        (snap) => {
          setInvoices(
            sortByCreatedDesc(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<Invoice, 'id'>),
              }))
            )
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'invoices')
      )
    );

    const invStockQuery = isBAdmin
      ? collection(db, 'agent_inventory')
      : query(collection(db, 'agent_inventory'), where('agentUid', '==', uid));
    unsubs.push(
      onSnapshot(
        invStockQuery,
        (snap) => {
          setInventory(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<AgentInventoryItem, 'id'>),
            }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'agent_inventory')
      )
    );

    const moveQuery = isBAdmin
      ? collection(db, 'stock_movements')
      : query(collection(db, 'stock_movements'), where('agentUid', '==', uid));
    unsubs.push(
      onSnapshot(
        moveQuery,
        (snap) => {
          setMovements(
            sortByCreatedDesc(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<StockMovement, 'id'>),
              }))
            )
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'stock_movements')
      )
    );

    if (isBAdmin) {
      unsubs.push(
        onSnapshot(
          collection(db, 'users'),
          (snap) => {
            setAllUsersAdmin(
              snap.docs.map((d) => d.data() as OilcomUser)
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'users')
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'agents'),
          (snap) => {
            setAllAgentsAdmin(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<AgentProfile, 'id'>),
              }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'agents/all')
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'audit_logs'),
          (snap) => {
            setAuditLogs(
              sortByCreatedDesc(
                snap.docs.map((d) => ({
                  id: d.id,
                  ...(d.data() as Omit<AuditLogEntry, 'id'>),
                }))
              )
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
        )
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, fbUser, bootstrappedAdmin]);

  const effectiveUser: OilcomUser | null = useMemo(() => {
    if (!fbUser) return null;
    if (userDoc) return userDoc;
    return {
      uid: fbUser.uid,
      fullName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Mteja wa OILCOM',
      phone: fbUser.phoneNumber || '',
      email: fbUser.email || '',
      role: bootstrappedAdmin ? 'admin' : 'customer',
      language: lang,
      status: 'active',
      photoUrl: fbUser.photoURL || '',
    };
  }, [fbUser, userDoc, bootstrappedAdmin, lang]);

  const effectiveRole: UserRole = useMemo(() => {
    if (!effectiveUser) return 'customer';
    if (effectiveUser.role === 'admin' && previewRole) {
      return previewRole;
    }
    return effectiveUser.role;
  }, [effectiveUser, previewRole]);

  const mergedOrders = useMemo(() => {
    const map = new Map<string, GasOrder>();
    orders.forEach((o) => map.set(o.id, o));
    agentOrders.forEach((o) => map.set(o.id, o));
    return sortByCreatedDesc(Array.from(map.values()));
  }, [orders, agentOrders]);

  const mergedDeliveries = useMemo(() => {
    const map = new Map<string, DeliveryRecord>();
    deliveries.forEach((d) => map.set(d.id, d));
    agentDeliveries.forEach((d) => map.set(d.id, d));
    return sortByCreatedDesc(Array.from(map.values()));
  }, [deliveries, agentDeliveries]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const navItems = useMemo(() => {
    const all: {
      route: AppRoute;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      roles: UserRole[];
    }[] = [
      { route: 'home', label: t(lang, 'navHome'), icon: Home, roles: ['customer', 'business', 'agent', 'admin'] },
      { route: 'fuel', label: t(lang, 'navFuel'), icon: Fuel, roles: ['customer', 'business', 'agent', 'admin'] },
      { route: 'gas', label: t(lang, 'navGas'), icon: Flame, roles: ['customer', 'business', 'agent', 'admin'] },
      { route: 'rewards', label: t(lang, 'navRewards'), icon: Gift, roles: ['customer', 'business', 'agent', 'admin'] },
      { route: 'business', label: t(lang, 'navBusiness'), icon: Briefcase, roles: ['customer', 'business', 'admin'] },
      { route: 'orders', label: t(lang, 'navOrders'), icon: Truck, roles: ['customer', 'business', 'agent', 'admin'] },
      { route: 'stations', label: t(lang, 'navStations'), icon: MapPin, roles: ['customer', 'business', 'agent', 'admin'] },
      { route: 'agent', label: t(lang, 'navAgent'), icon: Store, roles: ['customer', 'agent', 'admin'] },
      { route: 'admin', label: t(lang, 'navAdmin'), icon: ShieldCheck, roles: ['admin'] },
      { route: 'profile', label: t(lang, 'navProfile'), icon: UserIcon, roles: ['customer', 'business', 'agent', 'admin'] },
    ];
    return all.filter((item) => item.roles.includes(effectiveRole));
  }, [lang, effectiveRole]);

  const searchResults = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return { products: [], stations: [], routes: [] };
    return {
      products: products
        .filter(
          (p) =>
            p.nameSw.toLowerCase().includes(q) ||
            p.nameEn.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q)
        )
        .slice(0, 4),
      stations: stations
        .filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.city.toLowerCase().includes(q) ||
            s.address.toLowerCase().includes(q)
        )
        .slice(0, 4),
      routes: navItems.filter((n) => n.label.toLowerCase().includes(q)),
    };
  }, [searchText, products, stations, navItems]);

  const quotaBanner = mapsQuotaExceeded && (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
      <span>
        Google Maps Platform quota reached. If you are the app owner, visit{' '}
        <a
          href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold text-amber-950 hover:text-amber-800"
        >
          maps developer site
        </a>{' '}
        for instructions to update your account.
      </span>
    </div>
  );

  if (!authReady) {
    return (
      <>
        {quotaBanner}
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#08291A] text-white gap-4">
          <OilcomCamelMark className="w-16 h-14 animate-pulse" />
          <p className="font-display font-bold text-lg tracking-wide">
            OILCOM <span className="text-[#F5B800]">SUPER APP</span>
          </p>
          <p className="text-xs text-emerald-200/75">{t(lang, 'loading')}</p>
        </div>
      </>
    );
  }

  if (!fbUser || !effectiveUser) {
    return (
      <>
        {quotaBanner}
        <AuthScreen lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} />
      </>
    );
  }

  if (effectiveUser.status === 'suspended') {
    return (
      <>
        {quotaBanner}
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#f6f7f6] dark:bg-[#090e0b]">
          <div className="max-w-md rounded-2xl bg-white dark:bg-[#121b16] border border-red-200 dark:border-red-900 p-8 text-center space-y-4">
            <h2 className="font-display text-xl font-bold text-red-600">
              {lang === 'sw' ? 'Akaunti Imesitishwa' : 'Account Suspended'}
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {lang === 'sw'
                ? 'Tafadhali wasiliana na huduma kwa wateja wa OILCOM (+255 800 110 000).'
                : 'Please contact OILCOM customer support (+255 800 110 000).'}
            </p>
            <button
              type="button"
              onClick={() => auth.signOut()}
              className="px-5 py-2.5 rounded-xl bg-[#08291A] text-white text-xs font-semibold cursor-pointer"
            >
              {t(lang, 'signOut')}
            </button>
          </div>
        </div>
      </>
    );
  }

  const navigate = (next: AppRoute) => {
    setRoute(next);
    setMobileDrawerOpen(false);
    setSearchOpen(false);
    setNotifOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMarkNotificationRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), { read: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${notifId}`);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    try {
      await Promise.all(
        unread.map((n) => updateDoc(doc(db, 'notifications', n.id), { read: true }))
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'notifications/batch');
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f6f7f6] dark:bg-[#090e0b] text-neutral-900 dark:text-neutral-100 flex flex-col">
      {quotaBanner}

      <div className="flex flex-1 min-h-0">
        {/* Desktop Persistent Sidebar (260px) */}
        <aside className="hidden lg:flex lg:w-[260px] lg:flex-col lg:fixed lg:inset-y-0 bg-[#08291A] text-white z-30">
          <div className="h-16 px-5 flex items-center gap-3 border-b border-white/10 shrink-0">
            <OilcomCamelMark className="w-9 h-8 shrink-0" />
            <div className="leading-tight">
              <p className="font-display text-sm font-extrabold tracking-tight text-white whitespace-nowrap">
                OILCOM
              </p>
              <p className="font-display text-[11px] font-bold tracking-wider text-[#F5B800] whitespace-nowrap">
                SUPER APP
              </p>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = route === item.route;
              return (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => navigate(item.route)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#F5B800] text-[#08291A] font-bold'
                      : 'text-emerald-100/85 hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-white/10 text-xs text-emerald-100/75 space-y-2">
            <div className="flex items-center justify-between">
              <span className="truncate font-semibold text-white">
                {effectiveUser.fullName}
              </span>
              <span className="font-mono-num uppercase text-[#F5B800] text-[11px]">
                {effectiveRole}
              </span>
            </div>
            <p className="text-[11px] opacity-70 truncate">{effectiveUser.email}</p>
          </div>
        </aside>

        {/* Mobile Drawer */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <aside className="relative w-72 max-w-[82vw] bg-[#08291A] text-white h-full flex flex-col z-10">
              <div className="h-14 px-4 flex items-center justify-between border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <OilcomCamelMark className="w-8 h-7" />
                  <span className="font-display font-bold text-sm">
                    OILCOM <span className="text-[#F5B800]">SUPER APP</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-1.5 rounded-lg bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = route === item.route;
                  return (
                    <button
                      key={item.route}
                      type="button"
                      onClick={() => navigate(item.route)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium cursor-pointer ${
                        active
                          ? 'bg-[#F5B800] text-[#08291A] font-bold'
                          : 'text-emerald-100/90 hover:bg-white/10'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}

        {/* Main Viewport Column */}
        <div className="flex-1 lg:pl-[260px] flex flex-col min-w-0">
          {/* 3-Zone Top Header Bar */}
          <header className="h-14 lg:h-16 sticky top-0 z-30 bg-[#08291A] lg:bg-white/95 lg:dark:bg-[#0e1712]/95 lg:backdrop-blur-md border-b border-white/10 lg:border-neutral-200 lg:dark:border-emerald-950 px-3 sm:px-6 flex items-center justify-between gap-2">
            {/* Zone 1: Brand / Drawer Trigger */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 lg:flex-initial overflow-hidden">
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(true)}
                aria-label="Open menu"
                className="lg:hidden p-1.5 rounded-lg text-white hover:bg-white/10 cursor-pointer shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => navigate('home')}
                className="lg:hidden flex items-center gap-2 cursor-pointer min-w-0 text-left"
              >
                <OilcomCamelMark className="w-7 h-6 shrink-0" />
                <div className="leading-none min-w-0">
                  <p className="font-display font-extrabold text-sm tracking-tight text-white truncate">
                    OILCOM
                  </p>
                  <p className="font-display font-bold text-[10px] tracking-wider text-[#F5B800] truncate mt-0.5">
                    SUPER APP
                  </p>
                </div>
              </button>
              <span className="hidden lg:inline font-display font-bold text-sm text-neutral-900 dark:text-white truncate">
                {navItems.find((n) => n.route === route)?.label || 'OILCOM'}
              </span>
            </div>

            {/* Zone 2: Concise Quick Search Trigger */}
            <button
              type="button"
              onClick={() => {
                setNotifOpen(false);
                setSearchOpen(true);
              }}
              className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/10 lg:bg-neutral-100 lg:dark:bg-[#121b16] border border-transparent lg:border-neutral-200 lg:dark:border-emerald-950 text-xs text-emerald-100/80 lg:text-neutral-500 lg:dark:text-neutral-400 w-56 lg:w-64 cursor-pointer shrink-0"
            >
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t(lang, 'searchPlaceholder')}</span>
            </button>

            {/* Zone 3: PWA Install, Search (mobile), Language, Theme & Notifications */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <PWAInstallButton lang={lang} variant="compact" />
              <button
                type="button"
                onClick={() => {
                  setNotifOpen(false);
                  setSearchOpen(true);
                }}
                aria-label="Search"
                className="sm:hidden p-2 rounded-lg bg-white/10 text-white hover:bg-white/15 cursor-pointer shrink-0"
              >
                <Search className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setLang(lang === 'sw' ? 'en' : 'sw')}
                className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-white/10 lg:bg-neutral-100 lg:dark:bg-[#121b16] text-white lg:text-neutral-800 lg:dark:text-neutral-200 text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Globe className="w-3.5 h-3.5 text-[#F5B800]" />
                {lang.toUpperCase()}
              </button>
              <button
                type="button"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                aria-label="Toggle theme"
                className="p-2 rounded-lg bg-white/10 lg:bg-neutral-100 lg:dark:bg-[#121b16] text-white lg:text-neutral-800 lg:dark:text-neutral-200 cursor-pointer shrink-0"
              >
                {theme === 'light' ? (
                  <Moon className="w-4 h-4 text-[#F5B800]" />
                ) : (
                  <Sun className="w-4 h-4 text-[#F5B800]" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setNotifOpen((prev) => !prev);
                }}
                aria-label="Notifications"
                className="relative p-2 rounded-lg bg-white/10 lg:bg-neutral-100 lg:dark:bg-[#121b16] text-white lg:text-neutral-800 lg:dark:text-neutral-200 cursor-pointer shrink-0"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#F5B800] text-[#08291A] text-[10px] font-bold flex items-center justify-center font-mono-num">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </header>

          {/* Search Command Modal */}
          {searchOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/55 flex items-start justify-center p-2.5 pt-16 sm:p-4 sm:pt-20"
              onClick={() => setSearchOpen(false)}
            >
              <div
                className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-3.5 sm:p-4 shadow-xl space-y-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 border-b border-neutral-100 dark:border-emerald-950 pb-2.5">
                  <Search className="w-4 h-4 text-[#F5B800] shrink-0" />
                  <input
                    type="text"
                    autoFocus
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setSearchOpen(false);
                      if (e.key === 'Enter' && searchResults.routes[0]) {
                        navigate(searchResults.routes[0].route);
                      }
                    }}
                    placeholder={t(lang, 'searchPlaceholder')}
                    className="flex-1 bg-transparent text-sm text-neutral-900 dark:text-white focus:outline-none"
                  />
                  {searchText && (
                    <button
                      type="button"
                      onClick={() => setSearchText('')}
                      className="text-xs text-neutral-400 hover:text-neutral-600 px-1.5 cursor-pointer"
                    >
                      {lang === 'sw' ? 'Futa' : 'Clear'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSearchOpen(false)}
                    aria-label="Close search"
                    className="p-1 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {searchText.trim() ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto text-xs">
                    {searchResults.routes.map((r) => (
                      <button
                        key={r.route}
                        type="button"
                        onClick={() => navigate(r.route)}
                        className="w-full text-left p-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-emerald-950/40 font-semibold text-neutral-900 dark:text-white cursor-pointer"
                      >
                        {r.label}
                      </button>
                    ))}
                    {searchResults.products.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          navigate(
                            p.roleScope === 'fuel'
                              ? 'fuel'
                              : p.roleScope === 'business'
                                ? 'business'
                                : 'gas'
                          )
                        }
                        className="w-full text-left p-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-emerald-950/40 flex justify-between gap-2 text-neutral-900 dark:text-white cursor-pointer"
                      >
                        <span className="truncate">{lang === 'sw' ? p.nameSw : p.nameEn}</span>
                        <span className="font-mono-num font-bold text-[#08291A] dark:text-[#F5B800] shrink-0">
                          TZS {p.priceTzs.toLocaleString()}
                        </span>
                      </button>
                    ))}
                    {searchResults.stations.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => navigate('stations')}
                        className="w-full text-left p-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-emerald-950/40 cursor-pointer"
                      >
                        <p className="font-semibold text-neutral-900 dark:text-white">{s.name}</p>
                        <p className="text-neutral-500">{s.address}</p>
                      </button>
                    ))}
                    {searchResults.routes.length === 0 &&
                      searchResults.products.length === 0 &&
                      searchResults.stations.length === 0 && (
                        <p className="text-center text-neutral-500 py-4">
                          {t(lang, 'noResults')}
                        </p>
                      )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                      {lang === 'sw' ? 'Njia za Haraka' : 'Quick Links'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {navItems.slice(0, 7).map((n) => (
                        <button
                          key={n.route}
                          type="button"
                          onClick={() => navigate(n.route)}
                          className="px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-emerald-950/60 text-neutral-800 dark:text-neutral-200 text-xs font-medium hover:bg-[#F5B800] hover:text-[#08291A] transition-colors cursor-pointer"
                        >
                          {n.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notifications Drawer / Modal */}
          {notifOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/55 flex items-start justify-center sm:justify-end p-2.5 pt-16 sm:p-4 sm:pt-18"
              onClick={() => setNotifOpen(false)}
            >
              <div
                className="w-full max-w-md rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-5 shadow-xl space-y-4 max-h-[78vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2 border-b border-neutral-100 dark:border-emerald-950 pb-3">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#F5B800]" />
                    <h2 className="font-display font-bold text-base text-neutral-900 dark:text-white">
                      {t(lang, 'notifications')} ({unreadCount})
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllNotificationsRead}
                        className="text-xs font-semibold text-[#08291A] dark:text-[#F5B800] hover:underline cursor-pointer"
                      >
                        {lang === 'sw' ? 'Soma zote' : 'Mark all read'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      aria-label="Close notifications"
                      className="p-1 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-emerald-950">
                  {notifications.length === 0 ? (
                    <div className="py-10 text-center text-xs text-neutral-500">
                      {lang === 'sw'
                        ? 'Huna arifu mpya kwa sasa.'
                        : 'You have no notifications yet.'}
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`py-3 flex items-start justify-between gap-3 ${
                          n.read ? 'opacity-70' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {!n.read && (
                              <span className="w-2 h-2 rounded-full bg-[#F5B800] shrink-0" />
                            )}
                            <p className="font-semibold text-xs text-neutral-900 dark:text-white">
                              {lang === 'sw' ? n.titleSw : n.titleEn}
                            </p>
                          </div>
                          <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1">
                            {lang === 'sw' ? n.bodySw : n.bodyEn}
                          </p>
                        </div>
                        {!n.read && (
                          <button
                            type="button"
                            onClick={() => handleMarkNotificationRead(n.id)}
                            className="px-2.5 py-1 rounded-lg bg-[#F5B800] text-[#08291A] text-[11px] font-bold shrink-0 cursor-pointer"
                          >
                            {lang === 'sw' ? 'Soma' : 'Read'}
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(false);
                    navigate('profile');
                  }}
                  className="w-full py-2 rounded-xl bg-neutral-100 dark:bg-emerald-950/60 text-xs font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer"
                >
                  {lang === 'sw' ? 'Fungua Wasifu & Msaada' : 'Open Profile & Settings'}
                </button>
              </div>
            </div>
          )}

          {/* Main Content Container */}
          <main
            className={`flex-1 w-full mx-auto min-w-0 ${
              route === 'stations'
                ? 'p-0 pb-14 lg:p-4 lg:pb-6 max-w-none'
                : 'max-w-7xl p-2.5 sm:p-5 lg:p-7 pb-[72px] lg:pb-8'
            }`}
          >
            {route === 'home' && (
              <HomeDashboard
                lang={lang}
                user={effectiveUser}
                effectiveRole={effectiveRole}
                rewards={rewardsAccount}
                orders={mergedOrders}
                promotions={promotions}
                onNavigate={navigate}
              />
            )}

            {(route === 'fuel' || route === 'gas') && (
              <FuelAndGasModule
                mode={route}
                lang={lang}
                user={effectiveUser}
                products={products}
                stations={stations}
                dealers={approvedDealers}
                addresses={addresses}
                googleMapsApiKey={googleMapsApiKey}
                onOrderSuccess={() => {
                  // Keep user on confirmation banner; Orders tab updates in real time
                }}
              />
            )}

            {route === 'rewards' && (
              <RewardsModule
                lang={lang}
                user={effectiveUser}
                effectiveRole={effectiveRole}
                profile={customerProfile}
                rewards={rewardsAccount}
                transactions={rewardsTx}
                vouchers={vouchers}
                promotions={promotions}
                settings={settings}
              />
            )}

            {route === 'orders' && (
              <OrdersAndPaymentsModule
                lang={lang}
                effectiveRole={effectiveRole}
                orders={mergedOrders}
                payments={payments}
                deliveries={mergedDeliveries}
                stations={stations}
                googleMapsApiKey={googleMapsApiKey}
              />
            )}

            {route === 'stations' && (
              <StationsMapModule
                lang={lang}
                stations={stations}
                googleMapsApiKey={googleMapsApiKey}
                onOrderAtStation={() => navigate('gas')}
              />
            )}

            {route === 'business' && (
              <BusinessPortalModule
                lang={lang}
                user={effectiveUser}
                business={businesses[0] || null}
                members={businessMembers}
                businessOrders={businessOrders}
                invoices={invoices}
                products={products}
              />
            )}

            {route === 'agent' && (
              <AgentPortalModule
                lang={lang}
                user={effectiveUser}
                effectiveRole={effectiveRole}
                agentProfile={myAgents[0] || null}
                orders={mergedOrders}
                inventory={inventory}
                movements={movements}
                stations={stations}
                products={products}
                settings={settings}
              />
            )}

            {route === 'admin' && effectiveRole === 'admin' && (
              <AdminConsoleModule
                lang={lang}
                users={allUsersAdmin}
                businesses={businesses}
                agents={allAgentsAdmin.length > 0 ? allAgentsAdmin : approvedDealers}
                orders={mergedOrders}
                products={products}
                stations={stations}
                rewardsTx={rewardsTx}
                inventory={inventory}
                auditLogs={auditLogs}
                settings={settings}
              />
            )}

            {route === 'profile' && (
              <ProfileAndSupportModule
                lang={lang}
                setLang={setLang}
                theme={theme}
                setTheme={setTheme}
                user={effectiveUser}
                effectiveRole={effectiveRole}
                setPreviewRole={setPreviewRole}
                profile={customerProfile}
                addresses={addresses}
                notifications={notifications}
                googleMapsApiKey={googleMapsApiKey}
              />
            )}
          </main>

          {/* Mobile Bottom Navigation Bar (5 primary tabs including Maps) */}
          <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-[#08291A] border-t border-white/10 grid grid-cols-5">
            {(
              [
                ['home', t(lang, 'navHome'), Home],
                ['orders', 'Oda', Truck],
                ['stations', 'Maps', MapPin],
                ['rewards', 'Rewards', Gift],
                ['profile', 'Profile', UserIcon],
              ] as const
            ).map(([r, label, Icon]) => {
              const active = route === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => navigate(r)}
                  className={`flex flex-col items-center justify-center gap-0.5 text-[10px] sm:text-[11px] font-medium cursor-pointer ${
                    active ? 'text-[#F5B800]' : 'text-emerald-100/80'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="truncate max-w-full px-0.5">{label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <OfflineIndicator lang={lang} />
    </div>
  );
}
