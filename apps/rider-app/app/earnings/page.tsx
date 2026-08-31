"use client";

import { CalendarDays, ChevronLeft, PackageCheck, ReceiptText, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RiderBottomNav } from "../../components/rider-bottom-nav";
import { formatLek, getRiderDashboard, type RiderDashboard } from "../../lib/api";
import { getRiderSession } from "../../lib/rider-session";

export default function EarningsPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<RiderDashboard | null>(null);
  const [message, setMessage] = useState("Duke lexuar fitimet...");

  useEffect(() => {
    if (!getRiderSession()) {
      router.replace("/login");
      return;
    }

    getRiderDashboard()
      .then((data) => {
        setDashboard(data);
        setMessage("");
      })
      .catch(() => setMessage("Nuk u lexuan dot fitimet nga databaza lokale."));
  }, [router]);

  return (
    <main className="rider-page min-h-screen pb-28 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#101010]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/72" href="/">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="text-center">
            <p className="type-header-brand text-happy-orange">Fitimet</p>
            <p className="type-secondary text-white/48">{dashboard?.rider.name ?? "Motorist"}</p>
          </div>
          <img alt="Happy Tirana Courier" className="h-10 w-[72px] object-contain" src="/happy-logo.svg" />
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-5">
        {message ? <p className="type-warning mb-4 rounded-2xl border border-happy-orange/25 bg-happy-orange/10 p-4 text-happy-orange">{message}</p> : null}

        <section className="rider-panel overflow-hidden rounded-3xl border shadow-happy">
          <div className="relative p-5">
            <div className="absolute inset-0 bg-gradient-to-br from-happy-orange/18 via-transparent to-transparent" />
            <div className="relative">
              <p className="type-badge uppercase tracking-wide text-happy-orange">80% e transportit</p>
              <h1 className="type-screen-title mt-2">Pasqyra financiare</h1>
              <p className="type-body mt-2 max-w-lg text-white/58">Kur porosia mbyllet si e dorezuar, ledger-i ruan fitimin e motoristit dhe detyrimin 20% ndaj platformes.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <Metric icon={WalletCards} label="Sot" value={formatLek(dashboard?.metrics.todayEarnings ?? 0)} />
                <Metric icon={CalendarDays} label="Jave" value={formatLek(dashboard?.metrics.weekEarnings ?? 0)} />
                <Metric icon={ReceiptText} label="20% platforme" value={formatLek(dashboard?.metrics.platformDue ?? 0)} />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="type-badge uppercase tracking-wide text-happy-orange">Historiku</p>
              <h2 className="type-section-title mt-1">Porosite e mbyllura</h2>
            </div>
            <span className="type-secondary text-white/45">{dashboard?.recentOrders.length ?? 0} porosi</span>
          </div>

          <div className="mt-3 space-y-3">
            {dashboard?.recentOrders.length ? (
              dashboard.recentOrders.map((order) => (
                <article className="rider-panel rounded-3xl border p-4 shadow-happy" key={order.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="type-badge uppercase text-happy-orange">{order.code}</p>
                      <h3 className="type-restaurant mt-1 truncate">{order.businessName}</h3>
                      <p className="type-secondary mt-1 text-white/55">{order.dropoffAddress}</p>
                    </div>
                    <span className="type-badge rounded-full bg-white/10 px-3 py-2 text-white/58">{order.status}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <SmallMoney label="Transport" value={order.transportFee} />
                    <SmallMoney label="80%" value={order.riderEarning} />
                    <SmallMoney label="20%" value={order.platformCommission} />
                  </div>
                </article>
              ))
            ) : (
              <section className="rider-panel rounded-3xl border p-6 text-center shadow-happy">
                <PackageCheck className="mx-auto h-10 w-10 text-happy-orange" />
                <p className="type-body mt-3 text-white/58">Nuk ka ende porosi te mbyllura.</p>
              </section>
            )}
          </div>
        </section>
      </section>

      <RiderBottomNav />
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof WalletCards; label: string; value: string }) {
  return (
    <article className="rider-soft rounded-2xl border p-4">
      <Icon className="h-5 w-5 text-happy-orange" />
      <p className="type-badge mt-4 uppercase text-white/42">{label}</p>
      <strong className="type-large-price mt-1 block">{value}</strong>
    </article>
  );
}

function SmallMoney({ label, value }: { label: string; value: number }) {
  return (
    <div className="rider-soft rounded-2xl border p-3">
      <p className="type-badge uppercase text-white/42">{label}</p>
      <strong className="type-price mt-1 block">{formatLek(value)}</strong>
    </div>
  );
}
