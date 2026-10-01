"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { getRiderSession } from "../lib/rider-session";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function RiderLiveNotifications() {
  const pathname = usePathname();
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const session = getRiderSession();
    if (!session || pathname === "/login") return;
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? apiBaseUrl.replace(/\/api\/?$/, ""));
    const refresh = () => window.dispatchEvent(new Event("rider-order-update"));
    socket.on("connect", () => socket.emit("rider.join", session.token, (joined: boolean) => {
      if (joined) refresh();
    }));
    socket.on("order.offered", (payload?: { message?: string; distanceMeters?: number | null }) => {
      const distance = typeof payload?.distanceMeters === "number"
        ? ` Afërsisht ${Math.round(payload.distanceMeters)} m nga biznesi.` : "";
      const message = `${payload?.message ?? "Ke një ofertë të re porosie."}${distance}`;
      setNotice(message);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Happy Tirana Courier", { body: message });
      }
      refresh();
    });
    socket.on("order.accepted", refresh);
    socket.on("order.status_changed", refresh);
    return () => { socket.disconnect(); };
  }, [pathname]);

  if (!notice) return null;
  return <div role="status" className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg rounded-xl border border-orange-300 bg-white p-4 text-slate-950 shadow-xl">
    <strong>Porosi e re</strong><p className="mt-1">{notice}</p>
    <button type="button" className="mt-2 text-orange-700 underline" onClick={() => setNotice("")}>Mbyll</button>
  </div>;
}
