"use client";

import { Bike, CheckCircle2, ChevronRight, Clock3, MapPin, Navigation2, PackageCheck, Phone, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RiderBottomNav } from "../../components/rider-bottom-nav";
import { RiderMap } from "../../components/rider-map";
import { acceptOrder, formatLek, getRiderDashboard, rejectOrder, updateOrderStatus, type RiderDashboard, type RiderOrder } from "../../lib/api";
import { getRiderSession } from "../../lib/rider-session";

export default function DeliveryPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<RiderDashboard | null>(null);
  const [message, setMessage] = useState("Duke lexuar porosine...");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getRiderSession()) {
      router.replace("/login");
      return;
    }
    refresh();
  }, [router]);

  async function refresh() {
    try {
      const data = await getRiderDashboard();
      setDashboard(data);
      setMessage("");
    } catch {
      setMessage("Nuk u lexua dot porosia nga API/Postgres.");
    }
  }

  const order = dashboard?.activeOrder ?? dashboard?.pendingOffers[0] ?? null;
  const isOffer = Boolean(order && order.status === "OFFERED");
  const leg = useMemo(() => (order?.status === "PICKED_UP" ? "dropoff" : "pickup"), [order?.status]);

  async function accept(orderToAccept: RiderOrder) {
    setBusy(true);
    try {
      await acceptOrder(orderToAccept.id);
      await refresh();
    } catch {
      setMessage("Porosia u mor nga dikush tjeter ose oferta skadoi.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reject(orderToReject: RiderOrder) {
    setBusy(true);
    try {
      await rejectOrder(orderToReject.id);
      await refresh();
    } catch {
      setMessage("Oferta nuk u refuzua dot.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "PICKED_UP" | "DELIVERED" | "CANCELLED") {
    if (!order) return;
    setBusy(true);
    try {
      await updateOrderStatus(order.id, status);
      if (status === "DELIVERED") router.push("/earnings");
      else await refresh();
    } catch {
      setMessage("Statusi nuk u perditesua dot. Kontrollo tranzicionin e porosise.");
    } finally {
      setBusy(false);
    }
  }

  const navigationUrl = order
    ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${order.status === "PICKED_UP" ? `${order.pickupLat},${order.pickupLng};${order.dropoffLat},${order.dropoffLng}` : `${order.dropoffLat},${order.dropoffLng};${order.pickupLat},${order.pickupLng}`}`
    : "#";

  return (
    <main className="rider-page min-h-screen pb-28 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#101010]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <button className="flex items-center gap-3 text-left" onClick={() => router.push("/")} type="button">
            <img alt="Happy Tirana Courier" className="h-10 w-[72px] object-contain" src="/happy-logo.svg" />
            <span>
              <span className="type-header-brand block text-happy-orange">Delivery</span>
              <span className="type-secondary block text-white/48">{order?.code ?? "Pa porosi"}</span>
            </span>
          </button>
          <span className={`type-badge rounded-full px-3 py-2 ${dashboard?.rider.isOnline ? "bg-happy-orange text-white" : "bg-white/10 text-white/58"}`}>
            {dashboard?.rider.isOnline ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 py-5 lg:grid-cols-[390px_1fr]">
        <aside className="space-y-4">
          {message ? <p className="type-warning rounded-2xl border border-happy-orange/25 bg-happy-orange/10 p-4 text-happy-orange">{message}</p> : null}

          {order ? (
            <section className="rider-panel rounded-3xl border p-5 shadow-happy">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="type-badge uppercase tracking-wide text-happy-orange">{isOffer ? "Porosi e re" : "Porosi aktive"}</p>
                  <h1 className="type-screen-title mt-1">{order.businessName}</h1>
                  <p className="type-secondary mt-1 text-white/55">{order.productDescription}</p>
                </div>
                <span className="type-badge rounded-full bg-white/10 px-3 py-2 text-white/62">{order.status}</span>
              </div>

              <div className="mt-5 space-y-3">
                <RouteLine icon={Bike} label="Merr produktin" value={order.pickupAddress} />
                <RouteLine icon={MapPin} label="Dorezo te klienti" value={order.dropoffAddress} />
                {order.customerPhone ? <RouteLine icon={Phone} label={order.customerName ?? "Klienti"} value={order.customerPhone} /> : null}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <Money label="Paguan biznesit" value={order.productValue} />
                <Money label="Arketon klientit" value={order.totalAmount} />
                <Money label="Fitimi yt 80%" value={order.riderEarning} />
                <Money label="Platforma 20%" value={order.platformCommission} />
              </div>

              {isOffer ? (
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button className="type-cta flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70" disabled={busy} onClick={() => reject(order)} type="button">
                    <X className="mr-2 h-5 w-5" />
                    Refuzo
                  </button>
                  <button className="type-cta flex h-14 items-center justify-center rounded-2xl bg-happy-orange text-white happy-pill-shadow" disabled={busy} onClick={() => accept(order)} type="button">
                    Prano
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </button>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <a className="type-cta flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80" href={navigationUrl} rel="noreferrer" target="_blank">
                    <Navigation2 className="mr-2 h-5 w-5 text-happy-orange" />
                    Hap navigimin
                  </a>
                  {order.status === "ACCEPTED" ? (
                    <button className="type-cta flex h-14 w-full items-center justify-center rounded-2xl bg-happy-orange text-white happy-pill-shadow" disabled={busy} onClick={() => setStatus("PICKED_UP")} type="button">
                      <PackageCheck className="mr-2 h-5 w-5" />
                      Mora produktin
                    </button>
                  ) : null}
                  {order.status === "PICKED_UP" ? (
                    <button className="type-cta flex h-14 w-full items-center justify-center rounded-2xl bg-happy-orange text-white happy-pill-shadow" disabled={busy} onClick={() => setStatus("DELIVERED")} type="button">
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                      Dorezova porosine
                    </button>
                  ) : null}
                  <button className="type-warning w-full text-white/45" disabled={busy} onClick={() => setStatus("CANCELLED")} type="button">
                    Anulo per problem
                  </button>
                </div>
              )}
            </section>
          ) : (
            <section className="rider-panel rounded-3xl border p-6 text-center shadow-happy">
              <Clock3 className="mx-auto h-10 w-10 text-happy-orange" />
              <h1 className="type-screen-title mt-4">Ska porosi aktive</h1>
              <p className="type-body mt-2 text-white/58">Kalo online nga dashboard-i dhe ofertat do te shfaqen ketu.</p>
            </section>
          )}

          <section className="rider-panel rounded-3xl border p-5 shadow-happy">
            <h2 className="type-section-title">Hapat</h2>
            <ol className="mt-4 space-y-3">
              {["Prano porosine", "Shko te biznesi", "Paguaj vleren e produktit", "Dorezo te klienti", "Arketon produkt + transport"].map((step, index) => (
                <li className="type-body flex items-center gap-3 text-white/70" key={step}>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-happy-orange text-white">{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        </aside>

        <RiderMap isOnline={Boolean(dashboard?.rider.isOnline)} leg={leg} order={order} />
      </section>

      <RiderBottomNav />
    </main>
  );
}

function RouteLine({ icon: Icon, label, value }: { icon: typeof Bike; label: string; value: string }) {
  return (
    <div className="rider-soft flex items-center gap-3 rounded-2xl border p-4">
      <Icon className="h-5 w-5 shrink-0 text-happy-orange" />
      <div className="min-w-0">
        <p className="type-badge uppercase text-white/42">{label}</p>
        <p className="type-body truncate">{value}</p>
      </div>
    </div>
  );
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div className="rider-soft rounded-2xl border p-4">
      <p className="type-badge uppercase text-white/42">{label}</p>
      <strong className="type-price mt-1 block">{formatLek(value)}</strong>
    </div>
  );
}
