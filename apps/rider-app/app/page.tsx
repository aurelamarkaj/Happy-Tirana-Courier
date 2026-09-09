"use client";

import {
  Bike,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MapPin,
  PackageCheck,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import {
  OperationsShell,
  OperationsMetric,
  OperationsSearch,
} from "../../shared/operations-shell";
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
import { riderNavigation } from "../components/rider-navigation";
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
  const [loadError, setLoadError] = useState(false);
  const [orderView, setOrderView] = useState("offers");
  const [query, setQuery] = useState("");

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
    setLoadingDashboard(true);
    try {
      const data = await getRiderDashboard();
      setDashboard(data);
      setLoadError(false);
      setMessage("");
    } catch (error) {
      if (error instanceof RiderApiError && error.status === 401) {
        logoutRider();
        router.replace("/login?reason=session-expired");
        return;
      }

      setLoadError(true);
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
      await refreshDashboard();
      setMessage("Porosia u mor nga dikush tjeter ose oferta skadoi.");
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

  const displayedOrders = (
    orderView === "offers"
      ? (dashboard?.pendingOffers ?? [])
      : orderView === "active"
        ? activeOrders
        : (dashboard?.recentOrders ?? [])
  ).filter((order) =>
    [order.code, order.businessName, order.pickupAddress, order.dropoffAddress]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const debitPercent =
    dashboard && dashboard.rider.debitLimitAll > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (dashboard.rider.platformDue / dashboard.rider.debitLimitAll) * 100,
          ),
        )
      : 0;

  return (
    <OperationsShell
      role="Motorist"
      name={dashboard?.rider.name ?? "Motoristi"}
      title={dashboard?.rider.name ?? "Pasqyra e motoristit"}
      active="dashboard"
      items={riderNavigation}
      onLogout={logout}
      onRefresh={refreshDashboard}
      refreshing={loadingDashboard}
      action={
        <div className="ops-availability">
          <span className="ops-availability-label">
            {busy
              ? "Duke ndryshuar..."
              : dashboard?.rider.isOnline
                ? "Online"
                : "Offline"}
          </span>
          <button
            className="ops-switch"
            role="switch"
            aria-label="Disponueshmeria online"
            aria-checked={dashboard?.rider.isOnline ?? false}
            title={dashboard?.rider.isOnline ? "Kalo offline" : "Kalo online"}
            disabled={
              busy ||
              loadingDashboard ||
              loadError ||
              !dashboard ||
              (!dashboard.rider.isOnline && dashboard.rider.isDebitBlocked)
            }
            onClick={toggleOnline}
          >
            <span />
          </button>
        </div>
      }
    >
      <div className="ops-meta">
        <span
          className={`ops-dot ${dashboard?.rider.isOnline ? "online" : ""}`}
        />
        {dashboard?.rider.isOnline ? "Ne linje per dergesa" : "Jashte linje"}
      </div>
      {loadError ? (
        <div className="ops-notice" role="alert">
          <AlertTriangle size={18} />
          <span>
            Nuk u ngarkuan te dhenat.
            {dashboard ? " Po shfaqen te dhenat e fundit." : ""}
          </span>
          <button
            className="ops-link"
            onClick={refreshDashboard}
            disabled={loadingDashboard}
          >
            Riprovo
          </button>
        </div>
      ) : message ? (
        <p className="ops-notice" role="status">
          {message}
        </p>
      ) : null}
      {dashboard?.rider.isDebitBlocked && (
        <div className="ops-notice is-danger" role="alert">
          <AlertTriangle size={19} />
          <span>
            Debiti ka arritur {formatLek(dashboard.rider.platformDue)}. Ofertat
            e reja jane bllokuar deri ne shlyerje.
          </span>
          <Link className="ops-link" href="/earnings">
            Shiko bilancin
            <ArrowRight size={15} />
          </Link>
        </div>
      )}
      <section className="ops-metrics" aria-label="Statistikat e motoristit">
        <OperationsMetric
          icon={PackageCheck}
          label="Dergesa sot"
          value={dashboard ? String(dashboard.metrics.todayDeliveries) : "--"}
          detail="Porosi te dorezuara"
          tone="blue"
          loading={loadingDashboard}
        />
        <OperationsMetric
          icon={WalletCards}
          label="Fitime sot"
          value={dashboard ? formatLek(dashboard.metrics.todayEarnings) : "--"}
          detail="Pjesa jote e transportit"
          tone="green"
          loading={loadingDashboard}
        />
        <OperationsMetric
          icon={ShieldCheck}
          label="Debit platforme"
          value={dashboard ? formatLek(dashboard.rider.platformDue) : "--"}
          detail="Per t'u shlyer"
          loading={loadingDashboard}
        />
      </section>
      {dashboard?.activeOrder && (
        <section className="ops-delivery-banner">
          <div>
            <strong>Dergesa aktive: {dashboard.activeOrder.code}</strong>
            <p>
              {dashboard.activeOrder.businessName} /{" "}
              {dashboard.activeOrder.dropoffAddress}
            </p>
          </div>
          <Link className="ops-primary" href="/delivery">
            Vazhdo dergesen
            <ArrowRight size={17} />
          </Link>
        </section>
      )}
      <section className="ops-section">
        <div className="ops-section-heading">
          <h2>Porosite e tua</h2>
          <span>{dashboard ? displayedOrders.length : "--"} porosi</span>
        </div>
        <div className="ops-toolbar">
          <div
            className="ops-segments"
            role="group"
            aria-label="Pamja e porosive"
          >
            {[
              { id: "offers", label: "Oferta te reja" },
              { id: "active", label: "Ne dorezim" },
              { id: "history", label: "Historia" },
            ].map((item) => (
              <button
                key={item.id}
                aria-pressed={orderView === item.id}
                onClick={() => {
                  setOrderView(item.id);
                  setQuery("");
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <OperationsSearch value={query} onChange={setQuery} />
        </div>
        {loadingDashboard && !dashboard ? (
          <p role="status">Po ngarkohen porosite...</p>
        ) : dashboard ? (
          <RiderOrderTable
            emptyText={
              query
                ? "Asnje porosi nuk perputhet me kerkimin."
                : orderView === "offers"
                  ? dashboard.rider.isDebitBlocked
                    ? "Ofertat jane bllokuar nga debiti."
                    : dashboard.rider.isOnline
                      ? "Nuk ka oferta te reja per momentin."
                      : "Je offline. Nuk po merr oferta te reja."
                  : "Nuk ka porosi ne kete liste."
            }
            kicker=""
            title=""
            orders={displayedOrders}
            showActions={
              orderView === "offers" && !dashboard.rider.isDebitBlocked
            }
            busy={busy || loadError}
            onAccept={accept}
            onReject={reject}
          />
        ) : null}
        {query && (
          <button className="ops-link" onClick={() => setQuery("")}>
            Pastro kerkimin
          </button>
        )}
      </section>
      <div className="ops-rider-status">
        <section>
          <div className="ops-section-heading">
            <h2>Vendndodhja aktuale</h2>
            <MapPin size={17} />
          </div>
          <div className="ops-location">
            <MapPin size={19} />
            <p>{currentAddress}</p>
          </div>
          {currentGps && (
            <p className="ops-subtle">
              {currentGps.lat.toFixed(5)}, {currentGps.lng.toFixed(5)}
            </p>
          )}
        </section>
        <section>
          <div className="ops-section-heading">
            <h2>Limiti i debitit</h2>
            <Link className="ops-link" href="/earnings">
              Bilanci
              <ArrowRight size={15} />
            </Link>
          </div>
          <div className="ops-debit-row">
            <strong>
              {dashboard ? formatLek(dashboard.rider.platformDue) : "--"}
            </strong>
            <span className="ops-subtle">
              nga {dashboard ? formatLek(dashboard.rider.debitLimitAll) : "--"}
            </span>
          </div>
          <div
            className={`ops-debit-meter ${dashboard?.rider.isDebitBlocked ? "is-blocked" : ""}`}
            role="meter"
            aria-label="Perdorimi i limitit te debitit"
            aria-valuenow={debitPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: debitPercent + "%" }} />
          </div>
        </section>
      </div>
    </OperationsShell>
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
      {title && (
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
      )}

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
                    <th className="w-[220px] px-4 py-3 text-right font-semibold">
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
    <div className="ops-money">
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
