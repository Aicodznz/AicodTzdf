import React, { useMemo, useState } from 'react';
import {
  Download,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
} from 'lucide-react';
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
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { t } from '../i18n/translations';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { makeId, writeAuditLog } from '../lib/firestoreActions';
import type {
  AgentInventoryItem,
  AgentProfile,
  AuditLogEntry,
  BusinessAccount,
  GasOrder,
  Language,
  OilcomUser,
  Product,
  RewardsTransaction,
  Station,
  SystemSettings,
  UserRole,
} from '../types/oilcom';
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
  rewardsTx: RewardsTransaction[];
  inventory: AgentInventoryItem[];
  auditLogs: AuditLogEntry[];
  settings: SystemSettings;
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
  rewardsTx,
  inventory,
  auditLogs,
  settings,
  googleMapsApiKey = '',
}: AdminConsoleModuleProps) {
  const [tab, setTab] = useState<
    | 'overview'
    | 'users'
    | 'businesses'
    | 'agents'
    | 'catalog'
    | 'stations'
    | 'settings'
    | 'logs'
  >('overview');
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
  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [stationMapOpen, setStationMapOpen] = useState(false);
  const [stationForm, setStationForm] = useState({
    name: '',
    code: '',
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

  const PIE_COLORS = ['#F5B800', '#08291A', '#0f766e', '#16a34a', '#dc2626'];

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
    updates: { role?: UserRole; status?: 'active' | 'suspended' }
  ) => {
    try {
      await updateDoc(doc(db, 'users', targetUser.uid), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
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
      status: 'active',
    });
  };

  const startEditStation = (st: Station) => {
    setEditingStationId(st.id);
    setStationForm({
      name: st.name,
      code: st.code,
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
    const payload = {
      name: stationForm.name.trim().slice(0, 120),
      code: stationForm.code.trim().toUpperCase().slice(0, 32),
      city: stationForm.city.trim().slice(0, 80) || 'Dar es Salaam',
      region: stationForm.region.trim().slice(0, 80) || 'Dar es Salaam',
      address: stationForm.address.trim().slice(0, 200),
      lat: Number(stationForm.lat),
      lng: Number(stationForm.lng),
      open24Hours: Boolean(stationForm.open24Hours),
      hasGas: Boolean(stationForm.hasGas),
      hasFuel: Boolean(stationForm.hasFuel),
      hasLubricants: Boolean(stationForm.hasLubricants),
      petrolPriceTzs: Math.max(0, Number(stationForm.petrolPriceTzs) || 0),
      dieselPriceTzs: Math.max(0, Number(stationForm.dieselPriceTzs) || 0),
      status: stationForm.status,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingStationId) {
        await updateDoc(doc(db, 'stations', sid), payload);
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
            className="w-full sm:w-auto px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-white dark:bg-[#121b16] text-xs"
          >
            <option value="all">All Time</option>
            <option value="30d">Last 30 Days</option>
            <option value="7d">Last 7 Days</option>
          </select>
          <button
            type="button"
            onClick={exportCsvReport}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#08291A] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#F5B800]" />
            Export CSV
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-900 dark:text-emerald-200">
          {feedback}
        </div>
      )}

      {/* Admin Sub-Nav */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-200/70 dark:bg-emerald-950/60 w-full sm:w-fit overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          [
            ['overview', 'Analytics'],
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
                ? 'bg-white dark:bg-[#121b16] text-neutral-900 dark:text-[#F5B800]'
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
                className="rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-3.5 sm:p-4 min-w-0"
              >
                <p className="text-[11px] sm:text-xs text-neutral-500 truncate">{label}</p>
                <p className="font-mono-num text-base sm:text-lg font-extrabold text-neutral-900 dark:text-white mt-0.5 sm:mt-1 truncate">
                  {val}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-6">
            <div className="min-w-0 rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6">
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
                    <Bar dataKey="value" fill="#F5B800" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="min-w-0 rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6">
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

      {tab === 'users' && (
        <div className="rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6">
          {/* Mobile Compact User Cards */}
          <div className="md:hidden divide-y divide-neutral-100 dark:divide-emerald-950">
            {users.map((u) => (
              <div key={u.uid} className="py-3 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                      {u.fullName}
                    </p>
                    <p className="text-neutral-500 truncate">{u.email}</p>
                  </div>
                  <span className="font-mono-num text-[11px] uppercase font-bold text-[#08291A] dark:text-[#F5B800] shrink-0">
                    {u.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={u.role}
                    onChange={(e) =>
                      handleUserUpdate(u, { role: e.target.value as UserRole })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f]"
                  >
                    <option value="customer">customer</option>
                    <option value="business">business</option>
                    <option value="agent">agent</option>
                    <option value="admin">admin</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      handleUserUpdate(u, {
                        status: u.status === 'active' ? 'suspended' : 'active',
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-emerald-900 font-semibold text-center cursor-pointer"
                  >
                    {u.status === 'active' ? 'Suspend' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Users Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-emerald-950 text-neutral-500">
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-emerald-950">
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
                        className="px-2 py-1 rounded-lg border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f]"
                      >
                        <option value="customer">customer</option>
                        <option value="business">business</option>
                        <option value="agent">agent</option>
                        <option value="admin">admin</option>
                      </select>
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
                        className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-emerald-900 font-semibold cursor-pointer"
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
      )}

      {tab === 'businesses' && (
        <div className="space-y-3">
          {businesses.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
            >
              <div className="min-w-0">
                <p className="font-mono-num text-xs font-bold text-[#08291A] dark:text-[#F5B800]">
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
                  className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold text-center cursor-pointer"
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
              className="rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
            >
              <div className="min-w-0">
                <p className="font-mono-num text-xs font-bold text-[#08291A] dark:text-[#F5B800]">
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
                  className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold text-center cursor-pointer"
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
            className="min-w-0 rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6 space-y-3"
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
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs font-mono-num"
            />
            <input
              type="text"
              required
              value={newProd.nameSw}
              onChange={(e) => setNewProd({ ...newProd, nameSw: e.target.value })}
              placeholder="Swahili Name"
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs"
            />
            <input
              type="text"
              value={newProd.nameEn}
              onChange={(e) => setNewProd({ ...newProd, nameEn: e.target.value })}
              placeholder="English Name"
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                required
                value={newProd.priceTzs}
                onChange={(e) =>
                  setNewProd({ ...newProd, priceTzs: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs font-mono-num"
              />
              <select
                value={newProd.roleScope}
                onChange={(e) =>
                  setNewProd({
                    ...newProd,
                    roleScope: e.target.value as 'gas' | 'fuel' | 'business',
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs"
              >
                <option value="gas">Gas</option>
                <option value="fuel">Fuel</option>
                <option value="business">Business</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#F5B800] text-[#0b120e] font-bold text-xs cursor-pointer"
            >
              Add Product
            </button>
          </form>

          <div className="lg:col-span-2 min-w-0 rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6 divide-y divide-neutral-100 dark:divide-emerald-950">
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 sm:gap-6">
          <form
            onSubmit={handleSaveStation}
            className="min-w-0 rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display font-bold text-base flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#F5B800]" />
                {editingStationId
                  ? lang === 'sw'
                    ? 'Hariri Kituo'
                    : 'Edit Station'
                  : lang === 'sw'
                    ? 'Ongeza Kituo Kipya'
                    : 'Add OILCOM Station'}
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

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={stationForm.name}
                onChange={(e) =>
                  setStationForm({ ...stationForm, name: e.target.value })
                }
                placeholder="OILCOM Kibaha Hub"
                className="col-span-2 sm:col-span-1 px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs"
              />
              <input
                type="text"
                required
                value={stationForm.code}
                onChange={(e) =>
                  setStationForm({ ...stationForm, code: e.target.value })
                }
                placeholder="Code (e.g. KBH-01)"
                className="col-span-2 sm:col-span-1 px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs font-mono-num"
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
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs"
              />
              <input
                type="text"
                required
                value={stationForm.region}
                onChange={(e) =>
                  setStationForm({ ...stationForm, region: e.target.value })
                }
                placeholder="Region"
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-500">
                  {lang === 'sw' ? 'Anwani & Viwianishi' : 'Address & Coordinates'}
                </span>
                <button
                  type="button"
                  onClick={() => setStationMapOpen(true)}
                  className="text-[11px] font-bold text-[#08291A] dark:text-[#F5B800] flex items-center gap-1 hover:underline cursor-pointer"
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
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs"
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
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs font-mono-num"
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
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs font-mono-num"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                  Petrol (TZS/L)
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
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                  Diesel (TZS/L)
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
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs font-mono-num"
                />
              </div>
            </div>

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
                  checked={stationForm.hasGas}
                  onChange={(e) =>
                    setStationForm({ ...stationForm, hasGas: e.target.checked })
                  }
                />
                <span>OILCOM Gas</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stationForm.hasFuel}
                  onChange={(e) =>
                    setStationForm({ ...stationForm, hasFuel: e.target.checked })
                  }
                />
                <span>Fuel Pumps</span>
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
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs"
            >
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="inactive">Inactive</option>
            </select>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#F5B800] text-[#0b120e] font-bold text-xs cursor-pointer"
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

          <div className="lg:col-span-2 min-w-0 rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6 divide-y divide-neutral-100 dark:divide-emerald-950">
            {stations.map((st) => (
              <div
                key={st.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-mono-num text-[11px] font-bold text-[#08291A] dark:text-[#F5B800]">
                    {st.code} · {st.status.toUpperCase()} ·{' '}
                    {st.open24Hours ? '24/7' : 'Day'}
                  </p>
                  <p className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                    {st.name}
                  </p>
                  <p className="text-neutral-500 truncate">
                    {st.address}, {st.city} ({st.lat.toFixed(4)},{' '}
                    {st.lng.toFixed(4)})
                  </p>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <div className="text-right font-mono-num text-[11px] text-neutral-600 dark:text-neutral-300">
                    {st.petrolPriceTzs ? `P: ${formatTzs(st.petrolPriceTzs)}` : ''}{' '}
                    {st.dieselPriceTzs ? `· D: ${formatTzs(st.dieselPriceTzs)}` : ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => startEditStation(st)}
                    className="px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-emerald-900 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>{lang === 'sw' ? 'Hariri' : 'Edit'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <form
          onSubmit={handleSaveSettings}
          className="max-w-xl rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6 space-y-4"
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
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-sm font-mono-num"
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
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-sm font-mono-num"
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
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-sm font-mono-num"
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
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#08291A] text-white text-xs font-semibold cursor-pointer"
          >
            {t(lang, 'save')}
          </button>
        </form>
      )}

      {tab === 'logs' && (
        <div className="rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6 divide-y divide-neutral-100 dark:divide-emerald-950">
          {auditLogs.length === 0 ? (
            <p className="text-xs text-neutral-500 py-8 text-center">No audit logs yet.</p>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                <div className="min-w-0">
                  <p className="font-mono-num font-bold text-[#08291A] dark:text-[#F5B800] truncate">
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
