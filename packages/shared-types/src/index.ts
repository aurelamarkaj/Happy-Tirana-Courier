export type UserRole = "ADMIN" | "OPERATOR" | "BUSINESS" | "RIDER";
export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type OrderStatus = "CREATED" | "OFFERED" | "ACCEPTED" | "PICKED_UP" | "DELIVERED" | "CANCELLED";
export type OfferStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "EXPIRED";
export type SettlementStatus = "DRAFT" | "OPEN" | "PAID" | "VOID";
export type BusinessCategory = "FOOD" | "MARKET" | "PHARMACY" | "DOCUMENTS" | "OTHER";

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
}

export interface Zone {
  id: string;
  name: string;
  city: "Tirana";
  transportFee: number;
  active: boolean;
}

export interface CatalogBusiness {
  id: string;
  name: string;
  category: BusinessCategory;
  addressText: string;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  etaMinutes: number | null;
  active: boolean;
}

export interface Product {
  id: string;
  businessId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface CustomerCheckoutRequest {
  businessId: string;
  customerName?: string;
  customerPhone: string;
  addressText: string;
  lat: number;
  lng: number;
  items: CartItem[];
}

export interface Order {
  id: string;
  code: string;
  businessId: string;
  customerId: string | null;
  deliveryAddressId: string;
  zoneId: string;
  assignedRiderId: string | null;
  productDescription: string;
  productValue: number;
  transportFee: number;
  totalAmount: number;
  platformCommission: number;
  riderEarning: number;
  status: OrderStatus;
}

export interface RiderLocation {
  riderId: string;
  orderId: string | null;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  recordedAt: string;
}

export interface RealtimeEvents {
  "order.created": Order;
  "order.offered": { orderId: string; riderIds: string[]; expiresAt: string };
  "order.accepted": { orderId: string; riderId: string };
  "order.status_changed": { orderId: string; status: OrderStatus };
  "rider.location_updated": RiderLocation;
  "settlement.created": { settlementId: string; riderId: string; platformDue: number };
}
