"use client";

import {
  BadgeDollarSign,
  LayoutDashboard,
  History,
  BellRing,
  Calculator,
  Clock3,
  Link2,
  MapPin,
  PackagePlus,
  Phone,
  Plus,
  Search,
  Send,
  Store,
  Truck,
  User,
  WalletCards,
  X,
} from "lucide-react";
import {
  OperationsShell,
  OperationsMetric,
  OperationsSearch,
} from "../../shared/operations-shell";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { BusinessRouteMap } from "../components/business-route-map";
import {
  BusinessApiError,
  createBusinessOrder,
  formatLek,
  getBusinessDashboard,
  getOrderingWindow,
  logoutBusiness,
  quoteBusinessOrder,
  searchAddresses,
  type AddressSuggestion,
  type BusinessDashboard,
  type BusinessOrder,
  type BusinessOrderQuote,
} from "../lib/api";
import { getBusinessSession } from "../lib/business-session";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function BusinessHome() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<BusinessDashboard | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState("orders");
  const [query, setQuery] = useState("");
  const [orderFilter, setOrderFilter] = useState("all");

  useEffect(() => {
    function readView() {
      const next = new URLSearchParams(window.location.search).get("view");
      setView(
        next && ["orders", "new", "history"].includes(next) ? next : "orders",
      );
    }
    readView();
    window.addEventListener("popstate", readView);
    return () => window.removeEventListener("popstate", readView);
  }, []);

  function navigateView(next: string) {
    setView(next);
    setQuery("");
    setOrderFilter("all");
    window.history.pushState(
      null,
      "",
      next === "orders" ? basePath || "/" : `${basePath}/?view=${next}`,
    );
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const [addressSuggestions, setAddressSuggestions] = useState<
    AddressSuggestion[]
  >([]);
  const [addressOpen, setAddressOpen] = useState(false);
  const [orderForm, setOrderForm] = useState({
    customerName: "",
    customerPhone: "",
    addressText: "",
    lat: "",
    lng: "",
    googleMapsUrl: "",
    readyMinutes: "10",
    transportFeeOverride: "",
    products: [{ name: "", price: "" }],
    productDescription: "",
  });
  const [orderQuote, setOrderQuote] = useState<BusinessOrderQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const quoteRequest = useRef(0);
  const [orderingOpen, setOrderingOpen] = useState<boolean | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refreshWindow() {
      try {
        const window = await getOrderingWindow();
        if (stopped) return;
        setOrderingOpen(window.isOpen);
        timer = setTimeout(
          refreshWindow,
          Math.max(1, window.nextCheckInSeconds) * 1000,
        );
      } catch {
        if (stopped) return;
        setOrderingOpen(null);
        timer = setTimeout(refreshWindow, 10000);
      }
    }
    void refreshWindow();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const session = getBusinessSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    refreshDashboard();
  }, [router]);

  useEffect(() => {
    const session = getBusinessSession();
    if (!session) return;

    const socket = io(apiBaseUrl);
    socket.emit("business.join", session.id);
    socket.on("order.created", refreshDashboard);
    socket.on("order.offered", refreshDashboard);
    socket.on("order.accepted", refreshDashboard);
    socket.on("order.status_changed", refreshDashboard);

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const query = orderForm.addressText.trim();
    if (query.length < 2) {
      setAddressSuggestions([]);
      return;
    }

    const timeout = window.setTimeout(() => {
      searchAddresses(query)
        .then((data) => setAddressSuggestions(data.suggestions))
        .catch(() => setAddressSuggestions([]));
    }, 240);

    return () => window.clearTimeout(timeout);
  }, [orderForm.addressText]);

  async function refreshDashboard() {
    setLoadingDashboard(true);
    try {
      const data = await getBusinessDashboard();
      setDashboard(data);
      setLoadError(false);
      setMessage("");
    } catch (error) {
      if (error instanceof BusinessApiError && error.status === 401) {
        logoutBusiness();
        router.replace("/login?reason=session-expired");
        return;
      }
      setLoadError(true);
    } finally {
      setLoadingDashboard(false);
    }
  }

  function logout() {
    logoutBusiness();
    router.replace("/login");
  }

  const waitingOrders = useMemo(
    () =>
      dashboard?.orders.filter((order) =>
        ["CREATED", "OFFERED"].includes(order.status),
      ) ?? [],
    [dashboard?.orders],
  );
  const activeOrders = useMemo(
    () =>
      dashboard?.orders.filter((order) =>
        ["ACCEPTED", "PICKED_UP"].includes(order.status),
      ) ?? [],
    [dashboard?.orders],
  );
  const completedOrders = useMemo(
    () =>
      dashboard?.orders.filter((order) =>
        ["DELIVERED", "CANCELLED"].includes(order.status),
      ) ?? [],
    [dashboard?.orders],
  );
  const productSubtotal = orderForm.products.reduce(
    (total, product) => total + (Number(product.price) || 0),
    0,
  );

  function invalidateQuote() {
    quoteRequest.current++;
    setOrderQuote(null);
    setQuoteLoading(false);
  }

  function selectAddress(address: AddressSuggestion) {
    setOrderForm((current) => ({
      ...current,
      addressText: address.details || `${address.label}, ${address.city}`,
      googleMapsUrl: "",
      lat: String(address.lat),
      lng: String(address.lng),
    }));
    invalidateQuote();
    setAddressOpen(false);
  }

  function orderApiMessage(error: unknown, fallback: string) {
    if (!(error instanceof BusinessApiError)) return fallback;
    if (error.code === "GOOGLE_DIRECTIONS_API_KEY_REQUIRED") {
      return "Llogaritja e transportit nuk është e disponueshme. Kontakto administratorin për ndihmë.";
    }
    if (error.code === "GOOGLE_DIRECTIONS_SERVICE_DISABLED") {
      return "Llogaritja e transportit nuk është e disponueshme. Kontakto administratorin për ndihmë.";
    }
    if (error.code === "GOOGLE_DIRECTIONS_REQUEST_DENIED") {
      return "Llogaritja e transportit nuk është e disponueshme. Kontakto administratorin për ndihmë.";
    }
    if (
      error.code === "GOOGLE_DIRECTIONS_OVER_DAILY_LIMIT" ||
      error.code === "GOOGLE_DIRECTIONS_OVER_QUERY_LIMIT"
    ) {
      return "Llogaritja e transportit është përkohësisht e padisponueshme. Provo përsëri pas pak.";
    }
    if (
      error.code === "GOOGLE_DIRECTIONS_ZERO_RESULTS" ||
      error.code === "GOOGLE_DIRECTIONS_ROUTE_NOT_FOUND"
    ) {
      return "Nuk u gjet rrugë drejt këtij destinacioni. Kontrollo adresën ose linkun e Google Maps.";
    }
    if (error.code.startsWith("GOOGLE_DIRECTIONS_")) {
      return "Itinerari nuk u llogarit. Provo përsëri pas pak.";
    }
    if (error.code === "ORDERING_CLOSED") {
      setOrderingOpen(false);
      return "Porosite pranohen nga 07:00 deri ne 22:59, sipas ores se Shqiperise.";
    }
    if (error.code === "TARIFF_ZONE_REQUIRED")
      return "Zona e tarifimit ende nuk eshte percaktuar. Kontakto administratorin.";
    if (error.code === "BUSINESS_OUTSIDE_COVERAGE")
      return "Biznesi eshte jashte zones se mbulimit.";
    if (error.code === "BUSINESS_LOCATION_REQUIRED")
      return "Vendndodhja e biznesit mungon. Kontakto administratorin.";
    if (error.code === "DELIVERY_ZONE_NOT_FOUND") {
      return "Destinacioni është jashtë zonave të dorëzimit. Zgjidh një adresë brenda zonës së shërbimit.";
    }
    if (error.code === "DELIVERY_LOCATION_NOT_RESOLVED") {
      return "Destinacioni nuk u gjet. Zgjidh adresën nga lista ose kontrollo linkun e Google Maps.";
    }
    return fallback;
  }

  async function quoteOrder() {
    invalidateQuote();
    const lat = Number(orderForm.lat);
    const lng = Number(orderForm.lng);
    const hasCoordinates =
      orderForm.lat.trim() !== "" &&
      orderForm.lng.trim() !== "" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng);
    const override = Number(orderForm.transportFeeOverride);
    const hasOverride =
      orderForm.transportFeeOverride.trim() !== "" && Number.isFinite(override);
    if (!orderForm.addressText.trim() && !orderForm.googleMapsUrl.trim()) {
      setMessage("Vendos adresen ose linkun e Google Maps per destinacionin.");
      return;
    }
    if (!hasCoordinates && !orderForm.googleMapsUrl.trim()) {
      setMessage(
        "Zgjidh adresën nga lista e sugjerimeve ose vendos linkun e Google Maps.",
      );
      return;
    }

    const request = quoteRequest.current;
    setQuoteLoading(true);
    setMessage("");
    try {
      const data = await quoteBusinessOrder({
        addressText: orderForm.addressText.trim(),
        lat: hasCoordinates ? lat : undefined,
        lng: hasCoordinates ? lng : undefined,
        googleMapsUrl: orderForm.googleMapsUrl.trim() || undefined,
        transportFeeOverride: hasOverride ? override : undefined,
      });
      if (request !== quoteRequest.current) return;
      setOrderQuote(data.quote);
      setOrderForm((current) => ({
        ...current,
        addressText: data.quote.addressText || current.addressText,
        lat: String(data.quote.lat),
        lng: String(data.quote.lng),
        googleMapsUrl: data.quote.googleMapsUrl ?? current.googleMapsUrl,
      }));
    } catch (error) {
      if (request !== quoteRequest.current) return;
      setOrderQuote(null);
      setMessage(
        orderApiMessage(
          error,
          "Fatura nuk u llogarit. Kontrollo adresën e dorëzimit dhe provo përsëri.",
        ),
      );
    } finally {
      if (request === quoteRequest.current) setQuoteLoading(false);
    }
  }

  async function createOrder() {
    if (busy) return;
    if (orderingOpen !== true) {
      setMessage(
        "Porosite pranohen nga 07:00 deri ne 22:59. Kontrollo orarin dhe provo perseri.",
      );
      return;
    }
    const lat = Number(orderForm.lat);
    const lng = Number(orderForm.lng);
    const readyMinutes =
      orderForm.readyMinutes.trim() === ""
        ? 10
        : Number(orderForm.readyMinutes);
    const override = Number(orderForm.transportFeeOverride);
    const hasOverride =
      orderForm.transportFeeOverride.trim() !== "" && Number.isFinite(override);
    const validProducts = orderForm.products.every(
      (product) =>
        product.name.trim() &&
        Number.isFinite(Number(product.price)) &&
        Number(product.price) > 0,
    );

    if (
      !orderForm.customerName.trim() ||
      !orderForm.customerPhone.trim() ||
      !orderForm.addressText.trim() ||
      !validProducts ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isInteger(readyMinutes) ||
      readyMinutes < 0 ||
      readyMinutes > 180 ||
      productSubtotal <= 0
    ) {
      setMessage(
        "Ploteso produktet me emer dhe cmim mbi 0 leke, bashke me emrin, telefonin dhe lokacionin. Minutat duhet te jene nga 0 deri ne 180.",
      );
      return;
    }
    if (!orderQuote) {
      setMessage("Llogarit faturen e transportit para se te krijosh porosine.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const data = await createBusinessOrder({
        customerName: orderForm.customerName.trim(),
        customerPhone: orderForm.customerPhone.trim(),
        addressText: orderForm.addressText.trim(),
        lat,
        lng,
        googleMapsUrl: orderForm.googleMapsUrl.trim() || undefined,
        readyMinutes,
        transportFeeOverride: hasOverride ? override : undefined,
        items: orderForm.products.map((product) => ({
          name: product.name.trim(),
          price: Number(product.price),
        })),
        productDescription: orderForm.productDescription.trim() || undefined,
      });
      setOrderForm({
        customerName: "",
        customerPhone: "",
        addressText: "",
        lat: "",
        lng: "",
        googleMapsUrl: "",
        readyMinutes: "10",
        transportFeeOverride: "",
        products: [{ name: "", price: "" }],
        productDescription: "",
      });
      invalidateQuote();
      setAddressSuggestions([]);
      await refreshDashboard();
      setMessage(
        data.offeredRiders.length
          ? "Porosia u krijua dhe iu dergua motoristeve."
          : "Porosia u krijua. Njoftimi per motoristet do te dergohet sipas kohes se pergatitjes.",
      );
    } catch (error) {
      setMessage(
        orderApiMessage(
          error,
          "Porosia nuk u krijua. Kontrollo të dhënat e klientit dhe adresën, pastaj provo përsëri.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  const displayedOrders = (
    view === "history"
      ? completedOrders
      : orderFilter === "waiting"
        ? waitingOrders
        : orderFilter === "active"
          ? activeOrders
          : [...waitingOrders, ...activeOrders]
  ).filter((order) =>
    [order.code, order.customerName, order.customerPhone, order.deliveryAddress]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const navigation = [
    { id: "orders", label: "Porosite", icon: LayoutDashboard },
    { id: "new", label: "Porosi e re", icon: PackagePlus },
    { id: "history", label: "Historia", icon: History },
  ];

  return (
    <OperationsShell
      role="Biznes"
      name={dashboard?.business.name ?? "Biznesi"}
      title={
        view === "orders"
          ? (dashboard?.business.name ?? "Pasqyra e biznesit")
          : view === "new"
            ? "Porosi e re"
            : "Historia e porosive"
      }
      active={view}
      items={navigation}
      onNavigate={navigateView}
      onLogout={logout}
      onRefresh={refreshDashboard}
      refreshing={loadingDashboard}
      action={
        view !== "new" ? (
          <button
            className="ops-primary"
            onClick={() => navigateView("new")}
            disabled={!dashboard}
          >
            <Plus size={17} />
            Porosi e re
          </button>
        ) : (
          <button
            className="ops-secondary"
            onClick={() => navigateView("orders")}
          >
            <X size={17} />
            Mbyll formen
          </button>
        )
      }
    >
      <div className="ops-meta">
        <Store size={15} />
        <span>{dashboard?.business.addressText ?? "Paneli i biznesit"}</span>
        {dashboard && (
          <span
            className={`ops-dot ${dashboard.business.status === "ACTIVE" ? "online" : ""}`}
          />
        )}
      </div>
      {loadError && (
        <div className="ops-notice" role="alert">
          <span>
            Nuk u ngarkuan te dhenat e biznesit.
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
      )}
      {message && !loadingDashboard && view !== "new" && (
        <p className="ops-notice" role="status">
          {message}
        </p>
      )}
      {(view === "orders" || view === "history") && (
        <section className="ops-metrics" aria-label="Statistikat e biznesit">
          <OperationsMetric
            icon={BellRing}
            label="Ne pritje"
            value={dashboard ? String(waitingOrders.length) : "--"}
            detail="Ne pritje te motoristit"
            tone="blue"
            loading={loadingDashboard}
          />
          <OperationsMetric
            icon={Truck}
            label="Ne dorezim"
            value={dashboard ? String(activeOrders.length) : "--"}
            detail="Porosi ne transport"
            tone="green"
            loading={loadingDashboard}
          />
          <OperationsMetric
            icon={WalletCards}
            label="Arketuar sot"
            value={
              dashboard
                ? formatLek(dashboard.metrics.productRevenueToday)
                : "--"
            }
            detail="Vlera e produkteve"
            loading={loadingDashboard}
          />
        </section>
      )}
      {loadingDashboard && !dashboard ? (
        <div className="ops-section" role="status">
          Po ngarkohen te dhenat...
        </div>
      ) : !dashboard ? null : (
        <>
          {view === "new" && (
            <div className="ops-section ops-order-form">
              <section className="business-panel rounded-3xl border p-5 shadow-happy">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="type-badge uppercase tracking-wide text-happy-orange">
                      Porosi e re
                    </p>
                    <h2 className="type-section-title mt-1">
                      Krijo porosi për klientin
                    </h2>
                  </div>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-happy-orange/15 text-happy-orange">
                    <Send className="h-5 w-5" />
                  </span>
                </div>

                <form
                  className="mt-5 grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createOrder();
                  }}
                >
                  {orderingOpen !== true && (
                    <p className="ops-notice" role="status">
                      {orderingOpen === null
                        ? "Po verifikohet orari i porosive..."
                        : "Porosite pranohen nga 07:00 deri ne 22:59 (ora e Shqiperise)."}
                    </p>
                  )}
                  <fieldset disabled={busy} className="contents">
                    <div className="grid gap-3 md:grid-cols-2">
                      <IconField
                        icon={User}
                        label="Emri i klientit *"
                        required
                        onChange={(value) =>
                          setOrderForm((current) => ({
                            ...current,
                            customerName: value,
                          }))
                        }
                        placeholder="P.sh. Ardit Hoxha"
                        value={orderForm.customerName}
                      />
                      <IconField
                        icon={Phone}
                        label="Telefoni i klientit *"
                        required
                        type="tel"
                        onChange={(value) =>
                          setOrderForm((current) => ({
                            ...current,
                            customerPhone: value,
                          }))
                        }
                        placeholder="+355 69 ..."
                        value={orderForm.customerPhone}
                      />
                    </div>

                    <AddressField
                      onChange={(value) => {
                        setAddressOpen(true);
                        invalidateQuote();
                        setOrderForm((current) => ({
                          ...current,
                          addressText: value,
                          lat: "",
                          lng: "",
                        }));
                      }}
                      onSelect={selectAddress}
                      open={addressOpen}
                      suggestions={addressSuggestions}
                      value={orderForm.addressText}
                    />

                    <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                      <label className="type-input block">
                        Link Google Maps i destinacionit
                        <span className="business-soft mt-2 flex h-12 items-center rounded-xl border px-3">
                          <Link2 className="mr-3 h-5 w-5 text-happy-orange" />
                          <input
                            className="w-full bg-transparent outline-none placeholder:text-white/35"
                            onChange={(event) => {
                              invalidateQuote();
                              setOrderForm((current) => ({
                                ...current,
                                googleMapsUrl: event.target.value,
                                lat: "",
                                lng: "",
                                addressText: "",
                              }));
                            }}
                            placeholder="https://maps.app.goo.gl/..."
                            value={orderForm.googleMapsUrl}
                          />
                        </span>
                      </label>
                      <label className="type-input block">
                        Gati për minuta (opsionale)
                        <span className="business-soft mt-2 flex h-12 items-center rounded-xl border px-3">
                          <Clock3 className="mr-3 h-5 w-5 text-happy-orange" />
                          <input
                            className="w-full bg-transparent outline-none placeholder:text-white/35"
                            min={0}
                            max={180}
                            onChange={(event) =>
                              setOrderForm((current) => ({
                                ...current,
                                readyMinutes: event.target.value,
                              }))
                            }
                            placeholder="10"
                            type="number"
                            value={orderForm.readyMinutes}
                          />
                        </span>
                      </label>
                    </div>

                    <section className="business-soft rounded-2xl border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="type-product">Produktet dhe çmimet *</p>
                          <p className="type-secondary mt-1 text-white/48">
                            Shto çdo produkt veçmas; totali llogaritet
                            automatikisht.
                          </p>
                        </div>
                        <button
                          aria-label="Shto produkt"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-happy-orange text-white happy-pill-shadow"
                          onClick={() =>
                            setOrderForm((current) => ({
                              ...current,
                              products: [
                                ...current.products,
                                { name: "", price: "" },
                              ],
                            }))
                          }
                          title="Shto produkt"
                          type="button"
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3">
                        {orderForm.products.map((product, index) => (
                          <div
                            className="grid gap-3 md:grid-cols-[1fr_180px_auto]"
                            key={index}
                          >
                            <label className="type-input block">
                              Produkti {index + 1}
                              <span className="business-soft mt-2 flex h-12 items-center rounded-xl border px-3">
                                <PackagePlus className="mr-3 h-5 w-5 text-happy-orange" />
                                <input
                                  className="w-full bg-transparent outline-none placeholder:text-white/35"
                                  maxLength={200}
                                  onChange={(event) =>
                                    setOrderForm((current) => ({
                                      ...current,
                                      products: current.products.map(
                                        (item, itemIndex) =>
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                name: event.target.value,
                                              }
                                            : item,
                                      ),
                                    }))
                                  }
                                  placeholder="P.sh. Pako ushqimore"
                                  required
                                  value={product.name}
                                />
                              </span>
                            </label>
                            <label className="type-input block">
                              Çmimi (ALL)
                              <input
                                className="business-input mt-2 h-12 w-full rounded-xl border px-3"
                                min="0.01"
                                max="9999999"
                                onChange={(event) =>
                                  setOrderForm((current) => ({
                                    ...current,
                                    products: current.products.map(
                                      (item, itemIndex) =>
                                        itemIndex === index
                                          ? {
                                              ...item,
                                              price: event.target.value,
                                            }
                                          : item,
                                    ),
                                  }))
                                }
                                placeholder="P.sh. 1500"
                                required
                                step="0.01"
                                type="number"
                                value={product.price}
                              />
                            </label>
                            {orderForm.products.length > 1 ? (
                              <button
                                aria-label={`Hiq produktin ${index + 1}`}
                                className="mt-8 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 text-white/60 hover:border-red-300/50 hover:text-red-200"
                                onClick={() =>
                                  setOrderForm((current) => ({
                                    ...current,
                                    products: current.products.filter(
                                      (_, itemIndex) => itemIndex !== index,
                                    ),
                                  }))
                                }
                                title="Hiq produktin"
                                type="button"
                              >
                                <X className="h-5 w-5" />
                              </button>
                            ) : (
                              <span />
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                    <label className="type-input block">
                      Pershkrimi (opsional)
                      <textarea
                        className="business-input mt-2 min-h-24 w-full rounded-lg border p-3"
                        maxLength={2000}
                        value={orderForm.productDescription}
                        onChange={(event) =>
                          setOrderForm((current) => ({
                            ...current,
                            productDescription: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <div className="ops-quote grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                      <div>
                        <p className="type-product">
                          Vlera e mallit: {formatLek(productSubtotal)}
                        </p>
                        {orderQuote ? (
                          <div
                            className="mt-3 grid gap-2 sm:grid-cols-2"
                            aria-live="polite"
                          >
                            <QuotePill
                              label="Distanca"
                              value={`${orderQuote.distanceKm.toFixed(3)} km`}
                            />
                            <QuotePill
                              label="Jashte Zones 1"
                              value={
                                orderQuote.ringSurchargeApplied
                                  ? formatLek(orderQuote.ringSurchargeFee)
                                  : "Jo"
                              }
                            />
                            <QuotePill
                              label="Tarifa baze"
                              value={formatLek(orderQuote.baseFee)}
                            />
                            <QuotePill
                              label="Metra mbi 3 km"
                              value={formatLek(orderQuote.extraDistanceFee)}
                            />
                            <QuotePill
                              label="Transport i llogaritur"
                              value={formatLek(
                                orderQuote.calculatedTransportFee,
                              )}
                            />
                            <QuotePill
                              label={
                                orderQuote.transportFeeOverridden
                                  ? "Transport i ndryshuar"
                                  : "Transport"
                              }
                              value={formatLek(orderQuote.finalTransportFee)}
                            />
                            <QuotePill
                              label="Totali për pagesë"
                              value={formatLek(
                                productSubtotal + orderQuote.finalTransportFee,
                              )}
                            />
                          </div>
                        ) : (
                          <p className="type-secondary mt-1 text-white/48">
                            Transporti ende nuk eshte llogaritur.
                          </p>
                        )}
                        <label className="type-input mt-3 block max-w-xs">
                          Ndrysho tarifën manualisht
                          <span className="mt-2 flex h-11 items-center rounded-xl border border-white/10 bg-black/18 px-3">
                            <BadgeDollarSign className="mr-3 h-5 w-5 text-happy-orange" />
                            <input
                              className="w-full bg-transparent outline-none placeholder:text-white/35"
                              onChange={(event) => {
                                invalidateQuote();
                                setOrderForm((current) => ({
                                  ...current,
                                  transportFeeOverride: event.target.value,
                                }));
                              }}
                              placeholder="Opsionale"
                              min="0"
                              max="9999999"
                              step="0.01"
                              type="number"
                              value={orderForm.transportFeeOverride}
                            />
                          </span>
                        </label>
                      </div>
                      <div className="grid gap-2">
                        <button
                          className="type-cta flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/8 px-5 text-white disabled:opacity-55"
                          disabled={busy || quoteLoading}
                          onClick={quoteOrder}
                          type="button"
                        >
                          <Calculator className="mr-2 h-5 w-5" />
                          {quoteLoading ? "Po llogaritet" : "Llogarit faturën"}
                        </button>
                        <button
                          className="type-cta flex h-12 items-center justify-center rounded-xl bg-happy-orange px-5 text-white happy-pill-shadow disabled:opacity-55"
                          disabled={
                            busy ||
                            quoteLoading ||
                            !orderQuote ||
                            productSubtotal <= 0 ||
                            orderingOpen !== true
                          }
                          type="submit"
                        >
                          <Send className="mr-2 h-5 w-5" />
                          Krijo porosi
                        </button>
                      </div>
                    </div>

                    {message && (
                      <p className="ops-notice" role="alert">
                        {message}
                      </p>
                    )}

                    {dashboard ? (
                      <BusinessRouteMap
                        business={dashboard.business}
                        quote={orderQuote}
                      />
                    ) : null}
                  </fieldset>
                </form>
              </section>
            </div>
          )}
          {(view === "orders" || view === "history") && (
            <section className="ops-section">
              <div className="ops-section-heading">
                <h2>
                  {view === "history"
                    ? "Porosite e perfunduara"
                    : "Porosite aktive"}
                </h2>
                <span>{displayedOrders.length} porosi</span>
              </div>
              <div className="ops-toolbar">
                {view === "orders" ? (
                  <div
                    className="ops-segments"
                    role="group"
                    aria-label="Filtro porosite"
                  >
                    {[
                      { id: "all", label: "Te gjitha" },
                      { id: "waiting", label: "Ne pritje" },
                      { id: "active", label: "Ne dorezim" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        aria-pressed={orderFilter === item.id}
                        onClick={() => setOrderFilter(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="ops-subtle">
                    Te dorezuara dhe te anuluara
                  </span>
                )}
                <OperationsSearch value={query} onChange={setQuery} />
              </div>
              <OrderTable
                emptyText={
                  query
                    ? "Asnje porosi nuk perputhet me kerkimin."
                    : "Nuk ka porosi ne kete liste."
                }
                kicker=""
                orders={displayedOrders}
                title=""
              />
              {query && (
                <button className="ops-link" onClick={() => setQuery("")}>
                  Pastro kerkimin
                </button>
              )}
            </section>
          )}
        </>
      )}
    </OperationsShell>
  );
}

function IconField({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = "text",
}: {
  required?: boolean;
  type?: string;
  icon: typeof User;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="type-input block">
      {label}
      <span className="business-soft mt-2 flex h-12 items-center rounded-xl border px-3">
        <Icon className="mr-3 h-5 w-5 text-happy-orange" />
        <input
          className="w-full bg-transparent outline-none placeholder:text-white/35"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          type={type}
          maxLength={type === "tel" ? 25 : 200}
          value={value}
        />
      </span>
    </label>
  );
}

function QuotePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="ops-money">
      <p className="type-badge uppercase text-white/38">{label}</p>
      <strong className="type-price mt-1 block text-white">{value}</strong>
    </div>
  );
}

function AddressField({
  value,
  open,
  suggestions,
  onChange,
  onSelect,
}: {
  value: string;
  open: boolean;
  suggestions: AddressSuggestion[];
  onChange: (value: string) => void;
  onSelect: (address: AddressSuggestion) => void;
}) {
  return (
    <label className="type-input relative block">
      Adresa e dorëzimit
      <span className="business-soft mt-2 flex h-12 items-center rounded-xl border px-3">
        <Search className="mr-3 h-5 w-5 text-happy-orange" />
        <input
          className="w-full bg-transparent outline-none placeholder:text-white/35"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Shkruaj rrugën ose zonën"
          value={value}
        />
      </span>
      {open && suggestions.length ? (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-72 overflow-auto rounded-2xl border border-white/10 bg-[#151515] p-2 shadow-2xl">
          {suggestions.map((suggestion) => (
            <button
              className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/8"
              key={suggestion.id}
              onClick={() => onSelect(suggestion)}
              type="button"
            >
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-happy-orange" />
              <span>
                <span className="type-product block">{suggestion.label}</span>
                <span className="type-secondary block text-white/48">
                  {suggestion.details ||
                    `${suggestion.area}, ${suggestion.city}`}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

function OrderTable({
  kicker,
  title,
  orders,
  emptyText,
}: {
  kicker: string;
  title: string;
  orders: BusinessOrder[];
  emptyText: string;
}) {
  return (
    <section className="business-panel rounded-3xl border p-5 shadow-happy">
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
              <OrderMobileCard key={order.id} order={order} />
            ))}
          </div>
          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-white/10 md:block">
            <table className="w-full min-w-[760px] table-fixed border-collapse">
              <thead className="bg-white/[0.06] text-left">
                <tr className="type-badge uppercase tracking-wide text-white/42">
                  <th className="w-[118px] px-4 py-3 font-semibold">Kodi</th>
                  <th className="w-[150px] px-4 py-3 font-semibold">Klienti</th>
                  <th className="px-4 py-3 font-semibold">Adresa</th>
                  <th className="w-[170px] px-4 py-3 font-semibold">
                    Produkti
                  </th>
                  <th className="w-[160px] px-4 py-3 font-semibold">
                    Motorristi
                  </th>
                  <th className="w-[120px] px-4 py-3 text-right font-semibold">
                    Totali
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <OrderRow key={order.id} order={order} />
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

function OrderMobileCard({ order }: { order: BusinessOrder }) {
  const offeredText =
    order.status === "OFFERED"
      ? `${order.offeredRiderCount} motorristë njoftuar`
      : "Duke pritur motorrist online";

  return (
    <article className="business-soft rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-badge text-happy-orange">{order.code}</p>
          <h3 className="type-restaurant mt-1 truncate">
            {order.customerName ?? "Klient"}
          </h3>
          <p className="type-secondary mt-1 truncate text-white/42">
            {order.customerPhone ?? "Pa telefon"}
          </p>
        </div>
        <span
          className={`type-badge shrink-0 rounded-full px-3 py-1.5 ${statusClass(order.status)}`}
        >
          {statusLabel(order.status)}
        </span>
      </div>

      <p className="type-secondary mt-3 line-clamp-2 text-white/58">
        {order.deliveryAddress}
      </p>
      <p className="type-secondary mt-2 line-clamp-2 text-white/45">
        {order.productDescription}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MobileMoney label="Produkti" value={order.productValue} />
        <MobileMoney label="Transport" value={order.transportFee} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="type-secondary min-w-0 truncate text-white/45">
          {order.riderName ?? offeredText}
        </p>
        <strong className="type-price shrink-0 text-happy-orange">
          {formatLek(order.totalAmount)}
        </strong>
      </div>
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

function OrderRow({ order }: { order: BusinessOrder }) {
  const offeredText =
    order.status === "OFFERED"
      ? `${order.offeredRiderCount} motorristë njoftuar`
      : "Duke pritur motorrist online";

  return (
    <tr className="border-t border-white/10 align-top text-white/76">
      <td className="px-4 py-4">
        <p className="type-badge text-happy-orange">{order.code}</p>
        <p className="type-secondary mt-1 text-white/38">
          {formatDate(order.createdAt)}
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
      <td className="px-4 py-4">
        <p className="type-secondary line-clamp-2 text-white/58">
          {order.deliveryAddress}
        </p>
      </td>
      <td className="px-4 py-4">
        <p className="type-secondary line-clamp-2 text-white/58">
          {order.productDescription}
        </p>
        <p className="type-secondary mt-1 text-white/38">
          Produkt {formatLek(order.productValue)}
        </p>
      </td>
      <td className="px-4 py-4">
        <p className="type-secondary truncate text-white/58">
          {order.riderName ?? offeredText}
        </p>
        <span
          className={`type-badge mt-2 inline-flex rounded-full px-3 py-1.5 ${statusClass(order.status)}`}
        >
          {statusLabel(order.status)}
        </span>
      </td>
      <td className="px-4 py-4 text-right">
        <strong className="type-price text-happy-orange">
          {formatLek(order.totalAmount)}
        </strong>
        <p className="type-secondary mt-1 text-white/38">
          Transport {formatLek(order.transportFee)}
        </p>
      </td>
    </tr>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    CREATED: "Në pritje",
    OFFERED: "U njoftuan",
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
      <p className="type-body text-white/45">{text}</p>
    </div>
  );
}
