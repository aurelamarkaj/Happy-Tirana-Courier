"use client";

const riderStorageKey = "happy-tirana-rider-session-v1";

export interface RiderSession {
  token: string;
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  vehicleType: string;
  licenseNumber: string | null;
}

export function getRiderSession() {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(riderStorageKey);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as RiderSession;
    return session.id && session.token ? session : null;
  } catch {
    return null;
  }
}

export function saveRiderSession(session: RiderSession) {
  window.localStorage.setItem(riderStorageKey, JSON.stringify(session));
}

export function clearRiderSession() {
  window.localStorage.removeItem(riderStorageKey);
}
