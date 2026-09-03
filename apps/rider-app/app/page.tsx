"use client";

import {
  Bike,
  CheckCircle2,
  Clock3,
  LogOut,
  MapPin,
  PackageCheck,
  Power,
  RefreshCw,
  Route,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { RiderBottomNav } from "../components/rider-bottom-nav";
import {
  acceptOrder,
  formatLek,
  getRiderDashboard,
  logoutRider,
  rejectOrder,
  reverseAddress,
  RiderApiError,
  sendRiderLocation,
  setRiderAvailability,
  type RiderDashboard,
  type RiderOrder,
  type RoutePoint,
} from "../lib/api";
import { getRiderSession } from "../lib/rider-session";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function RiderHome() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<RiderDashboard | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [message, setMessage] = useState("");
  const [currentAddress, setCurrentAddress] = useState(
    "Vendndodhja shfaqet kur je online.",
  );
  const [currentGps, setCurrentGps] = useState<RoutePoint | null>(null);
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
    socket.on(
      "order.offered",
      (payload?: { message?: string; distanceMeters?: number | null }) => {
        const distance =
          typeof payload?.distanceMeters === "number"
            ? ` Afërsisht ${Math.round(payload.distanceMeters)}m nga pika e marrjes.`
            : "";
        setMessage(
          `${payload?.message ?? "Ke një porosi të re afër teje."}${distance}`,
        );
        refreshDashboard();
      },
    );
    socket.on("order.accepted", refreshDashboard);
    socket.on("order.status_changed", refreshDashboard);

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!dashboard?.rider.isOnline || !navigator.geolocation) {
      if (!dashboard?.rider.isOnline) {
        setCurrentAddress("Vendndodhja shfaqet kur je online.");
        setCurrentGps(null);
      }
      return;
    }

    let reverseTimeout: number | undefined;
    const watcherId = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCurrentGps(next);
        setCurrentAddress("Po lexohet adresa aktuale...");
        sendRiderLocation({
          ...next,
          orderId: dashboard.activeOrder?.id ?? null,
          speed: position.coords.speed ?? undefined,
          heading: position.coords.heading ?? undefined,
        }).catch(() => undefined);

        if (reverseTimeout) window.clearTimeout(reverseTimeout);
        reverseTimeout = window.setTimeout(() => {
          reverseAddress(next)
            .then((data) => {
              const address = data.address;
              setCurrentAddress(
                address
                  ? address.details || `${address.label}, ${address.city}`
                  : `${next.lat.toFixed(5)}, ${next.lng.toFixed(5)}`,
              );
            })
            .catch(() =>
              setCurrentAddress(
                `${next.lat.toFixed(5)}, ${next.lng.toFixed(5)}`,
              ),
            );
        }, 650);
      },
      () => setCurrentAddress("Lejo GPS ne browser per vendndodhjen live."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watcherId);
      if (reverseTimeout) window.clearTimeout(reverseTimeout);
    };
  }, [dashboard?.activeOrder?.id, dashboard?.rider.isOnline]);

  async function refreshDashboard() {
    try {
      const data = await getRiderDashboard();
      setDashboard(data);
      setMessage("");
    } catch (error) {
      if (error instanceof RiderApiError && error.status === 401) {
        logoutRider();
        router.replace("/login");
        return;
      }

      setMessage(
        error instanceof RiderApiError && error.code === "RIDER_API_TIMEOUT"
          ? "API-ja po vonon. Kontrollo nese serveri lokal dhe Postgres jane ndezur."
          : "Nuk u lidh dot me API/Postgres lokal. Kontrollo serverin dhe databazen.",
      );
    } finally {
      setLoadingDashboard(false);
    }
  }

  function currentLocation() {
    return new Promise<{ lat: number; lng: number } | undefined>((resolve) => {
      if (!navigator.geolocation) {
        resolve(undefined);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }),
        () => resolve(undefined),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }

  async function toggleOnline() {
    if (!dashboard) return;
    setBusy(true);
    try {
      const location = await currentLocation();
      const data = await setRiderAvailability(
        !dashboard.rider.isOnline,
        location,
      );
      setDashboard(data);
      setMessage(
        data.rider.isOnline
          ? "Je online. Porosite e reja vijne sipas afersise me GPS."
          : "Je offline. GPS nuk transmetohet.",
      );
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

  const activeOrders = useMemo(
    () => (dashboard?.activeOrder ? [dashboard.activeOrder] : []),
    [dashboard?.activeOrder],
  );

  return (
    <main className="rider-page min-h-screen pb-28 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#101010]/92 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link className="flex shrink-0 items-center gap-3" href="/">
              <img
                alt="Happy Tirana Courier"
                className="h-10 w-[72px] object-contain"
                src="/happy-logo.svg"
              />
              <span>
                <span className="type-header-brand block text-happy-orange">
                  Happy Tirana
                </span>
                <span className="type-secondary block text-white/48">
                  Rider
                </span>
              </span>
            </Link>
            <div className="hidden min-w-0 flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-white/6 px-3 py-2 text-white/78 md:flex">
              <MapPin className="h-4 w-4 shrink-0 text-happy-orange" />
              <span className="type-secondary truncate">{currentAddress}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70"
                onClick={refreshDashboard}
                type="button"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70"
                onClick={logout}
                type="button"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/6 px-3 py-2 text-white/78 md:hidden">
            <MapPin className="h-4 w-4 shrink-0 text-happy-orange" />
            <span className="type-secondary truncate">{currentAddress}</span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-5 md:px-6">
        {loadingDashboard && !dashboard ? (
          <p className="type-warning mb-4 rounded-2xl border border-happy-orange/25 bg-happy-orange/10 p-4 text-happy-orange">
            Duke lexuar dashboard-in...
          </p>
        ) : message ? (
          <p className="type-warning mb-4 rounded-2xl border border-happy-orange/25 bg-happy-orange/10 p-4 text-happy-orange">
            {message}
          </p>
        ) : null}
        {dashboard?.rider.isDebitBlocked ? (
          <p className="type-warning mb-4 rounded-2xl border border-red-400/30 bg-red-500/12 p-4 text-red-100">
            Debiti ndaj platformes ka arritur{" "}
            {formatLek(dashboard.rider.platformDue)}. Porosite e reja bllokohen
            deri ne shlyerje.
          </p>
        ) : null}

        <section className="rider-panel overflow-hidden rounded-3xl border shadow-happy">
          <div className="relative min-h-64 p-5 md:p-6">
            <img
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-[0.42]"
              src="/catalog/courier-bike.webp"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-black/96 via-black/82 to-black/58" />
            <div className="relative flex min-h-52 flex-col justify-between gap-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="type-badge uppercase tracking-wide text-happy-orange">
                    Panel operimi
                  </p>
                  <h1 className="type-screen-title mt-2">
                    {dashboard?.rider.name ?? "Motorist"}
                  </h1>
                  <p className="type-body mt-2 max-w-xl text-white/80">
                    Kalo online, merr porosite me te aferta, prano vetem nje
                    here dhe ndiq dorezimin deri ne mbyllje.
                  </p>
                  <div className="mt-4 flex max-w-2xl items-start gap-3 rounded-2xl border border-white/18 bg-black/55 p-4 shadow-happy backdrop-blur">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-happy-orange" />
                    <div className="min-w-0">
                      <p className="type-badge uppercase text-white/58">
                        Vendndodhja aktuale
                      </p>
                      <p className="type-body mt-1 text-white">
                        {currentAddress}
                      </p>
                      {currentGps ? (
                        <p className="type-secondary mt-1 text-white/48">
                          GPS live: {currentGps.lat.toFixed(5)},{" "}
                          {currentGps.lng.toFixed(5)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
                <span
                  className={`type-badge rounded-full px-3 py-2 ${
                    dashboard?.rider.isOnline
                      ? "bg-happy-orange text-white"
                      : "bg-white/10 text-white/58"
                  }`}
                >
                  {dashboard?.rider.isOnline ? "ONLINE" : "OFFLINE"}
                </span>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric
                    icon={PackageCheck}
                    label="Sot"
                    value={`${dashboard?.metrics.todayDeliveries ?? 0} porosi`}
                  />
                  <Metric
                    icon={WalletCards}
                    label="Fitime sot"
                    value={formatLek(dashboard?.metrics.todayEarnings ?? 0)}
                  />
                  <Metric
                    icon={ShieldCheck}
                    label="Debit platforme"
                    value={formatLek(dashboard?.rider.platformDue ?? 0)}
                  />
                </div>
                <button
                  className={`type-cta flex h-full min-h-16 items-center justify-center rounded-2xl transition ${
                    dashboard?.rider.isOnline
                      ? "bg-white text-happy-black"
                      : "bg-happy-orange text-white happy-pill-shadow"
                  }`}
                  disabled={
                    busy ||
                    !dashboard ||
                    (!dashboard.rider.isOnline &&
                      dashboard.rider.isDebitBlocked)
                  }
                  onClick={toggleOnline}
                  type="button"
                >
                  <Power className="mr-2 h-5 w-5" />
                  {dashboard?.rider.isOnline ? "Kalo Offline" : "Kalo Online"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 space-y-5">
          <RiderOrderTable
            emptyText={
              dashboard?.rider.isOnline
                ? "Nuk ka oferta të reja afër teje për momentin."
                : "Kalo online që të marrësh oferta të reja."
            }
            kicker="Oferta të reja"
            onAccept={accept}
            onReject={reject}
            orders={dashboard?.pendingOffers ?? []}
            showActions
            title="Në pritje"
            busy={busy}
          />

          <RiderOrderTable
            emptyText="Nuk ke porosi aktive në dorëzim."
            kicker="Live"
            orders={activeOrders}
            title="Në dorëzim"
            busy={busy}
          />

          <RiderOrderTable
            emptyText="Nuk ke ende porosi të përfunduara."
            kicker="Historia"
            orders={dashboard?.recentOrders ?? []}
            title="Të përfunduara"
            busy={busy}
          />
        </section>
      </section>

      <RiderBottomNav />
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Route;
  label: string;
  value: string;
}) {
  return (
    <article className="rider-hero-metric rounded-2xl border p-4">
      <Icon className="h-5 w-5 text-happy-orange" />
      <p className="type-badge mt-4 uppercase text-white/72">{label}</p>
      <strong className="type-price mt-1 block text-white">{value}</strong>
    </article>
  );
}

function RiderOrderTable({
  kicker,
  title,
  orders,
  emptyText,
  showActions = false,
  busy,
  onAccept,
  onReject,
}: {
  kicker: string;
  title: string;
  orders: RiderOrder[];
  emptyText: string;
  showActions?: boolean;
  busy: boolean;
  onAccept?: (order: RiderOrder) => void;
  onReject?: (order: RiderOrder) => void;
}) {
  return (
    <section className="rider-panel rounded-3xl border p-5 shadow-happy">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="type-badge uppercase tracking-wide text-happy-orange">
            {kicker}
          </p>
          <h2 className="type-section-title mt-1">{title}</h2>
        </div>
        <span className="type-secondary text-white/45">
          {orders.length} porosi
        </span>
      </div>

      {orders.length ? (
        <>
          <div className="mt-4 grid gap-3 md:hidden">
            {orders.map((order) => (
              <RiderOrderMobileCard
                busy={busy}
                key={order.id}
                onAccept={onAccept}
                onReject={onReject}
                order={order}
                showActions={showActions}
              />
            ))}
          </div>
          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-white/10 md:block">
            <table className="w-full min-w-[860px] table-fixed border-collapse">
              <thead className="bg-white/[0.06] text-left">
                <tr className="type-badge uppercase tracking-wide text-white/42">
                  <th className="w-[118px] px-4 py-3 font-semibold">Kodi</th>
                  <th className="w-[160px] px-4 py-3 font-semibold">Biznesi</th>
                  <th className="px-4 py-3 font-semibold">Rruga</th>
                  <th className="w-[160px] px-4 py-3 font-semibold">Klienti</th>
                  <th className="w-[126px] px-4 py-3 text-right font-semibold">
                    Fitimi
                  </th>
                  <th className="w-[140px] px-4 py-3 font-semibold">Statusi</th>
                  {showActions ? (
                    <th className="w-[190px] px-4 py-3 text-right font-semibold">
                      Veprime
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <RiderOrderRow
                    busy={busy}
                    key={order.id}
                    onAccept={onAccept}
                    onReject={onReject}
                    order={order}
                    showActions={showActions}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <EmptyState text={emptyText} />
        </div>
      )}
    </section>
  );
}

function RiderOrderMobileCard({
  order,
  showActions,
  busy,
  onAccept,
  onReject,
}: {
  order: RiderOrder;
  showActions: boolean;
  busy: boolean;
  onAccept?: (order: RiderOrder) => void;
  onReject?: (order: RiderOrder) => void;
}) {
  return (
    <article className="rider-soft rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-badge text-happy-orange">{order.code}</p>
          <h3 className="type-restaurant mt-1 truncate">
            {order.businessName}
          </h3>
          <p className="type-secondary mt-1 truncate text-white/42">
            {order.businessPhone ?? "Pa telefon"}
          </p>
        </div>
        <span
          className={`type-badge shrink-0 rounded-full px-3 py-1.5 ${statusClass(order.status)}`}
        >
          {statusLabel(order.status)}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        <p className="type-secondary line-clamp-2 text-white/58">
          <Bike className="mr-1 inline h-3.5 w-3.5 text-happy-orange" />
          {order.pickupAddress}
        </p>
        <p className="type-secondary line-clamp-2 text-white/42">
          <MapPin className="mr-1 inline h-3.5 w-3.5 text-happy-orange" />
          {order.dropoffAddress}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MobileMoney label="Fitimi 80%" value={order.riderEarning} />
        <MobileMoney label="Arketon" value={order.totalAmount} />
      </div>

      {showActions ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="type-cta h-12 rounded-xl border border-white/10 bg-white/5 text-white/70"
            disabled={busy}
            onClick={() => onReject?.(order)}
            type="button"
          >
            Refuzo
          </button>
          <button
            className="type-cta h-12 rounded-xl bg-happy-orange text-white"
            disabled={busy}
            onClick={() => onAccept?.(order)}
            type="button"
          >
            Prano
          </button>
        </div>
      ) : null}
    </article>
  );
}

function MobileMoney({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-black/18 p-3">
      <p className="type-badge uppercase text-white/38">{label}</p>
      <strong className="type-price mt-1 block">{formatLek(value)}</strong>
    </div>
  );
}

function RiderOrderRow({
  order,
  showActions,
  busy,
  onAccept,
  onReject,
}: {
  order: RiderOrder;
  showActions: boolean;
  busy: boolean;
  onAccept?: (order: RiderOrder) => void;
  onReject?: (order: RiderOrder) => void;
}) {
  return (
    <tr className="border-t border-white/10 align-top text-white/76">
      <td className="px-4 py-4">
        <p className="type-badge text-happy-orange">{order.code}</p>
        <p className="type-secondary mt-1 text-white/38">
          {formatDate(order.createdAt)}
        </p>
      </td>
      <td className="px-4 py-4">
        <p className="type-product truncate">{order.businessName}</p>
        <p className="type-secondary mt-1 truncate text-white/42">
          {order.businessPhone ?? "Pa telefon"}
        </p>
      </td>
      <td className="px-4 py-4">
        <p className="type-secondary line-clamp-1 text-white/58">
          <Bike className="mr-1 inline h-3.5 w-3.5 text-happy-orange" />
          {order.pickupAddress}
        </p>
        <p className="type-secondary mt-1 line-clamp-1 text-white/42">
          <MapPin className="mr-1 inline h-3.5 w-3.5 text-happy-orange" />
          {order.dropoffAddress}
        </p>
      </td>
      <td className="px-4 py-4">
        <p className="type-product truncate">
          {order.customerName ?? "Klient"}
        </p>
        <p className="type-secondary mt-1 truncate text-white/42">
          {order.customerPhone ?? "Pa telefon"}
        </p>
      </td>
      <td className="px-4 py-4 text-right">
        <strong className="type-price text-happy-orange">
          {formatLek(order.riderEarning)}
        </strong>
        <p className="type-secondary mt-1 text-white/38">
          Total {formatLek(order.totalAmount)}
        </p>
      </td>
      <td className="px-4 py-4">
        <span
          className={`type-badge inline-flex rounded-full px-3 py-1.5 ${statusClass(order.status)}`}
        >
          {statusLabel(order.status)}
        </span>
      </td>
      {showActions ? (
        <td className="px-4 py-4">
          <div className="flex justify-end gap-2">
            <button
              className="type-cta inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/5 px-3 text-white/70"
              disabled={busy}
              onClick={() => onReject?.(order)}
              type="button"
            >
              <X className="mr-1.5 h-4 w-4" />
              Refuzo
            </button>
            <button
              className="type-cta inline-flex h-10 items-center rounded-xl bg-happy-orange px-3 text-white"
              disabled={busy}
              onClick={() => onAccept?.(order)}
              type="button"
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Prano
            </button>
          </div>
        </td>
      ) : null}
    </tr>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    OFFERED: "E re",
    ACCEPTED: "Pranuar",
    PICKED_UP: "Marrë",
    DELIVERED: "Dorëzuar",
    CANCELLED: "Anuluar",
  };
  return labels[status] ?? status;
}

function statusClass(status: string) {
  if (status === "DELIVERED") return "bg-emerald-400/14 text-emerald-200";
  if (status === "CANCELLED") return "bg-white/8 text-white/42";
  if (status === "ACCEPTED" || status === "PICKED_UP")
    return "bg-happy-orange/18 text-happy-orange";
  return "bg-white/10 text-white/62";
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("sq-AL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center">
      <Clock3 className="mx-auto h-8 w-8 text-happy-orange" />
      <p className="type-body mt-3 text-white/45">{text}</p>
    </div>
  );
}
