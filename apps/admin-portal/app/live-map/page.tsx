"use client";

import { Bike, MapPin, RadioTower, Route } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdminLiveMap } from "../../components/admin-map";
import { AdminMetric, AdminShell } from "../../components/admin-shell";
import {
  getAdminLiveMap,
  type AdminLiveOrder,
  type AdminRider,
} from "../../lib/api";

export default function LiveMapPage() {
  const [riders, setRiders] = useState<AdminRider[]>([]);
  const [orders, setOrders] = useState<AdminLiveOrder[]>([]);
  const [message, setMessage] = useState("");

  async function loadLiveMap() {
    try {
      const data = await getAdminLiveMap();
      setRiders(data.riders);
      setOrders(data.orders);
      setMessage("");
    } catch {
      setMessage("Harta nuk u ngarkua. Kontrollo lidhjen me internetin dhe provo përsëri.");
    }
  }

  useEffect(() => {
    void loadLiveMap();
    const interval = window.setInterval(() => void loadLiveMap(), 8000);
    return () => window.clearInterval(interval);
  }, []);

  const events = useMemo(() => {
    const orderEvents = orders
      .slice(0, 4)
      .map(
        (order) => `${order.code} · ${order.status} · ${order.businessName}`,
      );
    const riderEvents = riders
      .slice(0, 3)
      .map(
        (rider) => `${rider.name} · ${rider.isOnline ? "Online" : "Offline"}`,
      );
    return [...orderEvents, ...riderEvents];
  }, [orders, riders]);

  return (
    <AdminShell
      description="Ndiq motoristët online, porositë aktive dhe përditësimet e dorëzimeve në kohë reale."
      eyebrow="Realtime"
      title="Harta live"
    >
      <section className="grid gap-3 md:grid-cols-3">
        <AdminMetric icon={RadioTower} label="Refresh" value="8 sek" />
        <AdminMetric
          icon={Bike}
          label="Motoriste live"
          value={String(riders.filter((rider) => rider.isOnline).length)}
        />
        <AdminMetric
          icon={Route}
          label="Porosi aktive"
          value={String(orders.length)}
        />
      </section>

      {message ? (
        <p className="type-warning rounded-2xl border border-happy-orange/40 bg-happy-orange/10 p-4 text-happy-orange">
          {message}
        </p>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="admin-panel rounded-3xl border p-5 shadow-happy">
          <h2 className="type-section-title">Evente</h2>
          <div className="mt-4 space-y-3">
            {events.length ? (
              events.map((item) => (
                <div className="admin-soft rounded-2xl border p-4" key={item}>
                  <p className="type-body">{item}</p>
                  <p className="type-secondary mt-1 text-white/45">
                    Përditësim i porosisë
                  </p>
                </div>
              ))
            ) : (
              <div className="admin-soft rounded-2xl border p-4 text-white/55">
                <MapPin className="h-5 w-5 text-happy-orange" />
                <p className="type-body mt-2">
                  Nuk ka porosi aktive ose GPS te fundit.
                </p>
              </div>
            )}
          </div>
        </aside>

        <section className="admin-panel min-h-[420px] overflow-hidden rounded-3xl border p-4 shadow-happy sm:min-h-[560px]">
          <AdminLiveMap orders={orders} riders={riders.filter((rider) => rider.isOnline)} />
        </section>
      </section>
    </AdminShell>
  );
}
