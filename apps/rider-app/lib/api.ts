"use client";

import type { OrderStatus } from "@happy-tirana/shared-types";
import {
  clearRiderSession,
  getRiderSession,
  saveRiderSession,
  type RiderSession,
} from "./rider-session";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const apiTimeoutMs = 12_000;

export class RiderApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string) {
    super(code);
    this.name = "RiderApiError";
    this.code = code;
    this.status = status;
  }
}

export interface RiderOrder {
  id: string;
  code: string;
  status: OrderStatus;
  businessName: string;
  businessPhone: string | null;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  customerName: string | null;
  customerPhone: string | null;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  productDescription: string;
  productValue: number;
  transportFee: number;
  platformCommission: number;
  riderEarning: number;
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
  createdAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  offerExpiresAt?: string;
}

export interface RiderMetrics {
  todayDeliveries: number;
  weekDeliveries: number;
  todayTransport: number;
  todayEarnings: number;
  weekEarnings: number;
  platformDue: number;
}

export interface RiderDashboard {
  rider: RiderSession & {
    isOnline: boolean;
    status: string;
    lastSeenAt: string | null;
    platformDue: number;
    debitLimitAll: number;
    isDebitBlocked: boolean;
  };
  activeOrder: RiderOrder | null;
  activeOrders: RiderOrder[];
  pendingOffers: RiderOrder[];
  recentOrders: RiderOrder[];
  metrics: RiderMetrics;
}

export interface RoutePoint {
  lat: number;
  lng: number;
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

async function riderFetch<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  const session = getRiderSession();
  if (session) headers.set("x-rider-id", session.id);

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
      throw new RiderApiError(response.status, code);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new RiderApiError(408, "RIDER_API_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function loginRider(input: { email: string; password: string }) {
  const data = await riderFetch<{ rider: RiderSession }>("/riders/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  saveRiderSession(data.rider);
  return data.rider;
}

export async function getRiderDashboard() {
  const session = getRiderSession();
  if (!session) throw new RiderApiError(401, "RIDER_LOGIN_REQUIRED");
  if (
    typeof session.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      session.id,
    )
  ) {
    clearRiderSession();
    throw new RiderApiError(401, "RIDER_SESSION_EXPIRED");
  }
  try {
    return await riderFetch<RiderDashboard>(`/riders/${session.id}/dashboard`);
  } catch (error) {
    if (
      error instanceof RiderApiError &&
      error.status === 404 &&
      error.code === "RIDER_NOT_FOUND"
    ) {
      clearRiderSession();
      throw new RiderApiError(401, "RIDER_SESSION_EXPIRED");
    }
    throw error;
  }
}

export async function setRiderAvailability(
  isOnline: boolean,
  location?: RoutePoint,
) {
  const session = getRiderSession();
  if (!session) throw new RiderApiError(401, "RIDER_LOGIN_REQUIRED");
  return riderFetch<RiderDashboard>(`/riders/${session.id}/availability`, {
    method: "POST",
    body: JSON.stringify({ isOnline, ...location }),
  });
}

export async function acceptOrder(orderId: string) {
  const session = getRiderSession();
  if (!session) throw new RiderApiError(401, "RIDER_LOGIN_REQUIRED");
  return riderFetch<RiderOrder>(`/orders/${orderId}/accept`, {
    method: "POST",
    body: JSON.stringify({ riderId: session.id }),
  });
}

export async function rejectOrder(orderId: string) {
  const session = getRiderSession();
  if (!session) throw new RiderApiError(401, "RIDER_LOGIN_REQUIRED");
  return riderFetch<{ ok: true }>(`/orders/${orderId}/reject`, {
    method: "POST",
    body: JSON.stringify({ riderId: session.id }),
  });
}

export async function updateOrderStatus(
  orderId: string,
  status: "PICKED_UP" | "DELIVERED" | "CANCELLED",
) {
  const session = getRiderSession();
  if (!session) throw new RiderApiError(401, "RIDER_LOGIN_REQUIRED");
  return riderFetch<RiderOrder>(`/riders/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ riderId: session.id, status }),
  });
}

export async function sendRiderLocation(
  input: RoutePoint & {
    orderId?: string | null;
    speed?: number;
    heading?: number;
  },
) {
  const session = getRiderSession();
  if (!session) throw new RiderApiError(401, "RIDER_LOGIN_REQUIRED");
  return riderFetch<{ ok: true }>("/riders/me/location", {
    method: "POST",
    body: JSON.stringify({
      riderId: session.id,
      orderId: input.orderId ?? null,
      lat: input.lat,
      lng: input.lng,
      speed: input.speed,
      heading: input.heading,
    }),
  });
}

export async function reverseAddress(input: RoutePoint) {
  const params = new URLSearchParams({
    lat: String(input.lat),
    lng: String(input.lng),
  });
  return riderFetch<{ address: AddressSuggestion | null }>(
    `/public/addresses/reverse?${params}`,
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
  return riderFetch<{
    durationSeconds: number;
    distanceMeters: number;
    coordinates: RoutePoint[];
  }>(`/public/routes?${params}`);
}

export function logoutRider() {
  clearRiderSession();
}

export function formatLek(value: number) {
  return (
    new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 0 }).format(value) +
    " ALL"
  );
}

export interface RiderStop extends RoutePoint {
  orderId: string;
  code: string;
  kind: "pickup" | "dropoff";
  title: string;
  address: string;
}
export interface RiderItinerary {
  stops: RiderStop[];
  coordinates: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
}
export async function getRiderItinerary(origin: RoutePoint) {
  const session = getRiderSession();
  if (!session) throw new RiderApiError(401, "RIDER_LOGIN_REQUIRED");
  return riderFetch<RiderItinerary>(`/riders/${session.id}/itinerary`, {
    method: "POST",
    body: JSON.stringify(origin),
  });
}
