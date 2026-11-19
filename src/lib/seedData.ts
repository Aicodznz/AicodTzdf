import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { sha256Hex } from './firestoreActions';
import type {
  Product,
  Promotion,
  RoleProvision,
  Station,
  SystemSettings,
} from '../types/oilcom';

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  pointsPer1000Tzs: 10,
  pointRedemptionValueTzs: 10,
  gasCancelWindowMinutes: 30,
  sandboxModeEnabled: true,
  supportPhone: '+255 800 110 000',
  supportEmail: 'support@oilcom-demo.tz',
};

export const DEMO_STATIONS: Omit<Station, 'id'>[] = [
  {
    name: 'OILCOM Station — Mkubashini (Demo)',
    code: 'OIL-DSM-01',
    stationKind: 'both',
    city: 'Dar es Salaam',
    region: 'Dar es Salaam',
    address: 'Ali Hassan Mwinyi Rd, Kinondoni',
    lat: -6.7749,
    lng: 39.2612,
    open24Hours: true,
    hasGas: true,
    hasFuel: true,
    hasLubricants: true,
    petrolPriceTzs: 3150,
    dieselPriceTzs: 3040,
    pumpsCount: 8,
    lpg6kgStock: 42,
    lpg15kgStock: 35,
    lpg38kgStock: 12,
    managerUid: '',
    managerName: '',
    managerEmail: '',
    isDemoData: true,
    status: 'active',
  },
  {
    name: 'OILCOM Station — Kariakoo Hub (Demo)',
    code: 'OIL-DSM-02',
    stationKind: 'gas',
    city: 'Dar es Salaam',
    region: 'Dar es Salaam',
    address: 'Uhuru Street, Ilala',
    lat: -6.8205,
    lng: 39.2766,
    open24Hours: true,
    hasGas: true,
    hasFuel: false,
    hasLubricants: true,
    petrolPriceTzs: 0,
    dieselPriceTzs: 0,
    pumpsCount: 0,
    lpg6kgStock: 85,
    lpg15kgStock: 60,
    lpg38kgStock: 24,
    managerUid: '',
    managerName: '',
    managerEmail: '',
    isDemoData: true,
    status: 'active',
  },
  {
    name: 'OILCOM Station — Mbezi Beach (Demo)',
    code: 'OIL-DSM-03',
    stationKind: 'fuel',
    city: 'Dar es Salaam',
    region: 'Dar es Salaam',
    address: 'Bagamoyo Road, Mbezi',
    lat: -6.7124,
    lng: 39.2228,
    open24Hours: false,
    hasGas: false,
    hasFuel: true,
    hasLubricants: true,
    petrolPriceTzs: 3150,
    dieselPriceTzs: 3040,
    pumpsCount: 6,
    lpg6kgStock: 0,
    lpg15kgStock: 0,
    lpg38kgStock: 0,
    managerUid: '',
    managerName: '',
    managerEmail: '',
    isDemoData: true,
    status: 'active',
  },
  {
    name: 'OILCOM Station — Arusha Clock Tower (Demo)',
    code: 'OIL-ARU-01',
    stationKind: 'both',
    city: 'Arusha',
    region: 'Arusha',
    address: 'Sokoine Road, Arusha CBD',
    lat: -3.3702,
    lng: 36.6946,
    open24Hours: true,
    hasGas: true,
    hasFuel: true,
    hasLubricants: true,
    petrolPriceTzs: 3220,
    dieselPriceTzs: 3110,
    pumpsCount: 6,
    lpg6kgStock: 36,
    lpg15kgStock: 28,
    lpg38kgStock: 10,
    managerUid: '',
    managerName: '',
    managerEmail: '',
    isDemoData: true,
    status: 'active',
  },
  {
    name: 'OILCOM Station — Mwanza Nyamagana (Demo)',
    code: 'OIL-MWZ-01',
    stationKind: 'both',
    city: 'Mwanza',
    region: 'Mwanza',
    address: 'Kenyatta Road, Nyamagana',
    lat: -2.5164,
    lng: 32.9175,
    open24Hours: true,
    hasGas: true,
    hasFuel: true,
    hasLubricants: true,
    petrolPriceTzs: 3280,
    dieselPriceTzs: 3160,
    pumpsCount: 8,
    lpg6kgStock: 40,
    lpg15kgStock: 32,
    lpg38kgStock: 14,
    managerUid: '',
    managerName: '',
    managerEmail: '',
    isDemoData: true,
    status: 'active',
  },
];

export const DEMO_PRODUCTS: Omit<Product, 'id'>[] = [
  {
    categorySlug: 'lpg_refill',
    sku: 'LPG-6KG-REFILL',
    nameSw: 'OILCOM Gas 6kg — Kubadilisha (Refill)',
    nameEn: 'OILCOM Gas 6kg — Cylinder Refill',
    descriptionSw: 'Mtungi mdogo wa nyumbani (Bei ya Mfano inayoweza kurekebishwa)',
    descriptionEn: 'Compact home cylinder refill (Configurable placeholder price)',
    unit: 'cylinder',
    sizeKg: 6,
    priceTzs: 22500,
    isDemoPlaceholderPrice: true,
    roleScope: 'gas',
    active: true,
  },
  {
    categorySlug: 'lpg_refill',
    sku: 'LPG-15KG-REFILL',
    nameSw: 'OILCOM Gas 15kg — Kubadilisha (Refill)',
    nameEn: 'OILCOM Gas 15kg — Cylinder Refill',
    descriptionSw: 'Mtungi wa familia (Bei ya Mfano inayoweza kurekebishwa)',
    descriptionEn: 'Family standard LPG refill (Configurable placeholder price)',
    unit: 'cylinder',
    sizeKg: 15,
    priceTzs: 54000,
    isDemoPlaceholderPrice: true,
    roleScope: 'gas',
    active: true,
  },
  {
    categorySlug: 'lpg_refill',
    sku: 'LPG-38KG-REFILL',
    nameSw: 'OILCOM Gas 38kg — Biashara (Refill)',
    nameEn: 'OILCOM Gas 38kg — Commercial Refill',
    descriptionSw: 'Mtungi mkubwa kwa hoteli na migahawa (Bei ya Mfano)',
    descriptionEn: 'Commercial LPG refill for hospitality (Configurable placeholder)',
    unit: 'cylinder',
    sizeKg: 38,
    priceTzs: 132000,
    isDemoPlaceholderPrice: true,
    roleScope: 'gas',
    active: true,
  },
  {
    categorySlug: 'lpg_complete',
    sku: 'LPG-15KG-NEW',
    nameSw: 'OILCOM Gas 15kg — Mtungi Mpya + Gesi',
    nameEn: 'OILCOM Gas 15kg — Complete New Cylinder',
    descriptionSw: 'Mtungi mpya ukiwa na gesi kamili na valvu salama',
    descriptionEn: 'Brand new sealed cylinder filled with LPG',
    unit: 'set',
    sizeKg: 15,
    priceTzs: 115000,
    isDemoPlaceholderPrice: true,
    roleScope: 'gas',
    active: true,
  },
  {
    categorySlug: 'fuel_retail',
    sku: 'FUEL-PETROL-PMS',
    nameSw: 'Mafuta ya Petroli (Super Unleaded)',
    nameEn: 'Super Unleaded Petrol (PMS)',
    descriptionSw: 'Vocha ya mafuta kituoni (Bei ya Mfano kwa Lita)',
    descriptionEn: 'Prepaid station fuel voucher (Configurable price per liter)',
    unit: 'liter',
    priceTzs: 3150,
    isDemoPlaceholderPrice: true,
    roleScope: 'fuel',
    active: true,
  },
  {
    categorySlug: 'fuel_retail',
    sku: 'FUEL-DIESEL-AGO',
    nameSw: 'Mafuta ya Dizeli (Ultra Low Sulfur)',
    nameEn: 'Automotive Gas Oil Diesel (AGO)',
    descriptionSw: 'Vocha ya dizeli safi kwa magari na mitambo',
    descriptionEn: 'High-efficiency diesel voucher for vehicles & generators',
    unit: 'liter',
    priceTzs: 3040,
    isDemoPlaceholderPrice: true,
    roleScope: 'fuel',
    active: true,
  },
  {
    categorySlug: 'bulk_b2b',
    sku: 'B2B-DIESEL-1000L',
    nameSw: 'Dizeli ya Jumla (Bulk AGO — Lita 1,000)',
    nameEn: 'Bulk Industrial Diesel (1,000L Tanker Unit)',
    descriptionSw: 'Ugavi wa mafuta kwa kampuni, migodi na usafirishaji',
    descriptionEn: 'Bulk fuel supply for fleets, mining & commercial sites',
    unit: '1000L',
    priceTzs: 2920000,
    isDemoPlaceholderPrice: true,
    roleScope: 'business',
    active: true,
  },
  {
    categorySlug: 'bulk_b2b',
    sku: 'B2B-LUBE-208L',
    nameSw: 'Oilcom Heavy-Duty Engine Oil (Drum 208L)',
    nameEn: 'Oilcom Heavy-Duty Synthetic Lubricant (208L Drum)',
    descriptionSw: 'Kilainishi cha injini za magari makubwa na mitambo',
    descriptionEn: 'Commercial fleet and machinery lubricant drum',
    unit: 'drum',
    priceTzs: 1480000,
    isDemoPlaceholderPrice: true,
    roleScope: 'business',
    active: true,
  },
];

export const DEMO_PROMOTIONS: Omit<Promotion, 'id'>[] = [
  {
    titleSw: 'Pointi Mara 2 Kila Wikendi (Demo)',
    titleEn: '2x Loyalty Points Every Weekend (Demo)',
    descriptionSw: 'Jaza mafuta au agiza gesi Jumamosi na Jumapili upate pointi maradufu.',
    descriptionEn: 'Refuel or order LPG cylinders on Sat–Sun to earn double points.',
    pointsMultiplier: 2,
    minSpendTzs: 20000,
    active: true,
  },
  {
    titleSw: 'Punguzo la Gesi 15kg Kwa Wanachama (Demo)',
    titleEn: '15kg LPG Member Voucher Offer (Demo)',
    descriptionSw: 'Komboa pointi 500 upate vocha ya TZS 5,000 kwenye mtungi wa 15kg.',
    descriptionEn: 'Redeem 500 points for a TZS 5,000 voucher on 15kg LPG.',
    pointsMultiplier: 1.5,
    minSpendTzs: 50000,
    active: true,
  },
];

export async function ensureUserDocuments(
  fbUser: FirebaseUser,
  preferredLang: 'sw' | 'en' = 'sw'
): Promise<{ isBootstrappedAdmin: boolean }> {
  const uid = fbUser.uid;
  const email = (fbUser.email || '').trim().toLowerCase();
  const isBootstrappedAdmin = email === 'amytzee@gmail.com' && fbUser.emailVerified;

  let resolvedRole:
    | 'customer'
    | 'business'
    | 'agent'
    | 'station_manager'
    | 'gas_manager'
    | 'admin' = isBootstrappedAdmin ? 'admin' : 'customer';

  const userRef = doc(db, 'users', uid);
  let snapExists = false;
  try {
    const snap = await getDoc(userRef);
    snapExists = snap.exists();
    if (snapExists) {
      resolvedRole = (snap.data() as { role: typeof resolvedRole }).role;
    } else {
      let provision: (RoleProvision & { id: string }) | null = null;
      if (!isBootstrappedAdmin && email && fbUser.emailVerified) {
        try {
          const provisionId = await sha256Hex(email);
          const pSnap = await getDoc(doc(db, 'role_provisions', provisionId));
          if (pSnap.exists()) {
            const pData = pSnap.data() as Omit<RoleProvision, 'id'>;
            if (pData.status === 'pending' && pData.email === email) {
              provision = { id: provisionId, ...pData };
            }
          }
        } catch {
          provision = null;
        }
      }

      if (provision) {
        resolvedRole = provision.role;
        await setDoc(userRef, {
          uid,
          fullName: fbUser.displayName || provision.fullName || email.split('@')[0],
          phone: fbUser.phoneNumber || provision.phone || '',
          email,
          role: provision.role,
          assignedStationId: provision.assignedStationId || '',
          provisionedBy: provision.createdBy,
          provisionId: provision.id,
          language: preferredLang,
          status: 'active',
          photoUrl: fbUser.photoURL || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Claim role provision & bind any assigned agent/station/admin record
        try {
          await updateDoc(doc(db, 'role_provisions', provision.id), {
            status: 'claimed',
            claimedUid: uid,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.error('Claim provision status error:', err);
        }

        if (provision.role === 'agent') {
          try {
            await setDoc(doc(db, 'agents', uid), {
              userId: uid,
              businessName: provision.businessName || provision.fullName,
              licenseNumber:
                provision.licenseNumber || `OIL-LIC-${uid.slice(0, 6).toUpperCase()}`,
              stationId: provision.assignedStationId || '',
              provisionId: provision.id,
              region: provision.region || 'Dar es Salaam',
              phone: fbUser.phoneNumber || provision.phone || '+255700000000',
              approvalStatus: 'approved',
              commissionRatePct: 5,
              totalSalesTzs: 0,
              totalCommissionTzs: 0,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            console.error('Auto-create provisioned agent error:', err);
          }
        }

        if (
          (provision.role === 'station_manager' || provision.role === 'gas_manager') &&
          provision.assignedStationId
        ) {
          try {
            await updateDoc(doc(db, 'stations', provision.assignedStationId), {
              managerUid: uid,
              managerName: fbUser.displayName || provision.fullName,
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            console.error('Auto-claim station manager error:', err);
          }
        }

        if (provision.role === 'admin') {
          try {
            await setDoc(doc(db, 'admins', uid), {
              uid,
              email,
              provisionId: provision.id,
              createdAt: serverTimestamp(),
            });
          } catch (err) {
            console.error('Auto-create provisioned admin error:', err);
          }
        }
      } else {
        await setDoc(userRef, {
          uid,
          fullName: fbUser.displayName || email.split('@')[0] || 'Mteja wa OILCOM',
          phone: fbUser.phoneNumber || '',
          email: fbUser.email || 'unknown@oilcom.tz',
          role: isBootstrappedAdmin ? 'admin' : 'customer',
          language: preferredLang,
          status: 'active',
          photoUrl: fbUser.photoURL || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }

  if (resolvedRole === 'customer' || resolvedRole === 'admin') {
    const custCode = `OIL-${uid.slice(0, 6).toUpperCase()}`;
    const refCode = `CAMEL-${uid.slice(0, 5).toUpperCase()}`;

    const profileRef = doc(db, 'customer_profiles', uid);
    try {
      const pSnap = await getDoc(profileRef);
      if (!pSnap.exists()) {
        await setDoc(profileRef, {
          userId: uid,
          customerCode: custCode,
          referralCode: refCode,
          referredBy: '',
          vehiclePlate: '',
          preferredFuel: 'Petrol',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `customer_profiles/${uid}`);
    }

    const rewardsRef = doc(db, 'rewards_accounts', uid);
    try {
      const rSnap = await getDoc(rewardsRef);
      if (!rSnap.exists()) {
        await setDoc(rewardsRef, {
          userId: uid,
          customerCode: custCode,
          pointsBalance: 0,
          lifetimePoints: 0,
          tier: 'Bronze',
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `rewards_accounts/${uid}`);
    }
  }

  if (isBootstrappedAdmin) {
    const adminRef = doc(db, 'admins', uid);
    try {
      const aSnap = await getDoc(adminRef);
      if (!aSnap.exists()) {
        await setDoc(adminRef, {
          uid,
          email: fbUser.email || 'amytzee@gmail.com',
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `admins/${uid}`);
    }
  }

  return { isBootstrappedAdmin };
}

export async function seedCatalogIfAdmin(): Promise<void> {
  try {
    const existingStations = await getDocs(query(collection(db, 'stations'), limit(1)));
    if (!existingStations.empty) return;

    const batch = writeBatch(db);

    DEMO_STATIONS.forEach((st, idx) => {
      const ref = doc(db, 'stations', `station_demo_${idx + 1}`);
      batch.set(ref, {
        ...st,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    const categories = [
      { slug: 'lpg_refill', nameSw: 'Kubadilisha Mitungi ya Gesi', nameEn: 'LPG Cylinder Refills', sortOrder: 1 },
      { slug: 'lpg_complete', nameSw: 'Mitungi Mipya ya Gesi', nameEn: 'Complete New Cylinders', sortOrder: 2 },
      { slug: 'fuel_retail', nameSw: 'Mafuta ya Magari (Vocha)', nameEn: 'Retail Fuel Vouchers', sortOrder: 3 },
      { slug: 'bulk_b2b', nameSw: 'Mafuta ya Jumla (B2B)', nameEn: 'Bulk B2B Supply', sortOrder: 4 },
    ];
    categories.forEach((cat) => {
      batch.set(doc(db, 'product_categories', cat.slug), cat);
    });

    DEMO_PRODUCTS.forEach((prod, idx) => {
      const ref = doc(db, 'products', `prod_demo_${idx + 1}`);
      batch.set(ref, {
        ...prod,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    DEMO_PROMOTIONS.forEach((promo, idx) => {
      const ref = doc(db, 'promotions', `promo_demo_${idx + 1}`);
      batch.set(ref, {
        ...promo,
        createdAt: serverTimestamp(),
      });
    });

    batch.set(doc(db, 'system_settings', 'global'), {
      ...DEFAULT_SYSTEM_SETTINGS,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'seedCatalogIfAdmin');
  }
}
