import { clearGuestCartId, getCustomerId, getGuestCartId, saveCustomerProfile, type CustomerProfile } from "./customer-session";
import type { AddressSuggestion } from "./addresses";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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

export interface CartLine {
  productId: string;
  quantity: number;
  name: string;
  price: number;
  imageUrl: string | null;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const customerId = getCustomerId();
  const guestCartId = customerId ? null : getGuestCartId();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (customerId) headers.set("x-customer-id", customerId);
  if (guestCartId) headers.set("x-guest-cart-id", guestCartId);

  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
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
}

export async function signupCustomer(input: CustomerProfile & { password: string }) {
  const data = await apiFetch<{ customer: CustomerProfile }>("/public/auth/signup", {
    method: "POST",
    body: JSON.stringify(input)
  });
  saveCustomerProfile(data.customer);
  clearGuestCartId();
  return data.customer;
}

export async function loginCustomer(input: { phone: string; password: string }) {
  const data = await apiFetch<{ customer: CustomerProfile }>("/public/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
  saveCustomerProfile(data.customer);
  clearGuestCartId();
  return data.customer;
}

export async function getMe() {
  const data = await apiFetch<{ customer: CustomerProfile }>("/public/me");
  saveCustomerProfile(data.customer);
  return data.customer;
}

export async function updateMe(input: CustomerProfile) {
  const data = await apiFetch<{ customer: CustomerProfile }>("/public/me", {
    method: "PATCH",
    body: JSON.stringify(input)
  });
  saveCustomerProfile(data.customer);
  return data.customer;
}

export async function setCartItem(input: { businessId: string; productId: string; quantity: number }) {
  return apiFetch<{ ok: true }>("/public/cart/items", {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export async function getCart() {
  return apiFetch<{ business_id: string | null; items: CartLine[] }>("/public/cart");
}

export async function clearCart() {
  return apiFetch<{ ok: true }>("/public/cart/clear", { method: "POST", body: "{}" });
}

export async function createOrderFromCart(input: { businessId: string; addressText: string; customerName?: string; customerPhone?: string; lat?: number; lng?: number }) {
  const cart = await getCart();
  const items = cart.items.map((item) => ({ productId: item.productId, quantity: item.quantity }));
  const lat = Number(input.lat);
  const lng = Number(input.lng);

  if (items.length === 0) throw new Error("CART_EMPTY");

  return apiFetch<{ id: string; code: string }>("/public/orders", {
    method: "POST",
    body: JSON.stringify({
      businessId: input.businessId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      addressText: input.addressText,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      items
    })
  });
}

export async function getOrderHistory() {
  return apiFetch<{ orders: Array<Record<string, unknown>> }>("/public/me/orders");
}

export async function searchAddresses(query: string) {
  return apiFetch<{ suggestions: AddressSuggestion[] }>(`/public/addresses/search?q=${encodeURIComponent(query)}`);
}

export async function reverseAddress(lat: number, lng: number) {
  return apiFetch<{ address: AddressSuggestion | null }>(`/public/addresses/reverse?lat=${lat}&lng=${lng}`);
}

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface TrackOrder {
  id: string;
  code: string;
  status: string;
  total_amount: string | number;
  created_at: string;
  business_name: string;
  pickup_lat: string | number;
  pickup_lng: string | number;
  delivery_address: string;
  dropoff_lat: string | number;
  dropoff_lng: string | number;
}

export async function getRoute(input: { fromLat: number; fromLng: number; toLat: number; toLng: number }) {
  const params = new URLSearchParams({
    fromLat: String(input.fromLat),
    fromLng: String(input.fromLng),
    toLat: String(input.toLat),
    toLng: String(input.toLng)
  });
  return apiFetch<{ durationSeconds: number; distanceMeters: number; coordinates: RoutePoint[] }>(`/public/routes?${params}`);
}

export async function getOrderTrack(code: string) {
  return apiFetch<{ order: TrackOrder }>(`/public/orders/${encodeURIComponent(code)}/track`);
}
