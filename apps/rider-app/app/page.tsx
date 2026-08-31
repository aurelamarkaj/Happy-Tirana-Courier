"use client";

import { Bike, ChevronRight, Clock3, LogOut, MapPin, PackageCheck, Power, RefreshCw, Route, ShieldCheck, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { RiderBottomNav } from "../components/rider-bottom-nav";
import { acceptOrder, formatLek, getRiderDashboard, logoutRider, rejectOrder, setRiderAvailability, type RiderDashboard, type RiderOrder } from "../lib/api";
import { getRiderSession } from "../lib/rider-session";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function RiderHome() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<RiderDashboard | null>(null);
  const [message, setMessage] = useState("Duke lexuar dashboard-in...");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getRiderSession()) {
      router.replace("/login");
      return;
    }
    refreshDashboard();
  }, [router]);

  useEffect(() => {
    const session = getRiderSession();
    if (!session) return;

    const socket = io(apiBaseUrl);
    socket.emit("rider.join", session.id);
    socket.on("order.offered", refreshDashboard);
    socket.on("order.accepted", refreshDashboard);
    socket.on("order.status_changed", refreshDashboard);

    return () => {
      socket.disconnect();
    };
  }, []);

  async function refreshDashboard() {
    try {
      const data = await getRiderDashboard();
      setDashboard(data);
      setMessage("");
    } catch {
      setMessage("Nuk u lidh dot me API/Postgres lokal. Kontrollo serverin dhe databazen.");
    }
  }

  function currentLocation() {
    return new Promise<{ lat: number; lng: number } | undefined>((resolve) => {
      if (!navigator.geolocation) {
        resolve(undefined);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => resolve(undefined),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  async function toggleOnline() {
    if (!dashboard) return;
    setBusy(true);
    try {
      const location = await currentLocation();
      const data = await setRiderAvailability(!dashboard.rider.isOnline, location);
      setDashboard(data);
      setMessage(data.rider.isOnline ? "Je online. GPS ruhet vetem gjate online/porosive aktive." : "Je offline. GPS nuk transmetohet.");
    } catch {
      setMessage("Nuk u ndryshua dot statusi Online/Offline.");
    } finally {
      setBusy(false);
    }
  }

  async function accept(order: RiderOrder) {
    setBusy(true);
    try {
      await acceptOrder(order.id);
      await refreshDashboard();
      router.push("/delivery");
    } catch {
      setMessage("Porosia u mor nga dikush tjeter ose oferta skadoi.");
      await refreshDashboard();
    } finally {
      setBusy(false);
    }
  }

  async function reject(order: RiderOrder) {
    setBusy(true);
    try {
      await rejectOrder(order.id);
      await refreshDashboard();
    } catch {
      setMessage("Oferta nuk u refuzua dot.");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    logoutRider();
    router.replace("/login");
  }

  return (
    <main className="rider-page min-h-screen pb-28 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#101010]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link className="flex items-center gap-3" href="/">
            <img alt="Happy Tirana Courier" className="h-10 w-[72px] object-contain" src="/happy-logo.svg" />
            <span>
              <span className="type-header-brand block text-happy-orange">Happy Tirana</span>
              <span className="type-secondary block text-white/48">Rider</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <button className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70" onClick={refreshDashboard} type="button">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70" onClick={logout} type="button">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-5">
        {message ? <p className="type-warning mb-4 rounded-2xl border border-happy-orange/25 bg-happy-orange/10 p-4 text-happy-orange">{message}</p> : null}

        <section className="rider-panel overflow-hidden rounded-3xl border shadow-happy">
          <div className="relative min-h-56 p-5">
            <img alt="" className="absolute inset-0 h-full w-full object-cover opacity-22" src="/catalog/courier-bike.webp" />
            <div className="absolute inset-0 bg-gradient-to-br from-black/92 via-black/76 to-black/58" />
            <div className="relative flex h-full min-h-48 flex-col justify-between">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="type-badge uppercase tracking-wide text-happy-orange">Paneli i motoristit</p>
                  <h1 className="type-screen-title mt-2">{dashboard?.rider.name ?? "Motorist"}</h1>
                  <p className="type-body mt-2 max-w-sm text-white/62">Butona te medhenj, status live dhe vetem informacioni qe duhet gjate punes.</p>
                </div>
                <span className={`type-badge rounded-full px-3 py-2 ${dashboard?.rider.isOnline ? "bg-happy-orange text-white" : "bg-white/10 text-white/58"}`}>
                  {dashboard?.rider.isOnline ? "ONLINE" : "OFFLINE"}
                </span>
              </div>

              <button
                className={`type-cta mt-8 flex h-16 w-full items-center justify-center rounded-2xl transition ${
                  dashboard?.rider.isOnline ? "bg-white text-happy-black" : "bg-happy-orange text-white happy-pill-shadow"
                }`}
                disabled={busy || !dashboard}
                onClick={toggleOnline}
                type="button"
              >
                <Power className="mr-2 h-5 w-5" />
                {dashboard?.rider.isOnline ? "Kalo Offline" : "Kalo Online"}
              </button>
            </div>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric icon={PackageCheck} label="Sot" value={`${dashboard?.metrics.todayDeliveries ?? 0} porosi`} />
          <Metric icon={WalletCards} label="Fitime sot" value={formatLek(dashboard?.metrics.todayEarnings ?? 0)} />
          <Metric icon={Route} label="Jave" value={`${dashboard?.metrics.weekDeliveries ?? 0} porosi`} />
          <Metric icon={ShieldCheck} label="20% platforme" value={formatLek(dashboard?.metrics.platformDue ?? 0)} />
        </section>

        {dashboard?.activeOrder ? (
          <section className="rider-panel mt-4 rounded-3xl border p-5 shadow-happy">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="type-badge uppercase tracking-wide text-happy-orange">Porosi aktive</p>
                <h2 className="type-section-title mt-1">{dashboard.activeOrder.businessName}</h2>
                <p className="type-secondary mt-1 text-white/55">{dashboard.activeOrder.dropoffAddress}</p>
              </div>
              <span className="type-badge rounded-full bg-happy-orange px-3 py-2 text-white">{dashboard.activeOrder.status}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <CashBox label="Paguaj biznesit" value={dashboard.activeOrder.productValue} />
              <CashBox label="Merr klientit" value={dashboard.activeOrder.totalAmount} />
            </div>
            <Link className="type-cta mt-4 flex h-14 items-center justify-center rounded-2xl bg-happy-orange text-white happy-pill-shadow" href="/delivery">
              Vazhdo porosine
              <ChevronRight className="ml-2 h-5 w-5" />
            </Link>
          </section>
        ) : null}

        <section className="mt-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="type-badge uppercase tracking-wide text-happy-orange">Oferta</p>
              <h2 className="type-section-title mt-1">Porosi te reja</h2>
            </div>
            <span className="type-secondary text-white/45">{dashboard?.pendingOffers.length ?? 0} aktive</span>
          </div>

          <div className="mt-3 space-y-3">
            {dashboard?.pendingOffers.length ? (
              dashboard.pendingOffers.map((order) => (
                <article className="rider-panel rounded-3xl border p-4 shadow-happy" key={order.id}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-happy-orange/15 text-happy-orange">
                      <Bike className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="type-badge uppercase text-happy-orange">{order.code}</p>
                      <h3 className="type-restaurant mt-1 truncate">{order.businessName}</h3>
                      <p className="type-secondary mt-1 text-white/55">{order.pickupAddress} → {order.dropoffAddress}</p>
                    </div>
                    <div className="text-right">
                      <strong className="type-price text-happy-orange">{formatLek(order.riderEarning)}</strong>
                      <p className="type-secondary text-white/45">80%</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button className="type-cta h-12 rounded-2xl border border-white/10 bg-white/5 text-white/70" disabled={busy} onClick={() => reject(order)} type="button">
                      Refuzo
                    </button>
                    <button className="type-cta h-12 rounded-2xl bg-happy-orange text-white" disabled={busy} onClick={() => accept(order)} type="button">
                      Prano
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="rider-panel rounded-3xl border p-5 text-center shadow-happy">
                <Clock3 className="mx-auto h-8 w-8 text-happy-orange" />
                <p className="type-body mt-3 text-white/62">{dashboard?.rider.isOnline ? "Po presim porosi te reja." : "Kalo online per te marre oferta."}</p>
              </div>
            )}
          </div>
        </section>
      </section>

      <RiderBottomNav />
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Bike; label: string; value: string }) {
  return (
    <article className="rider-panel rounded-2xl border p-4 shadow-happy">
      <Icon className="h-5 w-5 text-happy-orange" />
      <p className="type-badge mt-4 uppercase text-white/42">{label}</p>
      <strong className="type-price mt-1 block">{value}</strong>
    </article>
  );
}

function CashBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rider-soft rounded-2xl border p-4">
      <p className="type-badge uppercase text-white/42">{label}</p>
      <strong className="type-large-price mt-1 block">{formatLek(value)}</strong>
    </div>
  );
}
