"use client";

const adminStorageKey = "happy-tirana-admin-session-v1";

export interface AdminSession {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
}

export function getAdminSession() {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(adminStorageKey);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as AdminSession;
    return session.id && session.email ? session : null;
  } catch {
    return null;
  }
}

export function saveAdminSession(session: AdminSession) {
  window.localStorage.setItem(adminStorageKey, JSON.stringify(session));
}

export function clearAdminSession() {
  window.localStorage.removeItem(adminStorageKey);
}
