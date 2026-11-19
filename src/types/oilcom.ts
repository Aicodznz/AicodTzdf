export type UserRole = 'customer' | 'business' | 'agent' | 'admin';
export type Language = 'sw' | 'en';
export type ThemeMode = 'light' | 'dark';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

export type PaymentProvider =
  | 'mpesa'
  | 'airtel_money'
  | 'mixx_by_yas'
  | 'bank'
  | 'cod';

export type PaymentStatus = 'pending' | 'successful' | 'failed' | 'refunded';

export interface OilcomUser {
  uid: string;
  fullName: string;
  phone?: string;
  email: string;
  role: UserRole;
  language: Language;
  status: 'active' | 'suspended';
  photoUrl?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CustomerProfile {
  userId: string;
  customerCode: string;
  referralCode: string;
  referredBy?: string;
  vehiclePlate?: string;
  preferredFuel?: 'Petrol' | 'Diesel' | 'LPG' | 'All';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CustomerAddress {
  id: string;
  userId: string;
  label: string;
  street: string;
  city: string;
  region: string;
  isDefault: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Station {
  id: string;
  name: string;
  code: string;
  city: string;
  region: string;
  address: string;
  lat: number;
  lng: number;
  open24Hours: boolean;
  hasGas?: boolean;
  hasFuel?: boolean;
  hasLubricants?: boolean;
  petrolPriceTzs?: number;
  dieselPriceTzs?: number;
  isDemoData?: boolean;
  status: 'active' | 'maintenance' | 'inactive';
}

export interface Product {
  id: string;
  categorySlug: string;
  sku: string;
  nameSw: string;
  nameEn: string;
  descriptionSw?: string;
  descriptionEn?: string;
  unit: string;
  sizeKg?: number;
  priceTzs: number;
  isDemoPlaceholderPrice?: boolean;
  roleScope: 'gas' | 'fuel' | 'business' | 'all';
  active: boolean;
}

export interface RewardsAccount {
  userId: string;
  customerCode: string;
  pointsBalance: number;
  lifetimePoints: number;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Camel VIP';
  updatedAt?: unknown;
}

export interface RewardsTransaction {
  id: string;
  userId: string;
  customerCode: string;
  type: 'earn' | 'redeem_request' | 'redeem_approved' | 'referral_bonus';
  points: number;
  description: string;
  stationId?: string;
  qrNonce?: string;
  status: 'pending' | 'completed' | 'rejected';
  processedBy?: string;
  createdAt?: unknown;
}

export interface Promotion {
  id: string;
  titleSw: string;
  titleEn: string;
  descriptionSw: string;
  descriptionEn: string;
  pointsMultiplier: number;
  minSpendTzs?: number;
  active: boolean;
}

export interface Voucher {
  id: string;
  userId: string;
  promoCode: string;
  title: string;
  pointsCost: number;
  discountTzs: number;
  status: 'pending_approval' | 'active' | 'used' | 'expired';
  createdAt?: unknown;
}

export interface GasOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  agentId?: string;
  stationId?: string;
  orderKind: 'gas' | 'fuel';
  fulfillmentType: 'delivery' | 'pickup';
  deliveryAddress: string;
  itemsSummary: string;
  itemsCount: number;
  totalTzs: number;
  paymentMethod: PaymentProvider;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  cancelReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BusinessAccount {
  id: string;
  ownerId: string;
  companyName: string;
  tinNumber: string;
  contactEmail: string;
  contactPhone: string;
  industry?: string;
  creditLimitTzs: number;
  creditUsedTzs: number;
  paymentTermsDays: number;
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'suspended';
  createdAt?: unknown;
}

export interface BusinessMember {
  id: string;
  businessId: string;
  ownerId: string;
  userId?: string;
  email: string;
  fullName: string;
  memberRole: 'owner' | 'approver' | 'buyer';
  status: 'active' | 'inactive';
}

export interface BusinessOrder {
  id: string;
  orderNumber: string;
  businessId: string;
  ownerId: string;
  requesterId: string;
  requesterName: string;
  productSummary: string;
  quantityUnits: number;
  totalTzs: number;
  approvalStatus: 'pending_approval' | 'approved' | 'rejected';
  deliveryStatus: 'pending' | 'scheduled' | 'dispatched' | 'delivered' | 'cancelled';
  deliveryAddress: string;
  createdAt?: unknown;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  businessId: string;
  ownerId: string;
  orderId: string;
  amountTzs: number;
  taxTzs: number;
  totalTzs: number;
  dueDate: string;
  status: 'unpaid' | 'paid' | 'overdue';
  createdAt?: unknown;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  orderType: 'gas' | 'fuel' | 'business' | 'invoice';
  userId: string;
  provider: PaymentProvider;
  amountTzs: number;
  phoneOrRef: string;
  sandboxRef: string;
  mode: 'SANDBOX_TEST';
  status: PaymentStatus;
  callbackVerified: boolean;
  createdAt?: unknown;
}

export interface AgentProfile {
  id: string;
  userId: string;
  businessName: string;
  licenseNumber: string;
  stationId?: string;
  region: string;
  phone: string;
  approvalStatus: 'pending' | 'approved' | 'suspended';
  commissionRatePct: number;
  totalSalesTzs: number;
  totalCommissionTzs: number;
}

export interface AgentInventoryItem {
  id: string;
  agentUid: string;
  productId: string;
  productName: string;
  cylinderSizeKg?: number;
  quantityOnHand: number;
  reorderLevel: number;
}

export interface StockMovement {
  id: string;
  agentUid: string;
  productId: string;
  productName: string;
  type: 'restock' | 'sale' | 'adjustment' | 'return';
  quantityDelta: number;
  note?: string;
  createdAt?: unknown;
}

export interface DeliveryRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  agentUid: string;
  driverName: string;
  driverPhone?: string;
  vehiclePlate?: string;
  status: 'assigned' | 'en_route' | 'arrived' | 'delivered';
  etaMinutes?: number;
  createdAt?: unknown;
}

export interface AppNotification {
  id: string;
  userId: string;
  titleSw: string;
  titleEn: string;
  bodySw: string;
  bodyEn: string;
  category: 'order' | 'rewards' | 'business' | 'agent' | 'system';
  read: boolean;
  createdAt?: unknown;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorEmail?: string;
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
  createdAt?: unknown;
}

export interface SystemSettings {
  pointsPer1000Tzs: number;
  pointRedemptionValueTzs: number;
  gasCancelWindowMinutes: number;
  sandboxModeEnabled: boolean;
  supportPhone?: string;
  supportEmail?: string;
}

export type AppRoute =
  | 'home'
  | 'fuel'
  | 'gas'
  | 'rewards'
  | 'business'
  | 'orders'
  | 'stations'
  | 'agent'
  | 'admin'
  | 'profile';
