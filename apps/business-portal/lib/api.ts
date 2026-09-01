"use client";

import {
  clearBusinessSession,
  getBusinessSession,
  saveBusinessSession,
  type BusinessSession,
} from "./business-session";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export interface BusinessProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  section: string | null;
  isAvailable: boolean;
}

export interface BusinessCategory {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  productCount: number;
}

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

export interface BusinessDashboard {
  business: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    addressText: string;
    category: string;
    rating: number;
    etaMinutes: number;
    coverImageUrl: string | null;
    description: string | null;
    status: string;
  };
  categories: BusinessCategory[];
  products: BusinessProduct[];
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
  return businessFetch<BusinessDashboard>(
    `/businesses/${businessId}/dashboard`,
  );
}

export async function createBusinessOrder(
  input: {
    customerName: string;
    customerPhone: string;
    addressText: string;
    lat: number;
    lng: number;
    productDescription?: string;
    productValue?: number;
    items?: Array<{ productId: string; quantity: number }>;
  },
  businessId = activeBusinessId(),
) {
  return businessFetch<{
    order: BusinessOrder;
    offeredRiders: Array<{
      id: string;
      name: string;
      distanceMeters: number | null;
    }>;
  }>(`/businesses/${businessId}/orders`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function searchAddresses(query: string) {
  const params = new URLSearchParams({ q: query });
  return businessFetch<{ suggestions: AddressSuggestion[] }>(
    `/public/addresses/search?${params}`,
  );
}

export async function addBusinessProduct(
  input: {
    name: string;
    description: string;
    price: number;
    section: string;
    imageUrl?: string;
  },
  businessId = activeBusinessId(),
) {
  return businessFetch<{ product: BusinessProduct }>(
    `/businesses/${businessId}/products`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function addBusinessCategory(
  input: { name: string; sortOrder?: number },
  businessId = activeBusinessId(),
) {
  return businessFetch<{ category: BusinessCategory }>(
    `/businesses/${businessId}/categories`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function editBusinessCategory(
  categoryId: string,
  input: { name: string; sortOrder?: number },
  businessId = activeBusinessId(),
) {
  return businessFetch<{ category: BusinessCategory }>(
    `/businesses/${businessId}/categories/${categoryId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function removeBusinessCategory(
  categoryId: string,
  businessId = activeBusinessId(),
) {
  return businessFetch<{ ok: true }>(
    `/businesses/${businessId}/categories/${categoryId}`,
    {
      method: "DELETE",
    },
  );
}

export async function editBusinessProduct(
  productId: string,
  input: {
    name: string;
    description: string;
    price: number;
    section: string;
    imageUrl?: string;
  },
  businessId = activeBusinessId(),
) {
  return businessFetch<{ product: BusinessProduct }>(
    `/businesses/${businessId}/products/${productId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function removeBusinessProduct(
  productId: string,
  businessId = activeBusinessId(),
) {
  return businessFetch<{ ok: true }>(
    `/businesses/${businessId}/products/${productId}`,
    {
      method: "DELETE",
    },
  );
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
    new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 0 }).format(value) +
    " ALL"
  );
}
