"use client";

import { Bike, CheckCircle2, Clock3, PackageCheck, Phone, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getOrderTrack, type TrackOrder } from "../lib/api";
import { formatLek } from "../lib/catalog";
import { CustomerHeader } from "./customer-header";
import { LiveTrackingMap } from "./live-tracking-map";

const statuses = ["CREATED", "OFFERED", "ACCEPTED", "PICKED_UP", "DELIVERED"];

const stepDefinitions = [
  { label: "Porosia u krijua", status: "CREATED", icon: CheckCircle2 },
  { label: "Biznesi po e pergatit", status: "OFFERED", icon: Clock3 },
  { label: "Motoristi u nis", status: "ACCEPTED", icon: Bike },
  { label: "Ne dorezim", status: "PICKED_UP", icon: ShieldCheck },
  { label: "Dorezuar", status: "DELIVERED", icon: PackageCheck }
];

export function OrderTrack({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [submittedCode, setSubmittedCode] = useState(initialCode);
  const [order, setOrder] = useState<TrackOrder | null>(null);
  const [message, setMessage] = useState(initialCode ? "Duke lexuar porosine..." : "Vendos kodin e porosise per tracking live.");

  useEffect(() => {
    if (!submittedCode) return;

    getOrderTrack(submittedCode)
      .then((data) => {
        setOrder(data.order);
        setMessage("");
      })
      .catch(() => {
        setOrder(null);
        setMessage("Porosia nuk u gjet ne databazen lokale.");
      });
  }, [submittedCode]);

  const activeIndex = useMemo(() => {
    if (!order) return 0;
    return Math.max(0, statuses.indexOf(order.status));
  }, [order]);

  function submit() {
    setSubmittedCode(code.trim());
  }

  return (
    <main className="happy-page min-h-screen">
      <CustomerHeader address="Rruga Abdyl Frasheri, Tirane" showAddress={false} />

      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-6 md:px-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <section className="theme-panel relative overflow-hidden rounded-2xl border p-5 shadow-happy">
            <p className="type-badge relative uppercase tracking-wide text-happy-orange">{order?.code ?? "Tracking"}</p>
            <h1 className="type-screen-title theme-text relative mt-1">{order ? "Porosia po vjen" : "Gjej porosine"}</h1>
            <p className="type-body theme-muted relative mt-2">
              {order ? `Motoristi ndjek rrugen nga ${order.business_name}.` : "Shkruaj kodin qe more pas konfirmimit."}
            </p>

            <div className="theme-soft-button relative mt-5 flex h-12 items-center rounded-xl border px-4 shadow-inner">
              <Search className="mr-2 h-5 w-5 text-happy-orange" />
              <input
                className="type-input theme-search-input w-full bg-transparent outline-none"
                onChange={(event) => setCode(event.target.value)}
                placeholder="HTC-..."
                value={code}
              />
              <button className="type-cta rounded-lg bg-happy-orange px-4 py-2 text-white" onClick={submit} type="button">
                Kerko
              </button>
            </div>

            <div className="relative mt-5 grid grid-cols-2 gap-3">
              <Info label="Status" value={order?.status ?? "-"} />
              <Info label="Pagesa" value={order ? formatLek(Number(order.total_amount)) : "-"} />
            </div>
          </section>

          <section className="theme-panel rounded-2xl border p-5 shadow-happy">
            <h2 className="type-section-title theme-text">Statusi</h2>
            <ol className="mt-5 space-y-3">
              {stepDefinitions.map((step, index) => (
                <li className="flex items-center gap-3" key={step.label}>
                  <span className={`grid h-9 w-9 place-items-center rounded-full ${index <= activeIndex ? "bg-happy-orange text-white" : "theme-soft-button border"}`}>
                    <step.icon className="h-4 w-4" />
                  </span>
                  <span className="type-body theme-text">{step.label}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="theme-panel rounded-2xl border p-5 shadow-happy">
            <h2 className="type-section-title theme-text">Motoristi</h2>
            <div className="mt-4 flex items-center gap-3">
              <img alt="Motorist Happy Tirana" className="h-16 w-16 rounded-[20px] object-cover" src="/catalog/courier-bike.webp" />
              <div>
                <strong className="type-restaurant theme-text">Motorist Happy</strong>
                <p className="type-secondary theme-muted">{order ? "Online" : "Ne pritje te porosise"}</p>
              </div>
            </div>
            <button className="type-cta mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-happy-orange text-white" type="button">
              <Phone className="mr-2 h-4 w-4" />
              Telefono
            </button>
          </section>
        </aside>

        {order ? (
          <LiveTrackingMap
            pickupPoint={{ lat: Number(order.pickup_lat), lng: Number(order.pickup_lng) }}
            dropoffPoint={{ lat: Number(order.dropoff_lat), lng: Number(order.dropoff_lng) }}
          />
        ) : (
          <section className="theme-panel grid min-h-[560px] place-items-center rounded-2xl border p-6 text-center shadow-happy">
            <div>
              <PackageCheck className="mx-auto h-12 w-12 text-happy-orange" />
              <p className="type-warning theme-muted mt-4">{message}</p>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="theme-soft-button rounded-xl border p-3">
      <p className="type-badge theme-subtle uppercase tracking-wide">{label}</p>
      <strong className="type-price theme-text mt-1 block">{value}</strong>
    </div>
  );
}
