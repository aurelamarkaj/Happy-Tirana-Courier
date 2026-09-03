"use client";

import {
  AlertTriangle,
  Bike,
  Building2,
  Map,
  ReceiptText,
  Route,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminMetric, AdminShell } from "../components/admin-shell";
import {
  formatLek,
  getAdminBusinesses,
  getAdminFinance,
  getAdminLiveMap,
  getAdminRiders,
  type AdminBusiness,
  type AdminFinance,
  type AdminLiveOrder,
  type AdminRider,
} from "../lib/api";

const modules = [
  {
    href: "/businesses",
    label: "Biznese",
    description: "Krijo llogari, aktivizo dhe edito subjektet.",
    icon: Building2,
  },
  {
    href: "/riders",
    label: "Motoriste",
    description: "Menaxho kurieret, dokumentet dhe statusin.",
    icon: Bike,
  },
  {
    href: "/zones",
    label: "Zona",
    description: "Vizato poligone dhe cakto cmime fikse.",
    icon: Map,
  },
  {
    href: "/live-map",
    label: "Live Map",
    description: "Shiko porosite dhe GPS ne kohe reale.",
    icon: Route,
  },
  {
    href: "/finance",
    label: "Financa",
    description: "Raporte 80/20 dhe shlyerje periodike.",
    icon: ReceiptText,
  },
];

export default function AdminHome() {
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [riders, setRiders] = useState<AdminRider[]>([]);
  const [orders, setOrders] = useState<AdminLiveOrder[]>([]);
  const [finance, setFinance] = useState<AdminFinance | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      const [businessResult, riderResult, liveResult, financeResult] =
        await Promise.allSettled([
          getAdminBusinesses(),
          getAdminRiders(),
          getAdminLiveMap(),
          getAdminFinance(),
        ]);

      if (!mounted) return;

      let hasError = false;

      if (businessResult.status === "fulfilled") {
        setBusinesses(businessResult.value.businesses);
      } else {
        hasError = true;
      }

      if (riderResult.status === "fulfilled") {
        setRiders(riderResult.value.riders);
      } else {
        hasError = true;
      }

      if (liveResult.status === "fulfilled") {
        setOrders(liveResult.value.orders);
      } else {
        hasError = true;
      }

      if (financeResult.status === "fulfilled") {
        setFinance(financeResult.value);
      } else {
        hasError = true;
      }

      setMessage(
        hasError
          ? "Dashboard-i u hap, por disa te dhena nuk u lexuan nga API/Postgres."
          : "",
      );
    }

    void loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  const metrics = useMemo(
    () => [
      { label: "Porosi aktive", value: String(orders.length), icon: Route },
      {
        label: "Motoriste online",
        value: String(riders.filter((rider) => rider.isOnline).length),
        icon: Bike,
      },
      {
        label: "Biznese aktive",
        value: String(
          businesses.filter((business) => business.status === "ACTIVE").length,
        ),
        icon: TrendingUp,
      },
      {
        label: "Platforma 20%",
        value: formatLek(finance?.metrics.platformCommission ?? 0),
        icon: ReceiptText,
      },
    ],
    [businesses, finance?.metrics.platformCommission, orders.length, riders],
  );

  return (
    <AdminShell
      action={
        <Link
          className="type-cta flex h-12 items-center justify-center rounded-xl bg-happy-orange px-5 text-white happy-pill-shadow"
          href="/live-map"
        >
          Harta live
        </Link>
      }
      description="Paneli qendror per krijimin e bizneseve dhe motoristeve, zonat PostGIS, monitorimin live dhe financat e platformes."
      eyebrow="Superadmin"
      title="Menaxhimi i platformes"
    >
      {message ? (
        <p className="type-warning rounded-2xl border border-happy-orange/40 bg-happy-orange/10 p-4 text-happy-orange">
          {message}
        </p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        {metrics.map((metric) => (
          <AdminMetric
            icon={metric.icon}
            key={metric.label}
            label={metric.label}
            value={metric.value}
          />
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="admin-panel rounded-3xl border p-5 shadow-happy">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="type-badge uppercase tracking-wide text-happy-orange">
                Modulet
              </p>
              <h2 className="type-section-title mt-1">Akses i shpejte</h2>
            </div>
            <span className="type-secondary text-white/45">
              {modules.length} module
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {modules.map((item) => (
              <Link
                className="admin-soft rounded-2xl border p-4 transition hover:border-happy-orange/55"
                href={item.href}
                key={item.href}
              >
                <item.icon className="h-6 w-6 text-happy-orange" />
                <h3 className="type-product mt-4">{item.label}</h3>
                <p className="type-secondary mt-1 text-white/52">
                  {item.description}
                </p>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <section className="admin-panel rounded-3xl border p-5 shadow-happy">
            <div className="flex items-center justify-between">
              <h2 className="type-section-title">Porosi qe duan vemendje</h2>
              <AlertTriangle className="h-5 w-5 text-happy-orange" />
            </div>
            <div className="mt-4 space-y-3">
              {orders.length ? (
                orders.slice(0, 4).map((order) => (
                  <div
                    className="admin-soft flex items-center justify-between rounded-2xl border p-3"
                    key={order.id}
                  >
                    <span className="type-body">
                      {order.code} - {order.businessName}
                    </span>
                    <span className="type-badge rounded-full bg-happy-orange/15 px-3 py-1 text-happy-orange">
                      {order.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="admin-soft rounded-2xl border p-3 text-white/55">
                  Nuk ka porosi aktive.
                </div>
              )}
            </div>
          </section>

          <section className="admin-panel rounded-3xl border p-5 shadow-happy">
            <ShieldCheck className="h-6 w-6 text-happy-orange" />
            <h2 className="type-section-title mt-4">Rregull financiar</h2>
            <p className="type-body mt-2 text-white/58">
              Cdo transport ndahet automatikisht: 80% motoristi, 20% platforma.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="admin-soft rounded-2xl border p-4">
                <p className="type-badge uppercase text-white/42">Motoristi</p>
                <strong className="type-large-price mt-1 block">80%</strong>
              </div>
              <div className="rounded-2xl bg-happy-orange p-4 text-white">
                <p className="type-badge uppercase text-white/75">Platforma</p>
                <strong className="type-large-price mt-1 block">20%</strong>
              </div>
            </div>
          </section>
        </div>
      </section>
    </AdminShell>
  );
}
