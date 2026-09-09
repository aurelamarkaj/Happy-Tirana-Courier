"use client";

import {
  CalendarDays,
  PackageCheck,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  OperationsShell,
  OperationsMetric,
} from "../../../shared/operations-shell";
import { riderNavigation } from "../../components/rider-navigation";
import {
  logoutRider,
  formatLek,
  getRiderDashboard,
  type RiderDashboard,
} from "../../lib/api";
import { getRiderSession } from "../../lib/rider-session";

export default function EarningsPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<RiderDashboard | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getRiderSession()) {
      router.replace("/login");
      return;
    }

    void refresh();
  }, [router]);

  async function refresh() {
    setLoading(true);
    try {
      setDashboard(await getRiderDashboard());
      setMessage("");
    } catch {
      setMessage("Nuk u ngarkuan fitimet. Provo perseri.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <OperationsShell
      role="Motorist"
      name={dashboard?.rider.name ?? "Motoristi"}
      title="Pasqyra financiare"
      active="earnings"
      items={riderNavigation}
      onLogout={() => {
        logoutRider();
        router.replace("/login");
      }}
      onRefresh={refresh}
      refreshing={loading}
    >
      {message && (
        <p className="ops-notice" role="alert">
          {message}
        </p>
      )}
      <section className="ops-metrics" aria-label="Bilanci">
        <OperationsMetric
          icon={WalletCards}
          label="Fitime sot"
          value={dashboard ? formatLek(dashboard.metrics.todayEarnings) : "--"}
          detail="Dergesat e sotme"
          tone="green"
          loading={loading}
        />
        <OperationsMetric
          icon={CalendarDays}
          label="Kete jave"
          value={dashboard ? formatLek(dashboard.metrics.weekEarnings) : "--"}
          detail="Fitimet javore"
          tone="blue"
          loading={loading}
        />
        <OperationsMetric
          icon={ReceiptText}
          label="Debit platforme"
          value={dashboard ? formatLek(dashboard.metrics.platformDue) : "--"}
          detail="20% e transportit"
          loading={loading}
        />
      </section>
      <section className="ops-section">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="type-badge uppercase tracking-wide text-happy-orange">
              Historiku
            </p>
            <h2 className="type-section-title mt-1">Porosite e mbyllura</h2>
          </div>
          <span className="type-secondary text-white/45">
            {dashboard?.recentOrders.length ?? 0} porosi
          </span>
        </div>

        <div className="mt-3 space-y-3">
          {dashboard?.recentOrders.length ? (
            dashboard.recentOrders.map((order) => (
              <article
                className="rider-panel rounded-3xl border p-4 shadow-happy"
                key={order.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="type-badge uppercase text-happy-orange">
                      {order.code}
                    </p>
                    <h3 className="type-restaurant mt-1 truncate">
                      {order.businessName}
                    </h3>
                    <p className="type-secondary mt-1 text-white/55">
                      {order.dropoffAddress}
                    </p>
                  </div>
                  <span className="type-badge rounded-full bg-white/10 px-3 py-2 text-white/58">
                    {order.status}
                  </span>
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
              <p className="type-body mt-3 text-white/58">
                Nuk ka ende porosi te mbyllura.
              </p>
            </section>
          )}
        </div>
      </section>
    </OperationsShell>
  );
}

function SmallMoney({ label, value }: { label: string; value: number }) {
  return (
    <div className="ops-money">
      <p className="type-badge uppercase text-white/42">{label}</p>
      <strong className="type-price mt-1 block">{formatLek(value)}</strong>
    </div>
  );
}
