"use client";

import {
  clearBusinessSession,
  getBusinessSession,
  saveBusinessSession,
  type BusinessSession,
} from "./business-session";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export interface BusinessOrder {
  id: string;
  code: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string;
  productDescription: string;
  productValue: number;
  transportFee: number;
  totalAmount: number;
  readyMinutes: number;
  routeDistanceMeters?: number;
  routeDistanceSource?: string;
  routePreference?: string;
  googleMapsUrl?: string | null;
  calculatedTransportFee?: number;
  transportFeeOverridden: boolean;
  ringSurchargeApplied: boolean;
  ringSurchargeFee: number;
  riderEarning: number;
  platformCommission: number;
  riderName: string | null;
  offeredRiderCount: number;
  createdAt: string;
}

export interface AddressSuggestion {
  id: string;
  label: string;
  area: string;
  city: string;
  details: string;
  lat: number;
  lng: number;
}

export interface BusinessOrderQuote {
  zoneId: string;
  zoneName: string;
  lat: number;
  lng: number;
  addressText: string;
  distanceMeters: number;
  baseFee: number;
  extraDistanceFee: number;
  distanceKm: number;
  distanceSource: string;
  calculatedTransportFee: number;
  finalTransportFee: number;
  transportFeeOverridden: boolean;
  ringSurchargeApplied: boolean;
  ringSurchargeFee: number;
  routePreference: string;
  googleMapsUrl: string | null;
}

export interface BusinessDashboard {
  business: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    addressText: string;
    lat: number;
    lng: number;
    category: string;
    rating: number;
    etaMinutes: number;
    coverImageUrl: string | null;
    description: string | null;
    status: string;
  };
  orders: BusinessOrder[];
  metrics: {
    pendingOrders: number;
    activeOrders: number;
    deliveredToday: number;
    productRevenueToday: number;
    totalCollectedToday: number;
  };
}

export class BusinessApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string) {
    super(code);
    this.name = "BusinessApiError";
    this.code = code;
    this.status = status;
  }
}

async function businessFetch<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getBusinessSession()?.token;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.text();
    let code = body;
    try {
      code = (JSON.parse(body) as { error?: string }).error ?? body;
    } catch {
      code = body;
    }
    throw new BusinessApiError(response.status, code);
  }

  return response.json() as Promise<T>;
}

function activeBusinessId() {
  const session = getBusinessSession();
  if (!session) throw new BusinessApiError(401, "BUSINESS_LOGIN_REQUIRED");
  return session.id;
}

export async function loginBusiness(input: {
  email: string;
  password: string;
}) {
  const data = await businessFetch<{ business: BusinessSession }>(
    "/businesses/auth/login",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  saveBusinessSession(data.business);
  return data.business;
}

export function logoutBusiness() {
  clearBusinessSession();
}

export async function getBusinessDashboard(businessId = activeBusinessId()) {
  if (
    typeof businessId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      businessId,
    )
  ) {
    clearBusinessSession();
    throw new BusinessApiError(401, "BUSINESS_SESSION_EXPIRED");
  }
  try {
    return await businessFetch<BusinessDashboard>(
      `/businesses/${businessId}/dashboard`,
    );
  } catch (error) {
    if (
      error instanceof BusinessApiError &&
      error.status === 404 &&
      error.code === "BUSINESS_NOT_FOUND"
    ) {
      clearBusinessSession();
      throw new BusinessApiError(401, "BUSINESS_SESSION_EXPIRED");
    }
    throw error;
  }
}

export async function createBusinessOrder(
  input: {
    customerName?: string;
    customerPhone: string;
    addressText?: string;
    lat?: number;
    lng?: number;
    googleMapsUrl: string;
    readyMinutes: number;
    orderValue: number;
    productDescription?: string;
  },
  businessId = activeBusinessId(),
) {
  return businessFetch<{
    order: BusinessOrder;
    offeredRiders: Array<{
      id: string;
      name: string;
      distanceMeters: number | null;
      vehicleType?: string;
    }>;
    dispatchScheduledFor: string;
    quote: BusinessOrderQuote;
  }>(`/businesses/${businessId}/orders`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function quoteBusinessOrder(
  input: {
    addressText?: string;
    lat?: number;
    lng?: number;
    googleMapsUrl: string;
  },
  businessId = activeBusinessId(),
) {
  return businessFetch<{ quote: BusinessOrderQuote }>(
    `/businesses/${businessId}/orders/quote`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function previewBusinessLocation(googleMapsUrl: string, businessId = activeBusinessId()) {
  return businessFetch<{location:{lat:number;lng:number;addressText:string;originalUrl:string}}>(
    `/businesses/${businessId}/orders/location`,
    {method:"POST",body:JSON.stringify({googleMapsUrl})},
  );
}

export async function getOrderingWindow() {
  return businessFetch<{
    isOpen: boolean;
    nextCheckInSeconds: number;
    serverTime: string;
  }>("/businesses/order-window", { cache: "no-store" });
}

export async function searchAddresses(query: string) {
  const params = new URLSearchParams({ q: query });
  return businessFetch<{ suggestions: AddressSuggestion[] }>(
    `/public/addresses/search?${params}`,
  );
}

export async function getRoute(input: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}) {
  const params = new URLSearchParams({
    fromLat: String(input.fromLat),
    fromLng: String(input.fromLng),
    toLat: String(input.toLat),
    toLng: String(input.toLng),
  });
  return businessFetch<{
    durationSeconds: number;
    distanceMeters: number;
    coordinates: Array<{ lat: number; lng: number }>;
  }>(`/public/routes?${params}`);
}

export async function decideBusinessOrder(
  orderId: string,
  action: "CONFIRM" | "REFUSE",
  businessId = activeBusinessId(),
) {
  return businessFetch<{ order: BusinessOrder }>(
    `/businesses/${businessId}/orders/${orderId}/decision`,
    {
      method: "PATCH",
      body: JSON.stringify({ action }),
    },
  );
}

export function formatLek(value: number) {
  return (
    new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 2 }).format(value) +
    " ALL"
  );
}
