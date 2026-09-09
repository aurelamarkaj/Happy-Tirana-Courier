"use client";

import {
  Bike,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPin,
  Navigation2,
  PackageCheck,
  Phone,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { OperationsShell } from "../../../shared/operations-shell";
import { riderNavigation } from "../../components/rider-navigation";
import { RiderMap } from "../../components/rider-map";
import {
  logoutRider,
  RiderApiError,
  acceptOrder,
  formatLek,
  getRiderDashboard,
  rejectOrder,
  updateOrderStatus,
  type RiderDashboard,
  type RiderOrder,
} from "../../lib/api";
import { getRiderSession } from "../../lib/rider-session";

export default function DeliveryPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<RiderDashboard | null>(null);
  const [message, setMessage] = useState("Duke lexuar porosine...");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getRiderSession()) {
      router.replace("/login");
      return;
    }
    refresh();
  }, [router]);

  async function refresh() {
    setLoading(true);
    try {
      const data = await getRiderDashboard();
      setDashboard(data);
      setMessage("");
    } catch (error) {
      if (error instanceof RiderApiError && error.status === 401) {
        logoutRider();
        router.replace("/login?reason=session-expired");
        return;
      }
      setMessage("Nuk u lexua dot porosia. Provo perseri.");
    } finally {
      setLoading(false);
    }
  }

  const order = dashboard?.activeOrder ?? dashboard?.pendingOffers[0] ?? null;
  const isOffer = Boolean(order && order.status === "OFFERED");
  const leg = useMemo(
    () => (order?.status === "PICKED_UP" ? "dropoff" : "pickup"),
    [order?.status],
  );

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
      setMessage(
        "Statusi nuk u perditesua dot. Kontrollo tranzicionin e porosise.",
      );
    } finally {
      setBusy(false);
    }
  }

  const navigationUrl = order
    ? `https://www.google.com/maps/dir/?api=1&origin=${
        order.status === "PICKED_UP"
          ? `${order.pickupLat},${order.pickupLng}`
          : `${order.dropoffLat},${order.dropoffLng}`
      }&destination=${
        order.status === "PICKED_UP"
          ? `${order.dropoffLat},${order.dropoffLng}`
          : `${order.pickupLat},${order.pickupLng}`
      }&travelmode=driving`
    : "#";

  return (
    <OperationsShell
      role="Motorist"
      name={dashboard?.rider.name ?? "Motoristi"}
      title="Dergesa"
      active="delivery"
      items={riderNavigation}
      onLogout={() => {
        logoutRider();
        router.replace("/login");
      }}
      onRefresh={refresh}
      refreshing={loading}
    >
      <section className="ops-delivery-layout">
        <aside className="space-y-4">
          {message ? (
            <p className="type-warning rounded-2xl border border-happy-orange/25 bg-happy-orange/10 p-4 text-happy-orange">
              {message}
            </p>
          ) : null}

          {order ? (
            <section className="rider-panel rounded-3xl border p-5 shadow-happy">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="type-badge uppercase tracking-wide text-happy-orange">
                    {isOffer ? "Porosi e re" : "Porosi aktive"}
                  </p>
                  <h2 className="type-section-title mt-1">
                    {order.businessName}
                  </h2>
                  <p className="type-secondary mt-1 text-white/55">
                    {order.productDescription}
                  </p>
                </div>
                <span className="type-badge rounded-full bg-white/10 px-3 py-2 text-white/62">
                  {order.status}
                </span>
              </div>

              <div className="mt-5 space-y-3">
                <RouteLine
                  icon={Bike}
                  label="Merr produktin"
                  value={order.pickupAddress}
                />
                <RouteLine
                  icon={MapPin}
                  label="Dorezo te klienti"
                  value={order.dropoffAddress}
                />
                {order.customerPhone ? (
                  <RouteLine
                    icon={Phone}
                    label={order.customerName ?? "Klienti"}
                    value={order.customerPhone}
                  />
                ) : null}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <Money label="Paguan biznesit" value={order.productValue} />
                <Money label="Arketon klientit" value={order.totalAmount} />
                <Money label="Fitimi yt 80%" value={order.riderEarning} />
                <Money label="Platforma 20%" value={order.platformCommission} />
              </div>

              {isOffer ? (
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    className="type-cta flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70"
                    disabled={busy}
                    onClick={() => reject(order)}
                    type="button"
                  >
                    <X className="mr-2 h-5 w-5" />
                    Refuzo
                  </button>
                  <button
                    className="type-cta flex h-14 items-center justify-center rounded-2xl bg-happy-orange text-white happy-pill-shadow"
                    disabled={busy}
                    onClick={() => accept(order)}
                    type="button"
                  >
                    Prano
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </button>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <a
                    className="type-cta flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80"
                    href={navigationUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <Navigation2 className="mr-2 h-5 w-5 text-happy-orange" />
                    Hap navigimin
                  </a>
                  {order.status === "ACCEPTED" ? (
                    <button
                      className="type-cta flex h-14 w-full items-center justify-center rounded-2xl bg-happy-orange text-white happy-pill-shadow"
                      disabled={busy}
                      onClick={() => setStatus("PICKED_UP")}
                      type="button"
                    >
                      <PackageCheck className="mr-2 h-5 w-5" />
                      Mora produktin
                    </button>
                  ) : null}
                  {order.status === "PICKED_UP" ? (
                    <button
                      className="type-cta flex h-14 w-full items-center justify-center rounded-2xl bg-happy-orange text-white happy-pill-shadow"
                      disabled={busy}
                      onClick={() => setStatus("DELIVERED")}
                      type="button"
                    >
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                      Dorezova porosine
                    </button>
                  ) : null}
                  <button
                    className="type-warning w-full text-white/45"
                    disabled={busy}
                    onClick={() => setStatus("CANCELLED")}
                    type="button"
                  >
                    Anulo per problem
                  </button>
                </div>
              )}
            </section>
          ) : (
            <section className="rider-panel rounded-3xl border p-6 text-center shadow-happy">
              <Clock3 className="mx-auto h-10 w-10 text-happy-orange" />
              <h2 className="type-section-title mt-4">
                {loading ? "Po ngarkohet..." : "Ska porosi aktive"}
              </h2>
              <p className="type-body mt-2 text-white/58">
                Kalo online nga dashboard-i dhe ofertat do te shfaqen ketu.
              </p>
            </section>
          )}

          <section className="rider-panel rounded-3xl border p-5 shadow-happy">
            <h2 className="type-section-title">Hapat</h2>
            <ol className="mt-4 space-y-3">
              {[
                "Prano porosine",
                "Shko te biznesi",
                "Paguaj vleren e produktit",
                "Dorezo te klienti",
                "Arketon produkt + transport",
              ].map((step, index) => (
                <li
                  className="type-body flex items-center gap-3 text-white/70"
                  key={step}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-happy-orange text-white">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        </aside>

        <RiderMap
          isOnline={Boolean(dashboard?.rider.isOnline)}
          leg={leg}
          order={order}
        />
      </section>
    </OperationsShell>
  );
}

function RouteLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Bike;
  label: string;
  value: string;
}) {
  return (
    <div className="rider-soft flex items-center gap-3 rounded-2xl border p-4">
      <Icon className="h-5 w-5 shrink-0 text-happy-orange" />
      <div className="min-w-0">
        <p className="type-badge uppercase text-white/42">{label}</p>
        <p className="type-body break-words">{value}</p>
      </div>
    </div>
  );
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div className="ops-money">
      <p className="type-badge uppercase text-white/42">{label}</p>
      <strong className="type-price mt-1 block">{formatLek(value)}</strong>
    </div>
  );
}
