const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const apiTimeoutMs = 12_000;

import { saveAdminSession, type AdminSession } from "./admin-session";

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), apiTimeoutMs);

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
      signal: init.signal ?? controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      let code = body;
      try {
        code = (JSON.parse(body) as { error?: string }).error ?? body;
      } catch {
        code = body;
      }
      throw new ApiError(response.status, code);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(408, "ADMIN_API_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface MapPoint {
  lat: number;
  lng: number;
}

export interface AdminBusiness {
  id: string;
  name: string;
  legalName: string | null;
  phone: string;
  email: string | null;
  addressText: string;
  lat?: number;
  lng?: number;
  status: string;
  category: string | null;
  rating: number;
  etaMinutes: number;
  coverImageUrl: string | null;
  description: string | null;
  orderCount: number;
  productCount: number;
}

export interface AdminBusinessCategory {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  businessCount: number;
}

export interface AdminRider {
  id: string;
  userId: string;
  name: string;
  phone: string;
  email: string | null;
  vehicleType: string;
  licenseNumber: string | null;
  isOnline: boolean;
  status: string;
  lastSeenAt: string | null;
  lastLat?: number;
  lastLng?: number;
  platformDue: number;
  debitLimitAll: number;
  isDebitBlocked: boolean;
  deliveriesToday: number;
}

export interface AdminZone {
  id: string;
  name: string;
  city: string;
  transportFee: number;
  isSurchargeArea: boolean;
  surchargeFee: number;
  active: boolean;
  createdAt: string;
  points: MapPoint[];
}

export interface AdminLiveOrder {
  id: string;
  code: string;
  status: string;
  totalAmount: number;
  businessName: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
}

export interface AdminFinance {
  metrics: {
    totalTransportFee: number;
    riderEarnings: number;
    platformCommission: number;
    deliveredOrders: number;
  };
  settlements: Array<{
    riderId: string;
    riderName: string;
    platformDue: number;
    status: string;
  }>;
}

export function formatLek(value: number) {
  return `${value.toLocaleString("sq-AL", { maximumFractionDigits: 2 })} ALL`;
}

export async function getAdminBusinesses() {
  return apiFetch<{ businesses: AdminBusiness[] }>("/admin/businesses");
}

export async function loginAdmin(input: { email: string; password: string }) {
  const data = await apiFetch<{ admin: AdminSession }>("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  saveAdminSession(data.admin);
  return data.admin;
}

export async function createAdminBusiness(input: {
  name: string;
  legalName?: string;
  phone: string;
  email?: string;
  password: string;
  addressText: string;
  lat?: number | null;
  lng?: number | null;
  category?: string;
  status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  etaMinutes?: number;
  coverImageUrl?: string;
  description?: string;
}) {
  return apiFetch<{ business: AdminBusiness }>("/admin/businesses", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getAdminBusinessCategories() {
  return apiFetch<{ categories: AdminBusinessCategory[] }>(
    "/admin/business-categories",
  );
}

export async function createAdminBusinessCategory(input: {
  name: string;
  active?: boolean;
  sortOrder?: number;
}) {
  return apiFetch<{ category: AdminBusinessCategory }>(
    "/admin/business-categories",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function getAdminRiders() {
  return apiFetch<{ riders: AdminRider[] }>("/admin/riders");
}

export async function createAdminRider(input: {
  name: string;
  phone: string;
  email?: string;
  password: string;
  vehicleType?: "MOTORBIKE" | "DIESEL";
  licenseNumber?: string;
  status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
}) {
  return apiFetch<{ rider: AdminRider }>("/admin/riders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getAdminZones() {
  return apiFetch<{ zones: AdminZone[] }>("/admin/zones");
}

export async function createAdminZone(input: {
  name: string;
  city?: string;
  transportFee: number;
  isSurchargeArea?: boolean;
  surchargeFee?: number;
  points: MapPoint[];
}) {
  return apiFetch<{ zone: AdminZone }>("/admin/zones", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAdminZone(
  id: string,
  input: {
    name: string;
    city?: string;
    isSurchargeArea: boolean;
    active: boolean;
    points: MapPoint[];
  },
) {
  return apiFetch<{ zone: AdminZone }>(`/admin/zones/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteAdminZone(id: string) {
  return apiFetch<{ ok: true }>(`/admin/zones/${id}`, {
    method: "DELETE",
  });
}

export async function getAdminLiveMap() {
  return apiFetch<{ riders: AdminRider[]; orders: AdminLiveOrder[] }>(
    "/admin/live-map",
  );
}

export async function getPublicRoute(input: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}) {
  const query = new URLSearchParams(
    Object.entries(input).map(([key, value]) => [key, String(value)]),
  );
  return apiFetch<{
    durationSeconds: number;
    distanceMeters: number;
    coordinates: MapPoint[];
  }>(`/public/routes?${query}`);
}

export async function getAdminFinance() {
  return apiFetch<AdminFinance>("/admin/finance");
}
