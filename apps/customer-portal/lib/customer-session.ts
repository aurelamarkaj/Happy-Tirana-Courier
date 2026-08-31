export interface CustomerProfile {
  id?: string;
  name: string;
  phone: string;
  email: string;
  defaultAddress: string;
  defaultLat?: number;
  defaultLng?: number;
}

export const emptyCustomerProfile: CustomerProfile = {
  name: "",
  phone: "",
  email: "",
  defaultAddress: "Rruga Abdyl Frasheri, Tirane"
};

const customerIdKey = "happy-tirana-customer-id";
const guestCartIdKey = "happy-tirana-guest-cart-id";

export function getCustomerProfile(): CustomerProfile {
  if (typeof window === "undefined") return emptyCustomerProfile;

  const id = window.localStorage.getItem(customerIdKey) ?? undefined;
  return { ...emptyCustomerProfile, id };
}

export function saveCustomerProfile(profile: CustomerProfile) {
  if (profile.id) window.localStorage.setItem(customerIdKey, profile.id);
}

export function clearCustomerProfile() {
  window.localStorage.removeItem(customerIdKey);
}

export function getCustomerId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(customerIdKey);
}

export function getGuestCartId() {
  if (typeof window === "undefined") return null;

  const existing = window.localStorage.getItem(guestCartIdKey);
  if (existing) return existing;

  const generated = window.crypto?.randomUUID?.() ?? `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(guestCartIdKey, generated);
  return generated;
}

export function clearGuestCartId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(guestCartIdKey);
}
