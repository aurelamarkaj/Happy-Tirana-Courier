"use client";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { getAdminSession } from "../lib/admin-session";
const api = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
type Notice = { id: string; type: string; payload: { message?: string; code?: string; platformDue?: number } };
export function OperationalNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const [notifications, window] = await Promise.all([
          fetch(`${api}/admin/notifications`, { headers: { Authorization: `Bearer ${getAdminSession()?.token ?? ""}` } }).then(r => r.ok ? r.json() : Promise.reject()),
          fetch(`${api}/businesses/order-window`).then(r => r.json()),
        ]);
        if (alive) { setNotices(notifications.notifications); setClosed(!window.isOpen); }
      } catch { /* Keep already received alerts visible during reconnect. */ }
    }
    void refresh();
    const timer = setInterval(refresh, 15000);
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? api.replace(/\/api\/?$/, ""));
    socket.on("connect", () => { socket.emit("admin.join", getAdminSession()?.token); void refresh(); });
    socket.on("admin.alert", refresh);
    socket.on("order.accepted", refresh);
    socket.on("order.status_changed", refresh);
    return () => { alive=false; clearInterval(timer); socket.disconnect(); };
  }, []);
  return <aside aria-live="polite" className="space-y-2">
    {closed && <p className="notice">Orari operacional: çdo ditë, 07:00–22:59.</p>}
    {notices.map(n => <p key={n.id} role="alert" className="notice">
      {n.payload.code ? `${n.payload.code}: ` : ""}
      {n.payload.message ?? (n.type === "RIDER_DEBIT_LIMIT_REACHED" ? `Motoristi arriti limitin e debitit: ${n.payload.platformDue ?? 5000} ALL.` : n.type)}
    </p>)}
  </aside>;
}
