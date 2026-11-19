import React, { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Download,
  FileText,
  Plus,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { t } from '../i18n/translations';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { createNotification, makeId } from '../lib/firestoreActions';
import {
  downloadBusinessStatementPdf,
  downloadInvoicePdf,
} from '../lib/pdfGenerator';
import type {
  BusinessAccount,
  BusinessMember,
  BusinessOrder,
  Invoice,
  Language,
  OilcomUser,
  Product,
} from '../types/oilcom';
import { formatTimestamp, formatTzs } from './OilcomBrand';

interface BusinessPortalModuleProps {
  lang: Language;
  user: OilcomUser;
  business: BusinessAccount | null;
  members: BusinessMember[];
  businessOrders: BusinessOrder[];
  invoices: Invoice[];
  products: Product[];
}

export function BusinessPortalModule({
  lang,
  user,
  business,
  members,
  businessOrders,
  invoices,
  products,
}: BusinessPortalModuleProps) {
  const [tab, setTab] = useState<'overview' | 'orders' | 'invoices' | 'team'>(
    'overview'
  );
  const [regForm, setRegForm] = useState({
    companyName: '',
    tinNumber: '',
    contactEmail: user.email,
    contactPhone: user.phone || '+255 700 000 000',
    industry: 'Logistics & Transport',
  });
  const [selectedProdId, setSelectedProdId] = useState('');
  const [qtyUnits, setQtyUnits] = useState(1);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [memberForm, setMemberForm] = useState({
    fullName: '',
    email: '',
    memberRole: 'buyer' as 'approver' | 'buyer',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const b2bProducts = useMemo(
    () =>
      products.filter(
        (p) => p.active && (p.roleScope === 'business' || p.roleScope === 'fuel')
      ),
    [products]
  );

  const chartData = useMemo(() => {
    return businessOrders.slice(0, 6).map((ord) => ({
      name: ord.orderNumber.slice(-4),
      total: Math.round(ord.totalTzs / 1000),
    }));
  }, [businessOrders]);

  const handleRegisterBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regForm.companyName.trim() || !regForm.tinNumber.trim()) return;
    setBusy(true);
    setMsg('');
    const bizId = makeId('biz');
    try {
      await setDoc(doc(db, 'businesses', bizId), {
        ownerId: user.uid,
        companyName: regForm.companyName.trim().slice(0, 140),
        tinNumber: regForm.tinNumber.trim().slice(0, 40),
        contactEmail: regForm.contactEmail.trim().slice(0, 160),
        contactPhone: regForm.contactPhone.trim().slice(0, 32),
        industry: regForm.industry.trim().slice(0, 80),
        creditLimitTzs: 0,
        creditUsedTzs: 0,
        paymentTermsDays: 30,
        approvalStatus: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await createNotification({
        userId: user.uid,
        titleSw: 'Usajili wa Biashara Umepokelewa',
        titleEn: 'Business Registration Received',
        bodySw: `${regForm.companyName} inasubiri idhini ya Msimamizi (Admin).`,
        bodyEn: `${regForm.companyName} is awaiting Admin verification.`,
        category: 'business',
      });
      setMsg(
        lang === 'sw'
          ? 'Ombi la biashara limetumwa kwa idhini ya Admin.'
          : 'Business application submitted for Admin approval.'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `businesses/${bizId}`);
    } finally {
      setBusy(false);
    }
  };

  const handleBulkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;
    const prod = b2bProducts.find((p) => p.id === (selectedProdId || b2bProducts[0]?.id));
    if (!prod || !deliveryAddress.trim()) return;

    setBusy(true);
    setMsg('');
    const orderId = makeId('bord');
    const orderNumber = `B2B-${Date.now().toString().slice(-6)}`;
    const totalTzs = prod.priceTzs * qtyUnits;
    const isOwner = business.ownerId === user.uid;

    try {
      await setDoc(doc(db, 'business_orders', orderId), {
        orderNumber,
        businessId: business.id,
        ownerId: business.ownerId,
        requesterId: user.uid,
        requesterName: user.fullName,
        productSummary: `${qtyUnits}x ${lang === 'sw' ? prod.nameSw : prod.nameEn}`,
        quantityUnits: qtyUnits,
        totalTzs,
        approvalStatus: isOwner ? 'approved' : 'pending_approval',
        deliveryStatus: 'pending',
        deliveryAddress: deliveryAddress.trim().slice(0, 240),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const invId = makeId('inv');
      const taxTzs = Math.round(totalTzs * 0.18);
      const dueDate = new Date(
        Date.now() + (business.paymentTermsDays || 30) * 86_400_000
      )
        .toISOString()
        .slice(0, 10);

      await setDoc(doc(db, 'invoices', invId), {
        invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
        businessId: business.id,
        ownerId: business.ownerId,
        orderId: orderNumber,
        amountTzs: totalTzs,
        taxTzs,
        totalTzs: totalTzs + taxTzs,
        dueDate,
        status: 'unpaid',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setDeliveryAddress('');
      setMsg(
        lang === 'sw'
          ? `Oda ${orderNumber} na Ankara vimeundwa!`
          : `Bulk order ${orderNumber} and tax invoice generated!`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `business_orders/${orderId}`);
    } finally {
      setBusy(false);
    }
  };

  const handleOrderApproval = async (
    orderId: string,
    decision: 'approved' | 'rejected'
  ) => {
    try {
      await updateDoc(doc(db, 'business_orders', orderId), {
        approvalStatus: decision,
        deliveryStatus: decision === 'approved' ? 'scheduled' : 'cancelled',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `business_orders/${orderId}`);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business || !memberForm.fullName.trim() || !memberForm.email.trim()) return;
    const memberId = makeId('bm');
    try {
      await setDoc(doc(db, 'business_members', memberId), {
        businessId: business.id,
        ownerId: business.ownerId,
        userId: '',
        email: memberForm.email.trim(),
        fullName: memberForm.fullName.trim(),
        memberRole: memberForm.memberRole,
        status: 'active',
        createdAt: serverTimestamp(),
      });
      setMemberForm({ fullName: '', email: '', memberRole: 'buyer' });
      setMsg(
        lang === 'sw' ? 'Mfanyakazi ameongezwa.' : 'Team member added.'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `business_members/${memberId}`);
    }
  };

  if (!business) {
    return (
      <div className="max-w-2xl mx-auto space-y-3.5 sm:space-y-5">
        <div className="rounded-2xl bg-[#08291A] text-white p-4 sm:p-6">
          <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-[#F5B800] shrink-0" />
            {t(lang, 'businessPortal')}
          </h1>
          <p className="text-xs sm:text-sm text-emerald-100/80 mt-1">
            {lang === 'sw'
              ? 'Sajili kampuni au taasisi yako kupata mafuta ya jumla, vilainishi na ankara za mikopo.'
              : 'Register your company or institution for bulk fuel supply, lubricants, and B2B invoicing.'}
          </p>
        </div>

        <form
          onSubmit={handleRegisterBusiness}
          className="rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6 space-y-3.5 sm:space-y-4"
        >
          <h2 className="font-display font-bold text-base sm:text-lg text-neutral-900 dark:text-white">
            {t(lang, 'registerBusiness')}
          </h2>
          {msg && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">{msg}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">
                {lang === 'sw' ? 'Jina la Kampuni' : 'Company Name'}
              </label>
              <input
                type="text"
                required
                value={regForm.companyName}
                onChange={(e) =>
                  setRegForm({ ...regForm, companyName: e.target.value })
                }
                placeholder="Mfano: Kilimanjaro Logistics Ltd"
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                {lang === 'sw' ? 'Namba ya TIN' : 'TIN Number'}
              </label>
              <input
                type="text"
                required
                value={regForm.tinNumber}
                onChange={(e) =>
                  setRegForm({ ...regForm, tinNumber: e.target.value })
                }
                placeholder="100-200-300"
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                {lang === 'sw' ? 'Barua Pepe ya Biashara' : 'Business Email'}
              </label>
              <input
                type="email"
                required
                value={regForm.contactEmail}
                onChange={(e) =>
                  setRegForm({ ...regForm, contactEmail: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                {lang === 'sw' ? 'Simu ya Mawasiliano' : 'Contact Phone'}
              </label>
              <input
                type="text"
                required
                value={regForm.contactPhone}
                onChange={(e) =>
                  setRegForm({ ...regForm, contactPhone: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              {lang === 'sw' ? 'Sekta' : 'Industry'}
            </label>
            <input
              type="text"
              value={regForm.industry}
              onChange={(e) => setRegForm({ ...regForm, industry: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#0b120e] font-bold text-sm cursor-pointer"
          >
            {busy ? t(lang, 'loading') : t(lang, 'registerBusiness')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 sm:space-y-5">
      <div className="rounded-2xl bg-[#08291A] text-white p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
        <div className="min-w-0">
          <p className="font-mono-num text-xs text-[#F5B800] truncate">
            TIN {business.tinNumber} · {business.approvalStatus.toUpperCase()}
          </p>
          <h1 className="font-display text-xl sm:text-2xl font-bold mt-0.5 truncate">
            {business.companyName}
          </h1>
          <p className="text-xs text-emerald-100/80 mt-0.5 truncate">
            {business.industry} · Terms: Net {business.paymentTermsDays} Days
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full sm:w-auto sm:flex sm:items-center sm:gap-6 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-white/10">
          <div>
            <p className="text-[11px] sm:text-xs opacity-75">Credit Limit</p>
            <p className="font-mono-num text-base sm:text-lg font-bold text-[#F5B800]">
              {formatTzs(business.creditLimitTzs)}
            </p>
          </div>
          <div>
            <p className="text-[11px] sm:text-xs opacity-75">Invoices Due</p>
            <p className="font-mono-num text-base sm:text-lg font-bold">
              {invoices.filter((i) => i.status !== 'paid').length}
            </p>
          </div>
        </div>
      </div>

      {business.approvalStatus !== 'approved' && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200">
          {lang === 'sw'
            ? 'Akaunti yako ya biashara inasubiri idhini ya Admin ili kupata kikomo cha mkopo. Unaweza kuandaa oda za rasimu sasa.'
            : 'Your business account is awaiting Admin verification for corporate credit limits. You can still prepare bulk order requests.'}
        </div>
      )}

      {msg && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-800 dark:text-emerald-200">
          {msg}
        </div>
      )}

      {/* Sub-Navigation */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-200/70 dark:bg-emerald-950/60 w-full sm:w-fit overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          [
            ['overview', lang === 'sw' ? 'Muhtasari' : 'Overview'],
            ['orders', t(lang, 'bulkOrders')],
            ['invoices', t(lang, 'invoices')],
            ['team', t(lang, 'teamMembers')],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 sm:flex-initial px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold text-center whitespace-nowrap shrink-0 cursor-pointer ${
              tab === key
                ? 'bg-white dark:bg-[#121b16] text-neutral-900 dark:text-[#F5B800]'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-6">
          <form
            onSubmit={handleBulkOrder}
            className="min-w-0 rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6 space-y-3.5 sm:space-y-4"
          >
            <h2 className="font-display font-bold text-base sm:text-lg text-neutral-900 dark:text-white">
              {lang === 'sw' ? 'Agiza Mafuta au Vilainishi kwa Jumla' : 'Place Bulk B2B Order'}
            </h2>
            <div>
              <label className="block text-xs font-semibold mb-1">
                {lang === 'sw' ? 'Bidhaa ya Jumla' : 'Bulk Product'}
              </label>
              <select
                value={selectedProdId || b2bProducts[0]?.id || ''}
                onChange={(e) => setSelectedProdId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs"
              >
                {b2bProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {lang === 'sw' ? p.nameSw : p.nameEn} — {formatTzs(p.priceTzs)} / {p.unit}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">
                  {lang === 'sw' ? 'Kiasi (Units)' : 'Quantity'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={qtyUnits}
                  onChange={(e) => setQtyUnits(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  {lang === 'sw' ? 'Eneo la Kufikisha' : 'Site / Depot Address'}
                </label>
                <input
                  type="text"
                  required
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Kurasini Industrial Area"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy || b2bProducts.length === 0}
              className="w-full py-2.5 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#0b120e] font-bold text-xs cursor-pointer"
            >
              {busy ? t(lang, 'loading') : t(lang, 'placeOrder')}
            </button>
          </form>

          <div className="min-w-0 rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6">
            <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white mb-3 sm:mb-4">
              {lang === 'sw' ? 'Takwimu za Oda (K TZS)' : 'Bulk Spend Overview (K TZS)'}
            </h3>
            {chartData.length === 0 ? (
              <p className="text-xs text-neutral-500 py-10 sm:py-14 text-center">
                {lang === 'sw'
                  ? 'Hakuna oda za biashara bado.'
                  : 'No bulk orders recorded yet.'}
              </p>
            ) : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#08291A" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div className="rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6 space-y-3">
          <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white">
            {t(lang, 'bulkOrders')}
          </h3>
          {businessOrders.length === 0 ? (
            <p className="text-xs text-neutral-500 py-6 text-center">{t(lang, 'noResults')}</p>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-emerald-950">
              {businessOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-mono-num text-xs font-bold text-[#08291A] dark:text-[#F5B800]">
                      {ord.orderNumber} · {ord.approvalStatus.toUpperCase()} ·{' '}
                      {ord.deliveryStatus}
                    </p>
                    <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                      {ord.productSummary}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                      {ord.requesterName} · {ord.deliveryAddress}
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <span className="font-mono-num text-sm font-bold">
                      {formatTzs(ord.totalTzs)}
                    </span>
                    {ord.approvalStatus === 'pending_approval' &&
                      business.ownerId === user.uid && (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOrderApproval(ord.id, 'approved')}
                            className="p-1.5 rounded-lg bg-emerald-700 text-white cursor-pointer"
                            title="Approve"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOrderApproval(ord.id, 'rejected')}
                            className="p-1.5 rounded-lg bg-red-600 text-white cursor-pointer"
                            title="Reject"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'invoices' && (
        <div className="rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#F5B800]" />
              {t(lang, 'invoices')}
            </h3>
            {invoices.length > 0 && (
              <button
                type="button"
                onClick={() => downloadBusinessStatementPdf(business, invoices)}
                className="px-3.5 py-2 rounded-xl bg-[#08291A] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-[#F5B800]" />
                {lang === 'sw' ? 'Pakua Taarifa (PDF)' : 'Statement PDF'}
              </button>
            )}
          </div>
          {invoices.length === 0 ? (
            <p className="text-xs text-neutral-500 py-6 text-center">{t(lang, 'noResults')}</p>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-emerald-950">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-mono-num text-xs font-bold">
                      {inv.invoiceNumber} · {inv.status.toUpperCase()}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                      Order {inv.orderId} · Due {inv.dueDate} ·{' '}
                      {formatTimestamp(inv.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <span className="font-mono-num text-sm font-bold">
                      {formatTzs(inv.totalTzs)}
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadInvoicePdf(inv, business)}
                      className="px-3 py-1.5 rounded-lg bg-[#F5B800] text-[#0b120e] text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'team' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-6">
          <form
            onSubmit={handleAddMember}
            className="min-w-0 rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6 space-y-3"
          >
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#F5B800]" />
              {lang === 'sw' ? 'Ongeza Mfanyakazi' : 'Add Employee Member'}
            </h3>
            <input
              type="text"
              required
              value={memberForm.fullName}
              onChange={(e) =>
                setMemberForm({ ...memberForm, fullName: e.target.value })
              }
              placeholder={lang === 'sw' ? 'Jina Kamili' : 'Full Name'}
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs"
            />
            <input
              type="email"
              required
              value={memberForm.email}
              onChange={(e) =>
                setMemberForm({ ...memberForm, email: e.target.value })
              }
              placeholder="employee@company.tz"
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs"
            />
            <select
              value={memberForm.memberRole}
              onChange={(e) =>
                setMemberForm({
                  ...memberForm,
                  memberRole: e.target.value as 'approver' | 'buyer',
                })
              }
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs"
            >
              <option value="buyer">Buyer (Can Request Orders)</option>
              <option value="approver">Approver (Can Approve Orders)</option>
            </select>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#08291A] text-white text-xs font-semibold cursor-pointer"
            >
              {t(lang, 'save')}
            </button>
          </form>

          <div className="min-w-0 rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-4 sm:p-6">
            <h3 className="font-display font-bold text-base flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-[#F5B800]" />
              {t(lang, 'teamMembers')}
            </h3>
            {members.length === 0 ? (
              <p className="text-xs text-neutral-500 py-5 text-center">
                {lang === 'sw'
                  ? 'Hakuna wafanyakazi wengine walioongezwa.'
                  : 'No additional employees added yet.'}
              </p>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-emerald-950">
                {members.map((m) => (
                  <div key={m.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900 dark:text-white truncate">
                        {m.fullName}
                      </p>
                      <p className="text-neutral-500 truncate">{m.email}</p>
                    </div>
                    <span className="font-mono-num uppercase text-[#08291A] dark:text-[#F5B800] font-semibold shrink-0">
                      {m.memberRole}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
