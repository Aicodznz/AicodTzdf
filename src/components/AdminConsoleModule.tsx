import React, { useMemo, useRef, useState } from 'react';
import {
  Compass,
  Download,
  FileSpreadsheet,
  Globe,
  Hexagon,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  analyzeGeospatialNetwork,
  buildDemandHotspotsGeoJson,
  buildOilcomGeoJsonExport,
  buildStationBuffersGeoJson,
  buildStationVoronoiGeoJson,
  downloadGeoJsonFile,
  downloadTextFile,
  parseAnySpatialFileToGeoJson,
  SAMPLE_OILCOM_SITES_CSV,
  type ExpansionSiteCandidate,
  type GeoJsonFeatureCollection,
  type TimeSliceKey,
} from '../data/oilcomGeoJson';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { t } from '../i18n/translations';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  addStationStaffMember,
  deleteStationStaffMember,
  makeId,
  provisionRoleAccount,
  updateStationStaffMember,
  writeAuditLog,
} from '../lib/firestoreActions';
import type {
  AgentInventoryItem,
  AgentProfile,
  AuditLogEntry,
  BusinessAccount,
  GasOrder,
  HomepageSlide,
  Language,
  OilcomUser,
  Product,
  ProvisionedRole,
  RewardsTransaction,
  RoleProvision,
  Station,
  StationStaffMember,
  StationStaffRole,
  SystemSettings,
  UserRole,
} from '../types/oilcom';
import { HomepageSlidesManager } from './HomepageSlidesManager';
import { MapLocationPickerModal } from './MapLocationPickerModal';
import { formatTimestamp, formatTzs } from './OilcomBrand';

interface AdminConsoleModuleProps {
  lang: Language;
  users: OilcomUser[];
  businesses: BusinessAccount[];
  agents: AgentProfile[];
  orders: GasOrder[];
  products: Product[];
  stations: Station[];
  stationStaff: StationStaffMember[];
  provisions: RoleProvision[];
  rewardsTx: RewardsTransaction[];
  inventory: AgentInventoryItem[];
  auditLogs: AuditLogEntry[];
  settings: SystemSettings;
  homepageSlides?: HomepageSlide[];
  googleMapsApiKey?: string;
}

export function AdminConsoleModule({
  lang,
  users,
  businesses,
  agents,
  orders,
  products,
  stations,
  stationStaff,
  provisions,
  rewardsTx,
  inventory,
  auditLogs,
  settings,
  homepageSlides = [],
  googleMapsApiKey = '',
}: AdminConsoleModuleProps) {
  const [tab, setTab] = useState<
    | 'overview'
    | 'gis'
    | 'users'
    | 'businesses'
    | 'agents'
    | 'catalog'
    | 'stations'
    | 'settings'
    | 'logs'
  >('overview');
  const [gisRadiusKm, setGisRadiusKm] = useState<3 | 5 | 10>(5);
  const [gisTimeSlice, setGisTimeSlice] = useState<TimeSliceKey>('all');
  const [convertedSpatial, setConvertedSpatial] = useState<{
    fileName: string;
    format: string;
    collection: GeoJsonFeatureCollection;
  } | null>(null);
  const gisConverterInputRef = useRef<HTMLInputElement | null>(null);
  const [dateFilter, setDateFilter] = useState<'all' | '7d' | '30d'>('all');
  const [settingsForm, setSettingsForm] = useState<SystemSettings>(settings);
  const [newProd, setNewProd] = useState({
    nameSw: '',
    nameEn: '',
    sku: '',
    unit: 'cylinder',
    priceTzs: 25000,
    roleScope: 'gas' as 'gas' | 'fuel' | 'business',
  });

  // Admin Account Provisioning state
  const [provBusy, setProvBusy] = useState(false);
  const [provForm, setProvForm] = useState({
    fullName: '',
    email: '',
    phone: '+255 ',
    role: 'agent' as ProvisionedRole,
    assignedStationId: stations[0]?.id || '',
    region: 'Dar es Salaam',
    businessName: '',
    licenseNumber: '',
    initialPassword: '',
  });

  // Station + Staff management state
  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [stationMapOpen, setStationMapOpen] = useState(false);
  const [staffModalStationId, setStaffModalStationId] = useState<string | null>(null);
  const [newStaffForm, setNewStaffForm] = useState<{
    fullName: string;
    phone: string;
    staffRole: StationStaffRole;
    shift: 'morning' | 'evening' | 'night';
  }>({
    fullName: '',
    phone: '+255 ',
    staffRole: 'attendant',
    shift: 'morning',
  });
  const [stationForm, setStationForm] = useState({
    name: '',
    code: '',
    stationKind: 'both' as 'fuel' | 'gas' | 'both',
    city: 'Dar es Salaam',
    region: 'Dar es Salaam',
    address: '',
    lat: -6.7924,
    lng: 39.2083,
    open24Hours: true,
    hasGas: true,
    hasFuel: true,
    hasLubricants: true,
    petrolPriceTzs: 3150,
    dieselPriceTzs: 3050,
    pumpsCount: 6,
    lpg6kgStock: 30,
    lpg15kgStock: 25,
    lpg38kgStock: 10,
    managerUid: '',
    status: 'active' as 'active' | 'maintenance' | 'inactive',
  });
  const [feedback, setFeedback] = useState('');

  const metrics = useMemo(() => {
    const totalSales = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((s, o) => s + o.totalTzs, 0);
    const pendingOrders = orders.filter((o) => o.status === 'pending').length;
    const completedOrders = orders.filter((o) => o.status === 'delivered').length;
    const rewardsIssued = rewardsTx
      .filter((r) => r.type === 'earn' || r.type === 'referral_bonus')
      .reduce((s, r) => s + r.points, 0);
    const rewardsRedeemed = rewardsTx
      .filter((r) => r.type === 'redeem_approved')
      .reduce((s, r) => s + r.points, 0);
    const gasStock = inventory.reduce((s, i) => s + i.quantityOnHand, 0);

    return {
      totalCustomers: users.filter((u) => u.role === 'customer').length,
      activeUsers: users.filter((u) => u.status === 'active').length,
      totalBusinesses: businesses.length,
      totalAgents: agents.length,
      totalOrders: orders.length,
      pendingOrders,
      completedOrders,
      totalSales,
      rewardsIssued,
      rewardsRedeemed,
      gasStock,
    };
  }, [users, businesses, agents, orders, rewardsTx, inventory]);

  const statusChart = useMemo(() => {
    const counts: Record<string, number> = {
      pending: 0,
      confirmed: 0,
      dispatched: 0,
      delivered: 0,
      cancelled: 0,
    };
    orders.forEach((o) => {
      counts[o.status] = (counts[o.status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [orders]);

  const PIE_COLORS = ['#0B2A6F', '#D92027', '#F5B800', '#2563EB', '#EF4444'];

  const gisAnalysis = useMemo(
    () => analyzeGeospatialNetwork(stations, orders, gisRadiusKm),
    [stations, orders, gisRadiusKm]
  );

  const handleSpatialConvertUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseAnySpatialFileToGeoJson(text, file.name);
      if (!parsed) {
        setFeedback(
          lang === 'sw'
            ? 'Faili halikubadilika. Tumia CSV (yenye safu ya lat/lng), KML (.kml), au GeoJSON.'
            : 'Could not parse file. Use CSV (with lat/lng columns), KML (.kml), or GeoJSON.'
        );
        return;
      }
      setConvertedSpatial({
        fileName: file.name,
        format: parsed.format.toUpperCase(),
        collection: parsed.data,
      });
      setFeedback(
        lang === 'sw'
          ? `Faili ${parsed.format.toUpperCase()} limebadilishwa kuwa GeoJSON (${parsed.data.features.length} vipengele).`
          : `Converted ${parsed.format.toUpperCase()} into GeoJSON (${parsed.data.features.length} features).`
      );
    } catch {
      setFeedback(
        lang === 'sw'
          ? 'Hitilafu wakati wa kusoma faili la GIS.'
          : 'Error reading uploaded spatial file.'
      );
    }
  };

  const handlePrefillStationFromCandidate = (candidate: ExpansionSiteCandidate) => {
    const cleanCityCode = candidate.city
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 3)
      .toUpperCase();
    const kind = candidate.recommendedKind;
    setEditingStationId(null);
    setStationForm({
      name: `OILCOM ${candidate.city} — ${
        lang === 'sw' ? candidate.nameSw.split('(')[0].trim() : candidate.nameEn.split('(')[0].trim()
      }`.slice(0, 90),
      code: `OIL-${cleanCityCode || 'TZ'}-${stations.length + 1}`,
      stationKind: kind,
      city: candidate.city,
      region: candidate.region,
      address: lang === 'sw' ? candidate.nameSw : candidate.nameEn,
      lat: Number(candidate.lat.toFixed(5)),
      lng: Number(candidate.lng.toFixed(5)),
      open24Hours: true,
      hasGas: kind === 'gas' || kind === 'both',
      hasFuel: kind === 'fuel' || kind === 'both',
      hasLubricants: true,
      petrolPriceTzs: 3150,
      dieselPriceTzs: 3050,
      pumpsCount: kind === 'gas' ? 0 : 6,
      lpg6kgStock: kind === 'fuel' ? 0 : 40,
      lpg15kgStock: kind === 'fuel' ? 0 : 30,
      lpg38kgStock: kind === 'fuel' ? 0 : 12,
      managerUid: '',
      status: 'active',
    });
    setTab('stations');
    setFeedback(
      lang === 'sw'
        ? `Viwianishi vya ${candidate.city} vimejazwa tayari kuunda kituo kipya.`
        : `Pre-filled expansion site coordinates for ${candidate.city}.`
    );
  };

  const exportCsvReport = () => {
    const rows = [
      ['OrderNumber', 'Customer', 'Kind', 'Status', 'PaymentStatus', 'TotalTZS'],
      ...orders.map((o) => [
        o.orderNumber,
        o.customerName,
        o.orderKind,
        o.status,
        o.paymentStatus,
        String(o.totalTzs),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oilcom-admin-orders-${dateFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUserUpdate = async (
    targetUser: OilcomUser,
    updates: {
      role?: UserRole;
      status?: 'active' | 'suspended';
      assignedStationId?: string;
    }
  ) => {
    try {
      await updateDoc(doc(db, 'users', targetUser.uid), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      const stationIdToBind =
        updates.assignedStationId !== undefined
          ? updates.assignedStationId
          : targetUser.assignedStationId || '';
      const targetRole = updates.role || targetUser.role;
      if (
        (targetRole === 'station_manager' || targetRole === 'gas_manager') &&
        stationIdToBind
      ) {
        await updateDoc(doc(db, 'stations', stationIdToBind), {
          managerUid: targetUser.uid,
          managerName: targetUser.fullName,
          managerEmail: targetUser.email.toLowerCase(),
          updatedAt: serverTimestamp(),
        });
      }
      await writeAuditLog({
        action: 'UPDATE_USER_RBAC',
        targetCollection: 'users',
        targetId: targetUser.uid,
        summary: `Updated ${targetUser.email}: ${JSON.stringify(updates)}`,
      });
      setFeedback(`Updated user ${targetUser.email}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUser.uid}`);
    }
  };

  const handleProvisionAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provForm.email.trim() || !provForm.fullName.trim()) return;
    setProvBusy(true);
    setFeedback('');
    try {
      const cleanEmail = provForm.email.trim().toLowerCase();
      const matchedUser = users.find((u) => u.email.toLowerCase() === cleanEmail);
      const chosenStation = stations.find((s) => s.id === provForm.assignedStationId);
      const res = await provisionRoleAccount({
        email: cleanEmail,
        fullName: provForm.fullName,
        phone: provForm.phone,
        role: provForm.role,
        assignedStationId:
          provForm.role === 'station_manager' ||
          provForm.role === 'gas_manager' ||
          provForm.role === 'agent'
            ? provForm.assignedStationId
            : '',
        assignedStationName: chosenStation?.name || '',
        region: provForm.region,
        businessName: provForm.businessName,
        licenseNumber: provForm.licenseNumber,
        initialPassword: provForm.initialPassword,
        existingUserUid: matchedUser?.uid,
      });

      setFeedback(
        res.authCreated
          ? lang === 'sw'
            ? `Akaunti ya ${cleanEmail} (${provForm.role}) imeundwa kikamilifu na neno la siri!`
            : `Account ${cleanEmail} (${provForm.role}) created with password!`
          : lang === 'sw'
            ? `Akaunti ya ${cleanEmail} (${provForm.role}) imeidhinishwa! Akishabonyeza "Ingia kwa Google" na barua pepe hii, ataingia moja kwa moja kwenye dashibodi yake.`
            : `Provisioned ${cleanEmail} as ${provForm.role}. They will land in their role workspace automatically upon Google Sign-In.`
      );
      setProvForm({
        fullName: '',
        email: '',
        phone: '+255 ',
        role: 'agent',
        assignedStationId: stations[0]?.id || '',
        region: 'Dar es Salaam',
        businessName: '',
        licenseNumber: '',
        initialPassword: '',
      });
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Provision failed');
    } finally {
      setProvBusy(false);
    }
  };

  const handleDeleteProvision = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'role_provisions', id));
      setFeedback('Provision removed.');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `role_provisions/${id}`);
    }
  };

  const handleBusinessApprove = async (
    biz: BusinessAccount,
    approvalStatus: 'approved' | 'rejected' | 'suspended',
    creditLimitTzs: number,
    paymentTermsDays: number
  ) => {
    try {
      await updateDoc(doc(db, 'businesses', biz.id), {
        approvalStatus,
        creditLimitTzs,
        paymentTermsDays,
        updatedAt: serverTimestamp(),
      });
      if (approvalStatus === 'approved') {
        await updateDoc(doc(db, 'users', biz.ownerId), {
          role: 'business',
          updatedAt: serverTimestamp(),
        });
      }
      await writeAuditLog({
        action: 'BUSINESS_APPROVAL',
        targetCollection: 'businesses',
        targetId: biz.id,
        summary: `${biz.companyName} -> ${approvalStatus} (Limit ${creditLimitTzs})`,
      });
      setFeedback(`${biz.companyName} marked ${approvalStatus}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `businesses/${biz.id}`);
    }
  };

  const handleAgentApprove = async (
    agent: AgentProfile,
    approvalStatus: 'approved' | 'suspended',
    commissionRatePct: number
  ) => {
    try {
      await updateDoc(doc(db, 'agents', agent.id), {
        approvalStatus,
        commissionRatePct,
        updatedAt: serverTimestamp(),
      });
      if (approvalStatus === 'approved') {
        await updateDoc(doc(db, 'users', agent.userId), {
          role: 'agent',
          updatedAt: serverTimestamp(),
        });
      }
      await writeAuditLog({
        action: 'AGENT_APPROVAL',
        targetCollection: 'agents',
        targetId: agent.id,
        summary: `${agent.businessName} -> ${approvalStatus} (${commissionRatePct}%)`,
      });
      setFeedback(`${agent.businessName} marked ${approvalStatus}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `agents/${agent.id}`);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'system_settings', 'global'), {
        ...settingsForm,
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog({
        action: 'UPDATE_SETTINGS',
        targetCollection: 'system_settings',
        targetId: 'global',
        summary: `Updated pointsPer1000Tzs=${settingsForm.pointsPer1000Tzs}`,
      });
      setFeedback('System settings saved.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'system_settings/global');
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProd.nameSw.trim() || !newProd.sku.trim()) return;
    const pid = makeId('prod');
    try {
      await setDoc(doc(db, 'products', pid), {
        categorySlug: newProd.roleScope === 'gas' ? 'lpg_refill' : 'fuel_retail',
        sku: newProd.sku.trim().toUpperCase(),
        nameSw: newProd.nameSw.trim(),
        nameEn: newProd.nameEn.trim() || newProd.nameSw.trim(),
        unit: newProd.unit,
        priceTzs: Number(newProd.priceTzs),
        isDemoPlaceholderPrice: false,
        roleScope: newProd.roleScope,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewProd({
        nameSw: '',
        nameEn: '',
        sku: '',
        unit: 'cylinder',
        priceTzs: 25000,
        roleScope: 'gas',
      });
      setFeedback('Product added to catalog.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `products/${pid}`);
    }
  };

  const resetStationForm = () => {
    setEditingStationId(null);
    setStationForm({
      name: '',
      code: '',
      stationKind: 'both',
      city: 'Dar es Salaam',
      region: 'Dar es Salaam',
      address: '',
      lat: -6.7924,
      lng: 39.2083,
      open24Hours: true,
      hasGas: true,
      hasFuel: true,
      hasLubricants: true,
      petrolPriceTzs: 3150,
      dieselPriceTzs: 3050,
      pumpsCount: 6,
      lpg6kgStock: 30,
      lpg15kgStock: 25,
      lpg38kgStock: 10,
      managerUid: '',
      status: 'active',
    });
  };

  const startEditStation = (st: Station) => {
    setEditingStationId(st.id);
    setStationForm({
      name: st.name,
      code: st.code,
      stationKind:
        st.stationKind ||
        (st.hasFuel && st.hasGas ? 'both' : st.hasGas ? 'gas' : 'fuel'),
      city: st.city,
      region: st.region,
      address: st.address,
      lat: st.lat,
      lng: st.lng,
      open24Hours: Boolean(st.open24Hours),
      hasGas: st.hasGas ?? true,
      hasFuel: st.hasFuel ?? true,
      hasLubricants: st.hasLubricants ?? true,
      petrolPriceTzs: st.petrolPriceTzs ?? 3150,
      dieselPriceTzs: st.dieselPriceTzs ?? 3050,
      pumpsCount: st.pumpsCount ?? 6,
      lpg6kgStock: st.lpg6kgStock ?? 0,
      lpg15kgStock: st.lpg15kgStock ?? 0,
      lpg38kgStock: st.lpg38kgStock ?? 0,
      managerUid: st.managerUid || '',
      status: st.status,
    });
  };

  const handleSaveStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      stationForm.name.trim().length < 2 ||
      stationForm.code.trim().length < 2 ||
      stationForm.address.trim().length < 2
    ) {
      return;
    }

    const sid = editingStationId || makeId('stn');
    const selectedManager = users.find((u) => u.uid === stationForm.managerUid);
    const kind = stationForm.stationKind;
    const payload = {
      name: stationForm.name.trim().slice(0, 120),
      code: stationForm.code.trim().toUpperCase().slice(0, 32),
      stationKind: kind,
      city: stationForm.city.trim().slice(0, 80) || 'Dar es Salaam',
      region: stationForm.region.trim().slice(0, 80) || 'Dar es Salaam',
      address: stationForm.address.trim().slice(0, 200),
      lat: Number(stationForm.lat),
      lng: Number(stationForm.lng),
      open24Hours: Boolean(stationForm.open24Hours),
      hasGas: kind === 'gas' || kind === 'both' ? true : Boolean(stationForm.hasGas),
      hasFuel: kind === 'fuel' || kind === 'both' ? true : Boolean(stationForm.hasFuel),
      hasLubricants: Boolean(stationForm.hasLubricants),
      petrolPriceTzs: Math.max(0, Number(stationForm.petrolPriceTzs) || 0),
      dieselPriceTzs: Math.max(0, Number(stationForm.dieselPriceTzs) || 0),
      pumpsCount: Math.max(0, Number(stationForm.pumpsCount) || 0),
      lpg6kgStock: Math.max(0, Number(stationForm.lpg6kgStock) || 0),
      lpg15kgStock: Math.max(0, Number(stationForm.lpg15kgStock) || 0),
      lpg38kgStock: Math.max(0, Number(stationForm.lpg38kgStock) || 0),
      managerUid: selectedManager?.uid || '',
      managerName: selectedManager?.fullName || '',
      managerEmail: selectedManager?.email.toLowerCase() || '',
      status: stationForm.status,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingStationId) {
        await updateDoc(doc(db, 'stations', sid), payload);
        if (selectedManager) {
          await updateDoc(doc(db, 'users', selectedManager.uid), {
            assignedStationId: sid,
            updatedAt: serverTimestamp(),
          });
        }
        await writeAuditLog({
          action: 'UPDATE_STATION',
          targetCollection: 'stations',
          targetId: sid,
          summary: `Updated station ${payload.name} (${payload.code})`,
        });
        setFeedback(`Station ${payload.name} updated.`);
      } else {
        await setDoc(doc(db, 'stations', sid), {
          ...payload,
          isDemoData: false,
          createdAt: serverTimestamp(),
        });
        if (selectedManager) {
          await updateDoc(doc(db, 'users', selectedManager.uid), {
            assignedStationId: sid,
            updatedAt: serverTimestamp(),
          });
        }
        await writeAuditLog({
          action: 'CREATE_STATION',
          targetCollection: 'stations',
          targetId: sid,
          summary: `Added station ${payload.name} (${payload.code})`,
        });
        setFeedback(`Station ${payload.name} created.`);
      }
      resetStationForm();
    } catch (err) {
      handleFirestoreError(
        err,
        editingStationId ? OperationType.UPDATE : OperationType.CREATE,
        `stations/${sid}`
      );
    }
  };

  const handleAddAdminStationStaff = async (e: React.FormEvent, st: Station) => {
    e.preventDefault();
    if (
      newStaffForm.fullName.trim().length < 2 ||
      newStaffForm.phone.trim().length < 5
    ) {
      return;
    }
    await addStationStaffMember({
      stationId: st.id,
      stationName: st.name,
      managerUid: st.managerUid || '',
      fullName: newStaffForm.fullName,
      phone: newStaffForm.phone,
      staffRole: newStaffForm.staffRole,
      shift: newStaffForm.shift,
    });
    setNewStaffForm({
      fullName: '',
      phone: '+255 ',
      staffRole: st.stationKind === 'gas' ? 'gas_filler' : 'attendant',
      shift: 'morning',
    });
    setFeedback(`Added staff member to ${st.name}.`);
  };

  const stationManagerCandidates = useMemo(
    () =>
      users.filter(
        (u) =>
          u.role === 'station_manager' ||
          u.role === 'gas_manager' ||
          u.role === 'admin'
      ),
    [users]
  );

  const staffModalStation = useMemo(
    () => stations.find((s) => s.id === staffModalStationId) || null,
    [stations, staffModalStationId]
  );

  const staffForSelectedStation = useMemo(
    () =>
      staffModalStation
        ? stationStaff.filter((m) => m.stationId === staffModalStation.id)
        : [],
    [stationStaff, staffModalStation]
  );

  return (
    <div className="space-y-3.5 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#F5B800] shrink-0" />
            {t(lang, 'adminConsole')}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
            {lang === 'sw'
              ? 'Usimamizi wa watumiaji, biashara, mawakala, bidhaa, zawadi na kumbukumbu.'
              : 'Centralized governance for RBAC, approvals, pricing, rewards & audit logs.'}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto shrink-0">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as 'all' | '7d' | '30d')}
            className="w-full sm:w-auto px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-white dark:bg-[#0E172E] text-xs"
          >
            <option value="all">All Time</option>
            <option value="30d">Last 30 Days</option>
            <option value="7d">Last 7 Days</option>
          </select>
          <button
            type="button"
            onClick={exportCsvReport}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#0B2A6F] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#F5B800]" />
            Export CSV
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-xs text-blue-900 dark:text-blue-200">
          {feedback}
        </div>
      )}

      {/* Admin Sub-Nav */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-200/70 dark:bg-blue-950/60 w-full sm:w-fit overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          [
            ['overview', 'Analytics'],
            ['gis', lang === 'sw' ? 'GIS & Upanuzi' : 'GIS Intelligence'],
            ['users', `Users (${users.length})`],
            ['businesses', `Businesses (${businesses.length})`],
            ['agents', `Agents (${agents.length})`],
            ['catalog', `Catalog (${products.length})`],
            ['stations', `Stations (${stations.length})`],
            ['settings', 'Rules & Rewards'],
            ['logs', `Audit Logs (${auditLogs.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
              tab === k
                ? 'bg-white dark:bg-[#0E172E] text-neutral-900 dark:text-[#F5B800]'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-3.5 sm:space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
            {[
              ['Total Sales', formatTzs(metrics.totalSales)],
              ['Total Orders', `${metrics.totalOrders} (${metrics.pendingOrders} pending)`],
              ['Completed Orders', String(metrics.completedOrders)],
              ['Customers / Active', `${metrics.totalCustomers} / ${metrics.activeUsers}`],
              ['Business Accounts', String(metrics.totalBusinesses)],
              ['Authorized Agents', String(metrics.totalAgents)],
              ['Rewards Issued / Redeemed', `${metrics.rewardsIssued} / ${metrics.rewardsRedeemed}`],
              ['Total Gas Stock', `${metrics.gasStock} cylinders · ${stations.length} stations`],
            ].map(([label, val]) => (
              <div
                key={label}
                className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-3.5 sm:p-4 min-w-0"
              >
                <p className="text-[11px] sm:text-xs text-neutral-500 truncate">{label}</p>
                <p className="font-mono-num text-base sm:text-lg font-extrabold text-neutral-900 dark:text-white mt-0.5 sm:mt-1 truncate">
                  {val}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-6">
            <div className="min-w-0 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6">
              <h3 className="font-display font-bold text-base mb-3 sm:mb-4">
                Order Volume by Status
              </h3>
              <div className="h-56 sm:h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusChart}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis fontSize={11} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#D92027" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="min-w-0 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6">
              <h3 className="font-display font-bold text-base mb-3 sm:mb-4">
                Order Distribution
              </h3>
              <div className="h-56 sm:h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusChart}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                    >
                      {statusChart.map((entry, idx) => (
                        <Cell
                          key={entry.name}
                          fill={PIE_COLORS[idx % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'gis' && (
        <div className="space-y-4 sm:space-y-5">
          <input
            ref={gisConverterInputRef}
            type="file"
            accept=".csv,.tsv,.kml,.geojson,.json,text/csv,application/vnd.google-earth.kml+xml,application/geo+json,application/json"
            onChange={handleSpatialConvertUpload}
            className="hidden"
          />

          {/* GIS Controls & OGC GeoJSON Export Toolbar */}
          <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-5 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <h2 className="font-display font-bold text-base sm:text-lg text-neutral-900 dark:text-white flex items-center gap-2">
                  <Globe className="w-5 h-5 text-[#F5B800] shrink-0" />
                  <span>
                    {lang === 'sw'
                      ? 'Kituo cha Akili ya Ramani (GIS & Upanuzi wa Mtandao)'
                      : 'Network GIS & Site Suitability Studio'}
                  </span>
                </h2>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  {lang === 'sw'
                    ? 'Chambua umbali, mipaka ya Voronoi, alama za Overture Maps, na pakua faili za OGC GeoJSON kwa QGIS.'
                    : 'Analyze station buffers, Voronoi catchments, Overture morphology scores, and export OGC GeoJSON layers.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-[#091022]">
                  {([3, 5, 10] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setGisRadiusKm(r)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono-num cursor-pointer whitespace-nowrap transition-colors ${
                        gisRadiusKm === r
                          ? 'bg-[#0B2A6F] text-white'
                          : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                      }`}
                    >
                      {r} km
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const bundle = buildOilcomGeoJsonExport(
                      stations,
                      orders,
                      gisRadiusKm,
                      {
                        includeStations: true,
                        includeZones: true,
                        includeBuffers: true,
                        includeVoronoi: true,
                        includeHotspots: true,
                        timeSlice: gisTimeSlice,
                      }
                    );
                    downloadGeoJsonFile(
                      `oilcom-network-${gisRadiusKm}km-${gisTimeSlice}.geojson`,
                      bundle
                    );
                    setFeedback(
                      lang === 'sw'
                        ? `Faili la mtandao (${bundle.features.length} vipengele) limepakuliwa tayari kwa QGIS.`
                        : `Exported full OGC GeoJSON bundle (${bundle.features.length} features) for QGIS.`
                    );
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#0B2A6F] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-[#F5B800]" />
                  <span>
                    {lang === 'sw' ? 'Pakua Mtandao (.geojson)' : 'Export Full GeoJSON'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const buffers = buildStationBuffersGeoJson(stations, gisRadiusKm);
                    downloadGeoJsonFile(
                      `oilcom-buffers-${gisRadiusKm}km.geojson`,
                      buffers
                    );
                    setFeedback(
                      lang === 'sw'
                        ? `Miduara ya ${gisRadiusKm} km (${buffers.features.length}) imepakuliwa.`
                        : `Exported ${buffers.features.length} station buffer polygons (${gisRadiusKm} km).`
                    );
                  }}
                  className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-900 bg-white dark:bg-[#091022] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Compass className="w-3.5 h-3.5 text-blue-600 dark:text-[#F5B800]" />
                  <span>{lang === 'sw' ? 'Pakua Buffers' : 'Export Buffers'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const voronoi = buildStationVoronoiGeoJson(stations);
                    downloadGeoJsonFile('oilcom-voronoi-catchments.geojson', voronoi);
                    setFeedback(
                      lang === 'sw'
                        ? `Maeneo ya Voronoi (${voronoi.features.length} vituo) yamepakuliwa.`
                        : `Exported ${voronoi.features.length} Voronoi catchment polygons.`
                    );
                  }}
                  className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-900 bg-white dark:bg-[#091022] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Hexagon className="w-3.5 h-3.5 text-emerald-600 dark:text-[#F5B800]" />
                  <span>{lang === 'sw' ? 'Pakua Voronoi' : 'Export Voronoi'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const hotspots = buildDemandHotspotsGeoJson(
                      stations,
                      orders,
                      gisTimeSlice
                    );
                    downloadGeoJsonFile(
                      `oilcom-demand-hotspots-${gisTimeSlice}.geojson`,
                      hotspots
                    );
                    setFeedback(
                      lang === 'sw'
                        ? `Safu ya mahitaji (${hotspots.features.length} vitovu · ${gisTimeSlice}) imepakuliwa.`
                        : `Exported ${hotspots.features.length} spatial demand hotspots (${gisTimeSlice}).`
                    );
                  }}
                  className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-900 bg-white dark:bg-[#091022] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-[#D92027]" />
                  <span>{lang === 'sw' ? 'Pakua Hotspots' : 'Export Hotspots'}</span>
                </button>
              </div>
            </div>

            {/* Temporal Demand Slice Selector */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100 dark:border-blue-950">
              <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                {lang === 'sw'
                  ? 'Muda wa Uchambuzi wa Mahitaji (Temporal Slice):'
                  : 'Temporal Demand Replay Window:'}
              </span>
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-[#091022]">
                {(
                  [
                    ['all', lang === 'sw' ? 'Saa 24' : 'All Day'],
                    ['morning', lang === 'sw' ? 'Asubuhi (06–11)' : 'Morning (06–11)'],
                    ['midday', lang === 'sw' ? 'Mchana (11–16)' : 'Midday (11–16)'],
                    ['evening', lang === 'sw' ? 'Jioni (16–21)' : 'Evening (16–21)'],
                    ['night', lang === 'sw' ? 'Usiku (21–06)' : 'Night (21–06)'],
                  ] as [TimeSliceKey, string][]
                ).map(([slice, label]) => (
                  <button
                    key={slice}
                    type="button"
                    onClick={() => setGisTimeSlice(slice)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                      gisTimeSlice === slice
                        ? 'bg-[#0B2A6F] text-[#F5B800]'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 5 Spatial & Overture Morphology KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-4">
            <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-3.5 sm:p-4 min-w-0">
              <p className="text-[11px] sm:text-xs text-neutral-500 truncate">
                {lang === 'sw' ? 'Vituo & Kanda za GIS' : 'Active Stations & Zones'}
              </p>
              <p className="font-mono-num tabular-nums text-base sm:text-lg font-extrabold text-neutral-900 dark:text-white mt-1 truncate">
                {gisAnalysis.activeStationsCount} / {gisAnalysis.deliveryZonesCount}{' '}
                <span className="text-xs font-medium text-neutral-500">zones</span>
              </p>
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-3.5 sm:p-4 min-w-0">
              <p className="text-[11px] sm:text-xs text-neutral-500 truncate">
                {lang === 'sw' ? 'Wastani wa Umbali kati ya Vituo' : 'Avg Station Spacing'}
              </p>
              <p className="font-mono-num tabular-nums text-base sm:text-lg font-extrabold text-neutral-900 dark:text-white mt-1 truncate">
                {gisAnalysis.avgNearestStationKm} km
              </p>
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-3.5 sm:p-4 min-w-0">
              <p className="text-[11px] sm:text-xs text-neutral-500 truncate">
                {lang === 'sw'
                  ? `Pengo za Upanuzi (> ${gisRadiusKm} km)`
                  : `Expansion Gaps (> ${gisRadiusKm} km)`}
              </p>
              <p className="font-mono-num tabular-nums text-base sm:text-lg font-extrabold text-[#D92027] dark:text-[#F5B800] mt-1 truncate">
                {gisAnalysis.unservedCandidatesCount}{' '}
                <span className="text-xs font-medium text-neutral-500">
                  {lang === 'sw' ? 'maeneo' : 'corridors'}
                </span>
              </p>
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-3.5 sm:p-4 min-w-0">
              <p className="text-[11px] sm:text-xs text-neutral-500 truncate">
                {lang === 'sw'
                  ? `Ufikiaji wa Mtandao (${gisRadiusKm} km)`
                  : `Network Coverage (${gisRadiusKm} km)`}
              </p>
              <p className="font-mono-num tabular-nums text-base sm:text-lg font-extrabold text-blue-700 dark:text-blue-400 mt-1 truncate">
                {gisAnalysis.zoneCoveragePct}%{' '}
                <span className="text-xs font-medium text-neutral-500">
                  ({gisAnalysis.ordersInZonesCount} {lang === 'sw' ? 'oda' : 'orders'})
                </span>
              </p>
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-3.5 sm:p-4 min-w-0 col-span-2 lg:col-span-1">
              <p className="text-[11px] sm:text-xs text-neutral-500 truncate">
                {lang === 'sw'
                  ? 'Alama ya Miji (Overture Index)'
                  : 'Overture Morphology Index'}
              </p>
              <p className="font-mono-num tabular-nums text-base sm:text-lg font-extrabold text-emerald-700 dark:text-emerald-400 mt-1 truncate">
                {gisAnalysis.avgOvertureNetworkScore}/100
              </p>
            </div>
          </div>

          {/* Site Suitability & White-Spot Expansion Table with Overture Morphology */}
          <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
                  {lang === 'sw'
                    ? 'Mapendekezo ya Maeneo Mapya ya Vituo (Site Suitability & Overture)'
                    : 'Site Suitability & Overture Urban Morphology'}
                </h3>
                <p className="text-xs text-neutral-500">
                  {lang === 'sw'
                    ? `Imepangwa kwa maeneo yenye pengo nje ya ${gisRadiusKm} km, msongamano wa majengo/barabara (Overture Maps) na oda.`
                    : `Ranked by unserved corridors outside ${gisRadiusKm} km, building/road density (Overture Maps), and live orders.`}
                </p>
              </div>
              <span className="text-xs font-mono-num tabular-nums text-neutral-500 shrink-0">
                {gisAnalysis.expansionCandidates.length}{' '}
                {lang === 'sw' ? 'vitovu vimechambuliwa' : 'corridors analyzed'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-blue-950 text-neutral-500">
                    <th className="py-2 pr-4">
                      {lang === 'sw' ? 'Ukanda / Eneo' : 'Corridor / Hub'}
                    </th>
                    <th className="py-2 pr-4">
                      {lang === 'sw' ? 'Kituo cha Karibu' : 'Nearest OILCOM'}
                    </th>
                    <th className="py-2 pr-4 text-right">
                      {lang === 'sw' ? 'Umbali' : 'Gap Dist.'}
                    </th>
                    <th className="py-2 pr-4 text-right">
                      {lang === 'sw' ? 'Majengo / Barabara' : 'Overture Urban'}
                    </th>
                    <th className="py-2 pr-4 text-right">
                      {lang === 'sw' ? 'Alama' : 'Score'}
                    </th>
                    <th className="py-2 pr-4">
                      {lang === 'sw' ? 'Hali ya Huduma' : 'Coverage Status'}
                    </th>
                    <th className="py-2 pr-4">
                      {lang === 'sw' ? 'Pendekezo' : 'Recommended'}
                    </th>
                    <th className="py-2 text-right">
                      {lang === 'sw' ? 'Hatua' : 'Action'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-blue-950">
                  {gisAnalysis.expansionCandidates.map((cand) => (
                    <tr
                      key={cand.id}
                      className="hover:bg-neutral-50 dark:hover:bg-blue-950/30"
                    >
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-neutral-900 dark:text-white">
                          {lang === 'sw' ? cand.nameSw : cand.nameEn}
                        </p>
                        <p className="text-[11px] text-neutral-500 font-mono-num">
                          {cand.city} · {cand.lat.toFixed(4)}, {cand.lng.toFixed(4)}
                        </p>
                      </td>
                      <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-300">
                        {cand.nearestStationName}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono-num tabular-nums font-bold">
                        {cand.nearestStationKm} km
                      </td>
                      <td className="py-3 pr-4 text-right font-mono-num tabular-nums text-[11px] text-neutral-600 dark:text-neutral-300 whitespace-nowrap">
                        {cand.buildingDensityPerKm2.toLocaleString()}/km² ·{' '}
                        {cand.roadNetworkKmPerKm2} km
                      </td>
                      <td className="py-3 pr-4 text-right font-mono-num tabular-nums font-bold text-[#0B2A6F] dark:text-[#F5B800]">
                        {cand.overtureSuitabilityScore}/100
                      </td>
                      <td className="py-3 pr-4 font-semibold whitespace-nowrap">
                        {cand.coverageStatus === 'unserved' ? (
                          <span className="text-[#D92027] dark:text-red-400">
                            {lang === 'sw'
                              ? 'Pengo Kubwa (White Spot)'
                              : 'Unserved Gap'}
                          </span>
                        ) : cand.coverageStatus === 'partial' ? (
                          <span className="text-amber-700 dark:text-[#F5B800]">
                            {lang === 'sw'
                              ? 'Huduma Nusu (Inahitaji LPG/Mafuta)'
                              : 'Partial Service'}
                          </span>
                        ) : (
                          <span className="text-blue-700 dark:text-blue-400">
                            {lang === 'sw' ? 'Inafikiwa' : 'Covered'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono-num text-[11px]">
                        {cand.recommendedKind === 'both'
                          ? 'Fuel + LPG'
                          : cand.recommendedKind === 'gas'
                            ? 'LPG Depot'
                            : 'Fuel Station'}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handlePrefillStationFromCandidate(cand)}
                          className="px-3 py-1.5 rounded-lg bg-[#F5B800] hover:bg-[#e5ab00] text-[#0B2A6F] font-bold text-[11px] cursor-pointer whitespace-nowrap"
                        >
                          {lang === 'sw' ? '+ Weka Kituo' : '+ Deploy Site'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* CSV / KML -> OGC GeoJSON Importer & Converter */}
          <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-[#F5B800]" />
                  <span>
                    {lang === 'sw'
                      ? 'Mbadilishaji wa CSV & KML kwenda OGC GeoJSON'
                      : 'CSV & KML → OGC GeoJSON Converter'}
                  </span>
                </h3>
                <p className="text-xs text-neutral-500">
                  {lang === 'sw'
                    ? 'Pakia orodha za wateja wa B2B (.csv yenye lat/lng) au alama za Google Earth (.kml) kubadilisha mara moja kuwa GeoJSON.'
                    : 'Convert field survey spreadsheets (.csv with lat/lng) or Google Earth files (.kml) into standard GeoJSON.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(
                      'oilcom-sample-sites.csv',
                      SAMPLE_OILCOM_SITES_CSV,
                      'text/csv;charset=utf-8'
                    )
                  }
                  className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-900 bg-white dark:bg-[#091022] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-[#0B2A6F] dark:text-[#F5B800]" />
                  <span>
                    {lang === 'sw' ? 'Pakua Kiolezo (.csv)' : 'Sample CSV'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => gisConverterInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl bg-[#0B2A6F] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5 text-[#F5B800]" />
                  <span>
                    {lang === 'sw' ? 'Pakia CSV / KML' : 'Upload CSV / KML'}
                  </span>
                </button>
                {convertedSpatial && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadGeoJsonFile(
                        convertedSpatial.fileName.replace(/\.(csv|tsv|kml|json)$/i, '') +
                          '.geojson',
                        convertedSpatial.collection
                      )
                    }
                    className="px-3.5 py-2 rounded-xl bg-[#F5B800] text-[#0B2A6F] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {lang === 'sw' ? 'Pakua GeoJSON' : 'Download GeoJSON'} (
                      {convertedSpatial.collection.features.length})
                    </span>
                  </button>
                )}
              </div>
            </div>

            {convertedSpatial && (
              <div className="overflow-x-auto border-t border-neutral-100 dark:border-blue-950 pt-3">
                <p className="text-[11px] font-semibold text-neutral-500 mb-2">
                  {convertedSpatial.fileName} · {convertedSpatial.format} → GeoJSON (
                  {convertedSpatial.collection.features.length}{' '}
                  {lang === 'sw' ? 'vipengele' : 'features'})
                </p>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-blue-950 text-neutral-500">
                      <th className="py-1.5 pr-4">#</th>
                      <th className="py-1.5 pr-4">
                        {lang === 'sw' ? 'Jina la Kipengele' : 'Feature Name'}
                      </th>
                      <th className="py-1.5 pr-4">Geometry</th>
                      <th className="py-1.5 text-right">Coordinates</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-blue-950">
                    {convertedSpatial.collection.features
                      .slice(0, 6)
                      .map((feat, idx) => {
                        const geom = feat.geometry;
                        let coordPreview = '—';
                        if (geom?.type === 'Point') {
                          coordPreview = `${geom.coordinates[1].toFixed(4)}, ${geom.coordinates[0].toFixed(4)}`;
                        } else if (geom?.type === 'Polygon' && geom.coordinates[0]?.[0]) {
                          coordPreview = `${geom.coordinates[0].length} vertices`;
                        } else if (geom?.type === 'LineString') {
                          coordPreview = `${geom.coordinates.length} points`;
                        }
                        return (
                          <tr key={String(feat.id ?? idx)}>
                            <td className="py-2 pr-4 font-mono-num text-neutral-500">
                              {idx + 1}
                            </td>
                            <td className="py-2 pr-4 font-semibold text-neutral-900 dark:text-white">
                              {String(
                                feat.properties?.name ||
                                  feat.properties?.id ||
                                  `Feature ${idx + 1}`
                              )}
                            </td>
                            <td className="py-2 pr-4 font-mono-num text-[11px]">
                              {geom?.type || 'None'}
                            </td>
                            <td className="py-2 text-right font-mono-num tabular-nums text-[11px]">
                              {coordPreview}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Station Spatial Spacing & Coverage Matrix */}
          <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3">
            <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
              {lang === 'sw'
                ? 'Umbali na Uwezo wa Vituo Kwenye Mtandao'
                : 'Station Spatial Spacing & Capacity Matrix'}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-blue-950 text-neutral-500">
                    <th className="py-2 pr-4">Code</th>
                    <th className="py-2 pr-4">Station</th>
                    <th className="py-2 pr-4">
                      {lang === 'sw' ? 'Kanda ya GIS' : 'GIS Corridor'}
                    </th>
                    <th className="py-2 pr-4 text-right">
                      {lang === 'sw' ? 'Kituo Kingine' : 'Nearest Sibling'}
                    </th>
                    <th className="py-2 pr-4 text-right">Pumps / LPG</th>
                    <th className="py-2 text-right">
                      {lang === 'sw' ? 'Oda' : 'Orders'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-blue-950">
                  {gisAnalysis.stationMetrics.map((m) => (
                    <tr key={m.stationId}>
                      <td className="py-2.5 pr-4 font-mono-num font-bold text-[#0B2A6F] dark:text-[#F5B800]">
                        {m.code}
                      </td>
                      <td className="py-2.5 pr-4">
                        <p className="font-semibold text-neutral-900 dark:text-white">
                          {m.name}
                        </p>
                        <p className="text-[11px] text-neutral-500">{m.city}</p>
                      </td>
                      <td className="py-2.5 pr-4 text-neutral-600 dark:text-neutral-300">
                        {(lang === 'sw' ? m.matchedZoneNameSw : m.matchedZoneNameEn) ||
                          (lang === 'sw' ? 'Nje ya kanda rasmi' : 'Outside mapped zones')}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono-num tabular-nums font-semibold">
                        {m.nearestSiblingKm !== null ? `${m.nearestSiblingKm} km` : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono-num tabular-nums">
                        {m.pumpsCount} pumps · {m.lpgCapacityUnits} cyl
                      </td>
                      <td className="py-2.5 text-right font-mono-num tabular-nums font-bold">
                        {m.ordersCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          {/* Admin Account Provisioning Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <form
              onSubmit={handleProvisionAccount}
              className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-5 space-y-3"
            >
              <h3 className="font-display font-bold text-sm sm:text-base flex items-center gap-2 text-neutral-900 dark:text-white">
                <UserPlus className="w-4 h-4 text-[#F5B800]" />
                <span>
                  {lang === 'sw'
                    ? 'Tengeneza Akaunti (Wakala / Meneja / B2B)'
                    : 'Provision Staff / Agent / Manager Account'}
                </span>
              </h3>
              <p className="text-[11px] text-neutral-500 leading-snug">
                {lang === 'sw'
                  ? 'Wateja hujisajili wenyewe. Mawakala, Mameneja wa Vituo (Mafuta/Gesi), na B2B huundwa hapa na Admin.'
                  : 'Customers self-register. Agents, Fuel/Gas Station Managers & B2B accounts are provisioned here by Admin.'}
              </p>

              <input
                type="text"
                required
                value={provForm.fullName}
                onChange={(e) => setProvForm({ ...provForm, fullName: e.target.value })}
                placeholder={lang === 'sw' ? 'Jina Kamili' : 'Full Name'}
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
              />
              <input
                type="email"
                required
                value={provForm.email}
                onChange={(e) => setProvForm({ ...provForm, email: e.target.value })}
                placeholder="email@gmail.com"
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="tel"
                  value={provForm.phone}
                  onChange={(e) => setProvForm({ ...provForm, phone: e.target.value })}
                  placeholder="+255 7XX..."
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                />
                <select
                  value={provForm.role}
                  onChange={(e) =>
                    setProvForm({ ...provForm, role: e.target.value as ProvisionedRole })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-semibold"
                >
                  <option value="agent">Wakala (Agent)</option>
                  <option value="station_manager">Meneja Kituo cha Mafuta</option>
                  <option value="gas_manager">Meneja Kituo cha Gesi</option>
                  <option value="business">Biashara (B2B)</option>
                  <option value="admin">Admin Msaidizi</option>
                </select>
              </div>

              {(provForm.role === 'station_manager' ||
                provForm.role === 'gas_manager' ||
                provForm.role === 'agent') && (
                <select
                  value={provForm.assignedStationId}
                  onChange={(e) =>
                    setProvForm({ ...provForm, assignedStationId: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
                >
                  <option value="">
                    {lang === 'sw' ? '-- Chagua Kituo Husika --' : '-- Assign Station --'}
                  </option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              )}

              {provForm.role === 'agent' && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={provForm.businessName}
                    onChange={(e) =>
                      setProvForm({ ...provForm, businessName: e.target.value })
                    }
                    placeholder={lang === 'sw' ? 'Jina la Duka / Wakala' : 'Dealer Shop Name'}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
                  />
                  <input
                    type="text"
                    value={provForm.licenseNumber}
                    onChange={(e) =>
                      setProvForm({ ...provForm, licenseNumber: e.target.value })
                    }
                    placeholder="License No."
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                  />
                </div>
              )}

              <input
                type="password"
                value={provForm.initialPassword}
                onChange={(e) =>
                  setProvForm({ ...provForm, initialPassword: e.target.value })
                }
                placeholder={
                  lang === 'sw'
                    ? 'Nywila ya awali (hiari kama anatumia Google)'
                    : 'Initial password (optional if using Google)'
                }
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
              />

              <button
                type="submit"
                disabled={provBusy}
                className="w-full py-2.5 rounded-xl bg-[#F5B800] hover:bg-[#e5ab00] text-[#0B2A6F] font-bold text-xs cursor-pointer disabled:opacity-60"
              >
                {provBusy
                  ? t(lang, 'loading')
                  : lang === 'sw'
                    ? 'Idhinisha & Tengeneza Akaunti'
                    : 'Provision Account'}
              </button>
            </form>

            {/* Provisioned Accounts List */}
            <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-5">
              <h4 className="font-display font-bold text-sm mb-3 text-neutral-900 dark:text-white">
                {lang === 'sw'
                  ? `Akaunti Zilizoidhinishwa na Admin (${provisions.length})`
                  : `Admin Role Provisions (${provisions.length})`}
              </h4>
              {provisions.length === 0 ? (
                <p className="py-8 text-center text-xs text-neutral-500">
                  {lang === 'sw'
                    ? 'Bado hujatengeneza akaunti ya wakala au meneja yeyote.'
                    : 'No provisioned staff/agent accounts yet.'}
                </p>
              ) : (
                <div className="divide-y divide-neutral-100 dark:divide-blue-950 max-h-80 overflow-y-auto">
                  {provisions.map((p) => (
                    <div
                      key={p.id}
                      className="py-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-neutral-900 dark:text-white truncate">
                          {p.fullName} ·{' '}
                          <span className="font-mono-num text-[#0B2A6F] dark:text-[#F5B800]">
                            {p.role}
                          </span>
                        </p>
                        <p className="text-neutral-500 truncate">
                          {p.email}
                          {p.assignedStationName ? ` · ${p.assignedStationName}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`font-mono-num text-[11px] font-bold uppercase ${
                            p.status === 'claimed'
                              ? 'text-blue-700 dark:text-blue-400'
                              : 'text-amber-600 dark:text-[#F5B800]'
                          }`}
                        >
                          {p.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteProvision(p.id)}
                          aria-label="Delete provision"
                          className="p-1 rounded-lg border border-red-200 dark:border-red-900 text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6">
            {/* Mobile Compact User Cards */}
            <div className="md:hidden divide-y divide-neutral-100 dark:divide-blue-950">
              {users.map((u) => (
                <div key={u.uid} className="py-3 space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                        {u.fullName}
                      </p>
                      <p className="text-neutral-500 truncate">{u.email}</p>
                    </div>
                    <span className="font-mono-num text-[11px] uppercase font-bold text-[#0B2A6F] dark:text-[#F5B800] shrink-0">
                      {u.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={u.role}
                      onChange={(e) =>
                        handleUserUpdate(u, { role: e.target.value as UserRole })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022]"
                    >
                      <option value="customer">customer</option>
                      <option value="agent">agent</option>
                      <option value="station_manager">station_manager</option>
                      <option value="gas_manager">gas_manager</option>
                      <option value="business">business</option>
                      <option value="admin">admin</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        handleUserUpdate(u, {
                          status: u.status === 'active' ? 'suspended' : 'active',
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-900 font-semibold text-center cursor-pointer"
                    >
                      {u.status === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                  </div>
                  {(u.role === 'station_manager' ||
                    u.role === 'gas_manager' ||
                    u.role === 'agent') && (
                    <select
                      value={u.assignedStationId || ''}
                      onChange={(e) =>
                        handleUserUpdate(u, { assignedStationId: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022]"
                    >
                      <option value="">-- Assign Station --</option>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Users Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-blue-950 text-neutral-500">
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Assigned Station</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-blue-950">
                  {users.map((u) => (
                    <tr key={u.uid}>
                      <td className="py-3 pr-4 font-semibold">{u.fullName}</td>
                      <td className="py-3 pr-4">{u.email}</td>
                      <td className="py-3 pr-4">
                        <select
                          value={u.role}
                          onChange={(e) =>
                            handleUserUpdate(u, { role: e.target.value as UserRole })
                          }
                          className="px-2 py-1 rounded-lg border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022]"
                        >
                          <option value="customer">customer</option>
                          <option value="agent">agent</option>
                          <option value="station_manager">station_manager</option>
                          <option value="gas_manager">gas_manager</option>
                          <option value="business">business</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="py-3 pr-4">
                        {u.role === 'station_manager' ||
                        u.role === 'gas_manager' ||
                        u.role === 'agent' ? (
                          <select
                            value={u.assignedStationId || ''}
                            onChange={(e) =>
                              handleUserUpdate(u, { assignedStationId: e.target.value })
                            }
                            className="px-2 py-1 rounded-lg border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] max-w-[180px]"
                          >
                            <option value="">-- Select Station --</option>
                            {stations.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">{u.status}</td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            handleUserUpdate(u, {
                              status: u.status === 'active' ? 'suspended' : 'active',
                            })
                          }
                          className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-blue-900 font-semibold cursor-pointer"
                        >
                          {u.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'businesses' && (
        <div className="space-y-3">
          {businesses.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
            >
              <div className="min-w-0">
                <p className="font-mono-num text-xs font-bold text-[#0B2A6F] dark:text-[#F5B800]">
                  TIN {b.tinNumber} · {b.approvalStatus.toUpperCase()}
                </p>
                <p className="font-semibold text-sm truncate">{b.companyName}</p>
                <p className="text-xs text-neutral-500">
                  Limit: {formatTzs(b.creditLimitTzs)} · Net {b.paymentTermsDays} days
                </p>
              </div>
              <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    handleBusinessApprove(b, 'approved', 25000000, 30)
                  }
                  className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold text-center cursor-pointer"
                >
                  Approve (25M)
                </button>
                <button
                  type="button"
                  onClick={() => handleBusinessApprove(b, 'suspended', 0, 15)}
                  className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold text-center cursor-pointer"
                >
                  Suspend
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'agents' && (
        <div className="space-y-3">
          {agents.map((ag) => (
            <div
              key={ag.id}
              className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
            >
              <div className="min-w-0">
                <p className="font-mono-num text-xs font-bold text-[#0B2A6F] dark:text-[#F5B800]">
                  {ag.licenseNumber} · {ag.approvalStatus.toUpperCase()}
                </p>
                <p className="font-semibold text-sm truncate">{ag.businessName}</p>
                <p className="text-xs text-neutral-500 truncate">
                  {ag.region} · {ag.phone} · Commission {ag.commissionRatePct}%
                </p>
              </div>
              <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto shrink-0">
                <button
                  type="button"
                  onClick={() => handleAgentApprove(ag, 'approved', 5)}
                  className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold text-center cursor-pointer"
                >
                  Approve (5%)
                </button>
                <button
                  type="button"
                  onClick={() => handleAgentApprove(ag, 'suspended', ag.commissionRatePct)}
                  className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold text-center cursor-pointer"
                >
                  Suspend
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'catalog' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 sm:gap-6">
          <form
            onSubmit={handleAddProduct}
            className="min-w-0 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3"
          >
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#F5B800]" />
              Add Catalog Product
            </h3>
            <input
              type="text"
              required
              value={newProd.sku}
              onChange={(e) => setNewProd({ ...newProd, sku: e.target.value })}
              placeholder="SKU (e.g. LPG-15KG-PROMO)"
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
            />
            <input
              type="text"
              required
              value={newProd.nameSw}
              onChange={(e) => setNewProd({ ...newProd, nameSw: e.target.value })}
              placeholder="Swahili Name"
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
            />
            <input
              type="text"
              value={newProd.nameEn}
              onChange={(e) => setNewProd({ ...newProd, nameEn: e.target.value })}
              placeholder="English Name"
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                required
                value={newProd.priceTzs}
                onChange={(e) =>
                  setNewProd({ ...newProd, priceTzs: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
              />
              <select
                value={newProd.roleScope}
                onChange={(e) =>
                  setNewProd({
                    ...newProd,
                    roleScope: e.target.value as 'gas' | 'fuel' | 'business',
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
              >
                <option value="gas">Gas</option>
                <option value="fuel">Fuel</option>
                <option value="business">Business</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#F5B800] text-[#071A4A] font-bold text-xs cursor-pointer"
            >
              Add Product
            </button>
          </form>

          <div className="lg:col-span-2 min-w-0 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 divide-y divide-neutral-100 dark:divide-blue-950">
            {products.map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900 dark:text-white truncate">
                    {p.nameSw}
                  </p>
                  <p className="text-neutral-500 font-mono-num truncate">
                    {p.sku} · {p.roleScope} · {p.unit}
                  </p>
                </div>
                <span className="font-mono-num font-bold shrink-0">
                  {formatTzs(p.priceTzs)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'stations' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 sm:gap-6">
            <form
              onSubmit={handleSaveStation}
              className="min-w-0 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-3 h-fit"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display font-bold text-base flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#F5B800]" />
                  {editingStationId
                    ? lang === 'sw'
                      ? 'Hariri Kituo'
                      : 'Edit Station'
                    : lang === 'sw'
                      ? 'Ongeza Kituo cha Mafuta / Gesi'
                      : 'Add Fuel Station / Gas Depot'}
                </h3>
                {editingStationId && (
                  <button
                    type="button"
                    onClick={resetStationForm}
                    className="text-xs font-semibold text-neutral-500 hover:underline cursor-pointer"
                  >
                    {lang === 'sw' ? 'Ghairi' : 'Cancel'}
                  </button>
                )}
              </div>

              <select
                value={stationForm.stationKind}
                onChange={(e) => {
                  const k = e.target.value as 'fuel' | 'gas' | 'both';
                  setStationForm({
                    ...stationForm,
                    stationKind: k,
                    hasFuel: k === 'fuel' || k === 'both',
                    hasGas: k === 'gas' || k === 'both',
                  });
                }}
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-semibold"
              >
                <option value="both">
                  {lang === 'sw' ? 'Mafuta & Gesi (Hybrid)' : 'Fuel & Gas (Hybrid)'}
                </option>
                <option value="fuel">
                  {lang === 'sw' ? 'Kituo cha Mafuta Pekee' : 'Fuel Station Only'}
                </option>
                <option value="gas">
                  {lang === 'sw' ? 'Kituo / Bohari ya Gesi Pekee' : 'Gas Station / Depot'}
                </option>
              </select>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={stationForm.name}
                  onChange={(e) =>
                    setStationForm({ ...stationForm, name: e.target.value })
                  }
                  placeholder="OILCOM Kibaha Hub"
                  className="col-span-2 sm:col-span-1 px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
                />
                <input
                  type="text"
                  required
                  value={stationForm.code}
                  onChange={(e) =>
                    setStationForm({ ...stationForm, code: e.target.value })
                  }
                  placeholder="Code (e.g. KBH-01)"
                  className="col-span-2 sm:col-span-1 px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={stationForm.city}
                  onChange={(e) =>
                    setStationForm({ ...stationForm, city: e.target.value })
                  }
                  placeholder="City"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
                />
                <input
                  type="text"
                  required
                  value={stationForm.region}
                  onChange={(e) =>
                    setStationForm({ ...stationForm, region: e.target.value })
                  }
                  placeholder="Region"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                  {lang === 'sw' ? 'Meneja wa Kituo' : 'Assigned Manager'}
                </label>
                <select
                  value={stationForm.managerUid}
                  onChange={(e) =>
                    setStationForm({ ...stationForm, managerUid: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
                >
                  <option value="">
                    {lang === 'sw'
                      ? '-- Hakuna Meneja Aliyepangiwa --'
                      : '-- No Manager Assigned --'}
                  </option>
                  {stationManagerCandidates.map((m) => (
                    <option key={m.uid} value={m.uid}>
                      {m.fullName} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-neutral-500">
                    {lang === 'sw' ? 'Anwani & Viwianishi' : 'Address & Coordinates'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setStationMapOpen(true)}
                    className="text-[11px] font-bold text-[#0B2A6F] dark:text-[#F5B800] flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <MapPin className="w-3 h-3" />
                    <span>
                      {lang === 'sw' ? 'Chagua Kwenye Ramani' : 'Pick on Map'}
                    </span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={stationForm.address}
                  onChange={(e) =>
                    setStationForm({ ...stationForm, address: e.target.value })
                  }
                  placeholder="Morogoro Rd, Kibaha"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.00001"
                  required
                  value={stationForm.lat}
                  onChange={(e) =>
                    setStationForm({ ...stationForm, lat: Number(e.target.value) })
                  }
                  placeholder="Lat"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                />
                <input
                  type="number"
                  step="0.00001"
                  required
                  value={stationForm.lng}
                  onChange={(e) =>
                    setStationForm({ ...stationForm, lng: Number(e.target.value) })
                  }
                  placeholder="Lng"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                />
              </div>

              {(stationForm.stationKind === 'fuel' ||
                stationForm.stationKind === 'both') && (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                      Petrol
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={stationForm.petrolPriceTzs}
                      onChange={(e) =>
                        setStationForm({
                          ...stationForm,
                          petrolPriceTzs: Number(e.target.value),
                        })
                      }
                      className="w-full px-2.5 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                      Diesel
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={stationForm.dieselPriceTzs}
                      onChange={(e) =>
                        setStationForm({
                          ...stationForm,
                          dieselPriceTzs: Number(e.target.value),
                        })
                      }
                      className="w-full px-2.5 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                      Pumps
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={stationForm.pumpsCount}
                      onChange={(e) =>
                        setStationForm({
                          ...stationForm,
                          pumpsCount: Number(e.target.value),
                        })
                      }
                      className="w-full px-2.5 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                    />
                  </div>
                </div>
              )}

              {(stationForm.stationKind === 'gas' ||
                stationForm.stationKind === 'both') && (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                      LPG 6kg
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={stationForm.lpg6kgStock}
                      onChange={(e) =>
                        setStationForm({
                          ...stationForm,
                          lpg6kgStock: Number(e.target.value),
                        })
                      }
                      className="w-full px-2.5 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                      LPG 15kg
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={stationForm.lpg15kgStock}
                      onChange={(e) =>
                        setStationForm({
                          ...stationForm,
                          lpg15kgStock: Number(e.target.value),
                        })
                      }
                      className="w-full px-2.5 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                      LPG 38kg
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={stationForm.lpg38kgStock}
                      onChange={(e) =>
                        setStationForm({
                          ...stationForm,
                          lpg38kgStock: Number(e.target.value),
                        })
                      }
                      className="w-full px-2.5 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stationForm.open24Hours}
                    onChange={(e) =>
                      setStationForm({
                        ...stationForm,
                        open24Hours: e.target.checked,
                      })
                    }
                  />
                  <span>24/7 Open</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stationForm.hasLubricants}
                    onChange={(e) =>
                      setStationForm({
                        ...stationForm,
                        hasLubricants: e.target.checked,
                      })
                    }
                  />
                  <span>Lubricants</span>
                </label>
              </div>

              <select
                value={stationForm.status}
                onChange={(e) =>
                  setStationForm({
                    ...stationForm,
                    status: e.target.value as 'active' | 'maintenance' | 'inactive',
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
              >
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="inactive">Inactive</option>
              </select>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#F5B800] text-[#071A4A] font-bold text-xs cursor-pointer"
              >
                {editingStationId
                  ? lang === 'sw'
                    ? 'Hifadhi Mabadiliko'
                    : 'Save Changes'
                  : lang === 'sw'
                    ? 'Ongeza Kituo'
                    : 'Create Station'}
              </button>
            </form>

            <div className="lg:col-span-2 min-w-0 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 divide-y divide-neutral-100 dark:divide-blue-950">
              {stations.map((st) => {
                const stStaff = stationStaff.filter((m) => m.stationId === st.id);
                const activeCount = stStaff.filter((m) => m.status === 'active').length;
                const stOrdersCount = orders.filter((o) => o.stationId === st.id).length;
                const kindLabel =
                  st.stationKind === 'gas'
                    ? 'GAS DEPOT'
                    : st.stationKind === 'fuel'
                      ? 'FUEL STATION'
                      : 'FUEL & GAS';
                return (
                  <div
                    key={st.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-mono-num text-[11px] font-bold text-[#0B2A6F] dark:text-[#F5B800]">
                        {st.code} · {kindLabel} · {st.status.toUpperCase()}
                      </p>
                      <p className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                        {st.name}
                      </p>
                      <p className="text-neutral-500 truncate">
                        {st.address}, {st.city} ·{' '}
                        {lang === 'sw' ? 'Meneja:' : 'Manager:'}{' '}
                        <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                          {st.managerName || (lang === 'sw' ? 'Hajapangiwa' : 'Unassigned')}
                        </span>
                      </p>
                      <p className="text-[11px] text-neutral-500 font-mono-num mt-0.5">
                        {lang === 'sw' ? 'Wafanyakazi:' : 'Staff:'}{' '}
                        <span className="font-bold text-neutral-800 dark:text-white">
                          {activeCount}/{stStaff.length}
                        </span>{' '}
                        · {lang === 'sw' ? 'Oda:' : 'Orders:'} {stOrdersCount}
                        {(st.lpg6kgStock || st.lpg15kgStock || st.lpg38kgStock)
                          ? ` · LPG ${(st.lpg6kgStock || 0) + (st.lpg15kgStock || 0) + (st.lpg38kgStock || 0)}`
                          : ''}
                        {st.pumpsCount ? ` · ${st.pumpsCount} Pumps` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setStaffModalStationId(
                            staffModalStationId === st.id ? null : st.id
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-[#0B2A6F] text-[#F5B800] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Users className="w-3 h-3" />
                        <span>
                          {lang === 'sw' ? 'Wafanyakazi' : 'Staff'} ({stStaff.length})
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditStation(st)}
                        className="px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-900 font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>{lang === 'sw' ? 'Hariri' : 'Edit'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Station Staff Management Drawer/Panel inside Admin Stations Tab */}
          {staffModalStation && (
            <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-[#F5B800]/60 p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-mono-num text-[11px] font-bold text-[#0B2A6F] dark:text-[#F5B800]">
                    {staffModalStation.code} · {lang === 'sw' ? 'USIMAMIZI WA WAFANYAKAZI' : 'STATION STAFF'}
                  </p>
                  <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
                    {staffModalStation.name} ({staffForSelectedStation.length}{' '}
                    {lang === 'sw' ? 'wafanyakazi' : 'staff'})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setStaffModalStationId(null)}
                  className="px-3 py-1 rounded-lg border border-neutral-200 dark:border-blue-900 text-xs font-semibold cursor-pointer"
                >
                  {t(lang, 'close')}
                </button>
              </div>

              <form
                onSubmit={(e) => handleAddAdminStationStaff(e, staffModalStation)}
                className="grid grid-cols-1 sm:grid-cols-5 gap-2"
              >
                <input
                  type="text"
                  required
                  value={newStaffForm.fullName}
                  onChange={(e) =>
                    setNewStaffForm({ ...newStaffForm, fullName: e.target.value })
                  }
                  placeholder={lang === 'sw' ? 'Jina la mfanyakazi' : 'Staff name'}
                  className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
                />
                <input
                  type="tel"
                  required
                  value={newStaffForm.phone}
                  onChange={(e) =>
                    setNewStaffForm({ ...newStaffForm, phone: e.target.value })
                  }
                  placeholder="+255 7XX..."
                  className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num"
                />
                <select
                  value={newStaffForm.staffRole}
                  onChange={(e) =>
                    setNewStaffForm({
                      ...newStaffForm,
                      staffRole: e.target.value as StationStaffRole,
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
                >
                  <option value="attendant">Attendant (Pampu)</option>
                  <option value="gas_filler">Gas Filler (Mitungi)</option>
                  <option value="cashier">Cashier (Keshia)</option>
                  <option value="driver">Driver (Dereva)</option>
                  <option value="supervisor">Supervisor (Msimamizi)</option>
                </select>
                <select
                  value={newStaffForm.shift}
                  onChange={(e) =>
                    setNewStaffForm({
                      ...newStaffForm,
                      shift: e.target.value as 'morning' | 'evening' | 'night',
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs"
                >
                  <option value="morning">Morning</option>
                  <option value="evening">Evening</option>
                  <option value="night">Night</option>
                </select>
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl bg-[#F5B800] text-[#0B2A6F] font-bold text-xs cursor-pointer"
                >
                  + {lang === 'sw' ? 'Ongeza' : 'Add Staff'}
                </button>
              </form>

              <div className="divide-y divide-neutral-100 dark:divide-blue-950">
                {staffForSelectedStation.length === 0 ? (
                  <p className="py-4 text-center text-xs text-neutral-500">
                    {lang === 'sw'
                      ? 'Hakuna wafanyakazi katika kituo hiki bado.'
                      : 'No staff members assigned to this station yet.'}
                  </p>
                ) : (
                  staffForSelectedStation.map((member) => (
                    <div
                      key={member.id}
                      className="py-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-neutral-900 dark:text-white truncate">
                          {member.fullName}
                        </p>
                        <p className="text-neutral-500 font-mono-num truncate">
                          {member.staffRole} · {member.shift} · {member.phone}
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
                          className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-blue-900 font-semibold cursor-pointer"
                        >
                          {member.status}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteStationStaffMember(member.id)}
                          aria-label="Remove staff"
                          className="p-1 rounded-lg border border-red-200 dark:border-red-900 text-red-600 cursor-pointer"
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
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-5">
          {/* Homepage Hero Media / Slideshow Management */}
          <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
                  {lang === 'sw'
                    ? 'Picha za Homepage (Hero & Slideshow)'
                    : 'Homepage Hero Photos & Slideshow'}
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {lang === 'sw'
                    ? 'Badilisha picha ya mbele ya OILCOM au weka picha nyingi zicheze kama slideshow kwa wageni wote.'
                    : 'Change the public OILCOM hero photo or add multiple photos for a live slideshow.'}
                </p>
              </div>
            </div>
            <HomepageSlidesManager lang={lang} slides={homepageSlides} />
          </div>

          <form
            onSubmit={handleSaveSettings}
            className="max-w-xl rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 space-y-4"
          >
            <h3 className="font-display font-bold text-base">
              Configurable Rewards & Order Rules
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Points per TZS 1,000
                </label>
                <input
                  type="number"
                  value={settingsForm.pointsPer1000Tzs}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      pointsPer1000Tzs: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Point Value (TZS)
                </label>
                <input
                  type="number"
                  value={settingsForm.pointRedemptionValueTzs}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      pointRedemptionValueTzs: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Gas Cancel Window (min)
                </label>
                <input
                  type="number"
                  value={settingsForm.gasCancelWindowMinutes}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      gasCancelWindowMinutes: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-sm font-mono-num"
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  checked={settingsForm.sandboxModeEnabled}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      sandboxModeEnabled: e.target.checked,
                    })
                  }
                />
                <span className="text-xs font-semibold">Sandbox Payment Mode</span>
              </div>
            </div>
            <button
              type="submit"
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#0B2A6F] text-white text-xs font-semibold cursor-pointer"
            >
              {t(lang, 'save')}
            </button>
          </form>
        </div>
      )}

      {tab === 'logs' && (
        <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 p-4 sm:p-6 divide-y divide-neutral-100 dark:divide-blue-950">
          {auditLogs.length === 0 ? (
            <p className="text-xs text-neutral-500 py-8 text-center">No audit logs yet.</p>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                <div className="min-w-0">
                  <p className="font-mono-num font-bold text-[#0B2A6F] dark:text-[#F5B800] truncate">
                    {log.action} · {log.targetCollection}/{log.targetId}
                  </p>
                  <p className="text-neutral-600 dark:text-neutral-300 mt-0.5 break-words">
                    {log.summary}
                  </p>
                </div>
                <span className="text-neutral-400 font-mono-num shrink-0">
                  {log.actorEmail} · {formatTimestamp(log.createdAt)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
      <MapLocationPickerModal
        lang={lang}
        open={stationMapOpen}
        googleMapsApiKey={googleMapsApiKey}
        initialAddress={stationForm.address}
        initialCoords={{ lat: stationForm.lat, lng: stationForm.lng }}
        onClose={() => setStationMapOpen(false)}
        onConfirm={({ street, city, lat, lng }) => {
          setStationForm((prev) => ({
            ...prev,
            address: street.slice(0, 200),
            city: city.slice(0, 80) || prev.city,
            region: city.slice(0, 80) || prev.region,
            lat,
            lng,
          }));
        }}
      />
    </div>
  );
}
