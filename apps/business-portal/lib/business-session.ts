"use client";

const businessStorageKey = "happy-tirana-business-session-v1";

export interface BusinessSession {
  id: string;
  userId: string;
  name: string;
  legalName: string | null;
  phone: string;
  email: string | null;
  status: string;
  userName: string;
}

export function getBusinessSession() {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(businessStorageKey);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as BusinessSession;
    return session.id ? session : null;
  } catch {
    return null;
  }
}

export function saveBusinessSession(session: BusinessSession) {
  window.localStorage.setItem(businessStorageKey, JSON.stringify(session));
}

export function clearBusinessSession() {
  window.localStorage.removeItem(businessStorageKey);
}
