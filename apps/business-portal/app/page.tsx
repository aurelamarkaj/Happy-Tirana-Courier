"use client";

import {
  BadgeDollarSign,
  LayoutDashboard,
  History,
  ArrowRight,
  BellRing,
  Calculator,
  Clock3,
  Minus,
  Link2,
  MapPin,
  PackagePlus,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  Send,
  Store,
  Trash2,
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
import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { BusinessRouteMap } from "../components/business-route-map";
import {
  addBusinessCategory,
  addBusinessProduct,
  BusinessApiError,
  createBusinessOrder,
  editBusinessCategory,
  editBusinessProduct,
  formatLek,
  getBusinessDashboard,
  logoutBusiness,
  quoteBusinessOrder,
  removeBusinessCategory,
  removeBusinessProduct,
  searchAddresses,
  type AddressSuggestion,
  type BusinessCategory,
  type BusinessDashboard,
  type BusinessOrder,
  type BusinessOrderQuote,
  type BusinessProduct,
} from "../lib/api";
import { getBusinessSession } from "../lib/business-session";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const defaultProductImage = "/catalog/product-grocery-basket.webp";

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
        next && ["orders", "new", "catalog", "history"].includes(next)
          ? next
          : "orders",
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
  });
  const [orderQuote, setOrderQuote] = useState<BusinessOrderQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [orderItems, setOrderItems] = useState<Record<string, number>>({});
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    price: "",
    section: "",
  });
  const [categoryForm, setCategoryForm] = useState({ name: "" });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [categoryEditForm, setCategoryEditForm] = useState({ name: "" });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    price: "",
    section: "",
    imageUrl: defaultProductImage,
  });

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
    const firstCategory = dashboard?.categories[0]?.name;
    if (!firstCategory) return;
    setProductForm((current) =>
      current.section ? current : { ...current, section: firstCategory },
    );
  }, [dashboard?.categories]);

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
  const selectedOrderProducts = useMemo(
    () =>
      (dashboard?.products ?? [])
        .map((product) => ({
          product,
          quantity: orderItems[product.id] ?? 0,
        }))
        .filter((item) => item.quantity > 0),
    [dashboard?.products, orderItems],
  );
  const productSubtotal = useMemo(
    () =>
      selectedOrderProducts.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0,
      ),
    [selectedOrderProducts],
  );

  function selectAddress(address: AddressSuggestion) {
    setOrderForm((current) => ({
      ...current,
      addressText: address.details || `${address.label}, ${address.city}`,
      lat: String(address.lat),
      lng: String(address.lng),
    }));
    setOrderQuote(null);
    setAddressOpen(false);
  }

  function changeOrderItem(productId: string, delta: number) {
    setOrderItems((current) => {
      const quantity = Math.max(0, (current[productId] ?? 0) + delta);
      const next = { ...current };
      if (quantity === 0) delete next[productId];
      else next[productId] = quantity;
      return next;
    });
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
    if (error.code === "DELIVERY_ZONE_NOT_FOUND") {
      return "Destinacioni është jashtë zonave të dorëzimit. Zgjidh një adresë brenda zonës së shërbimit.";
    }
    if (error.code === "DELIVERY_LOCATION_NOT_RESOLVED") {
      return "Destinacioni nuk u gjet. Zgjidh adresën nga lista ose kontrollo linkun e Google Maps.";
    }
    return fallback;
  }

  async function quoteOrder() {
    setOrderQuote(null);
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
      setOrderQuote(data.quote);
      setOrderForm((current) => ({
        ...current,
        addressText: data.quote.addressText || current.addressText,
        lat: String(data.quote.lat),
        lng: String(data.quote.lng),
        googleMapsUrl: data.quote.googleMapsUrl ?? current.googleMapsUrl,
      }));
    } catch (error) {
      setOrderQuote(null);
      setMessage(
        orderApiMessage(
          error,
          "Fatura nuk u llogarit. Kontrollo adresën e dorëzimit dhe provo përsëri.",
        ),
      );
    } finally {
      setQuoteLoading(false);
    }
  }

  async function createOrder() {
    const lat = Number(orderForm.lat);
    const lng = Number(orderForm.lng);
    const readyMinutes = Number(orderForm.readyMinutes);
    const override = Number(orderForm.transportFeeOverride);
    const hasOverride =
      orderForm.transportFeeOverride.trim() !== "" && Number.isFinite(override);

    if (
      !orderForm.customerName.trim() ||
      !orderForm.customerPhone.trim() ||
      !orderForm.addressText.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isFinite(readyMinutes) ||
      selectedOrderProducts.length === 0
    ) {
      setMessage(
        "Ploteso klientin, telefonin, adresen, minutat dhe zgjidh te pakten nje produkt.",
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
        items: selectedOrderProducts.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
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
      });
      setOrderItems({});
      setOrderQuote(null);
      setAddressSuggestions([]);
      setMessage(
        data.offeredRiders.length
          ? `Porosia u krijua dhe iu dergua ${data.offeredRiders.length} motorristëve më të afërt.`
          : Number(orderForm.readyMinutes) > 10
            ? "Porosia u krijua. Njoftimi per motorristet do te dergohet pas 1 minute."
            : "Porosia u krijua. Nuk ka motorrist online brenda 1km per momentin.",
      );
      await refreshDashboard();
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

  async function addProduct() {
    const price = Number(productForm.price);
    if (
      !productForm.name.trim() ||
      !Number.isFinite(price) ||
      !productForm.section
    ) {
      setMessage("Vendos emrin, cmimin dhe kategorine e produktit.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      await addBusinessProduct({
        name: productForm.name.trim(),
        description: productForm.description.trim(),
        price,
        section: productForm.section,
        imageUrl: defaultProductImage,
      });
      setProductForm({
        name: "",
        description: "",
        price: "",
        section: dashboard?.categories[0]?.name ?? "",
      });
      await refreshDashboard();
    } catch {
      setMessage("Produkti nuk u shtua. Provo përsëri pas pak.");
    } finally {
      setBusy(false);
    }
  }

  async function addCategory() {
    if (!categoryForm.name.trim()) {
      setMessage("Vendos emrin e kategorise.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const data = await addBusinessCategory({
        name: categoryForm.name.trim(),
      });
      setCategoryForm({ name: "" });
      setProductForm((current) => ({
        ...current,
        section: data.category.name,
      }));
      await refreshDashboard();
    } catch {
      setMessage("Kategoria nuk u shtua. Provo përsëri pas pak.");
    } finally {
      setBusy(false);
    }
  }

  async function removeProduct(productId: string) {
    setBusy(true);
    setMessage("");
    try {
      await removeBusinessProduct(productId);
      await refreshDashboard();
    } catch {
      setMessage("Produkti nuk u hoq. Provo përsëri pas pak.");
    } finally {
      setBusy(false);
    }
  }

  function startEditing(product: BusinessProduct) {
    setEditingProductId(product.id);
    const availableCategory = dashboard?.categories.some(
      (category) => category.name === product.section,
    )
      ? product.section
      : dashboard?.categories[0]?.name;
    setEditForm({
      name: product.name,
      description: product.description ?? "",
      price: String(product.price),
      section: availableCategory ?? "",
      imageUrl: product.imageUrl ?? defaultProductImage,
    });
  }

  function cancelEditing() {
    setEditingProductId(null);
    setEditForm({
      name: "",
      description: "",
      price: "",
      section: "",
      imageUrl: defaultProductImage,
    });
  }

  async function saveProduct(productId: string) {
    const price = Number(editForm.price);
    if (!editForm.name.trim() || !Number.isFinite(price) || !editForm.section) {
      setMessage("Vendos emrin, cmimin dhe kategorine para ruajtjes.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      await editBusinessProduct(productId, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        price,
        section: editForm.section,
        imageUrl: editForm.imageUrl.trim() || defaultProductImage,
      });
      cancelEditing();
      await refreshDashboard();
    } catch {
      setMessage("Produkti nuk u ruajt. Provo përsëri pas pak.");
    } finally {
      setBusy(false);
    }
  }

  function startEditingCategory(category: BusinessCategory) {
    setEditingCategoryId(category.id);
    setCategoryEditForm({ name: category.name });
  }

  function cancelEditingCategory() {
    setEditingCategoryId(null);
    setCategoryEditForm({ name: "" });
  }

  async function saveCategory(categoryId: string) {
    if (!categoryEditForm.name.trim()) {
      setMessage("Vendos emrin para ruajtjes se kategorise.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      await editBusinessCategory(categoryId, {
        name: categoryEditForm.name.trim(),
      });
      cancelEditingCategory();
      await refreshDashboard();
    } catch {
      setMessage("Kategoria nuk u ruajt. Provo përsëri pas pak.");
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(categoryId: string) {
    setBusy(true);
    setMessage("");
    try {
      await removeBusinessCategory(categoryId);
      if (editingCategoryId === categoryId) cancelEditingCategory();
      await refreshDashboard();
    } catch {
      setMessage("Kategoria nuk u hoq. Provo përsëri pas pak.");
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
    { id: "catalog", label: "Katalogu", icon: Store },
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
            : view === "catalog"
              ? "Katalogu i biznesit"
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
                  onSubmit={(event) => event.preventDefault()}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <IconField
                      icon={User}
                      label="Emri i klientit"
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
                      label="Telefoni i klientit"
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
                      setOrderQuote(null);
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
                            setOrderQuote(null);
                            setOrderForm((current) => ({
                              ...current,
                              googleMapsUrl: event.target.value,
                            }));
                          }}
                          placeholder="https://maps.app.goo.gl/..."
                          value={orderForm.googleMapsUrl}
                        />
                      </span>
                    </label>
                    <label className="type-input block">
                      Gati për minuta
                      <span className="business-soft mt-2 flex h-12 items-center rounded-xl border px-3">
                        <Clock3 className="mr-3 h-5 w-5 text-happy-orange" />
                        <input
                          className="w-full bg-transparent outline-none placeholder:text-white/35"
                          min={0}
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

                  <ProductPicker
                    items={orderItems}
                    onChange={changeOrderItem}
                    products={dashboard?.products ?? []}
                    subtotal={productSubtotal}
                  />

                  <div className="ops-quote grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                      <p className="type-product">
                        Subtotal produktesh: {formatLek(productSubtotal)}
                      </p>
                      {orderQuote ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-live="polite">
                          <QuotePill
                            label="Distanca"
                            value={`${orderQuote.distanceKm.toFixed(2)} km`}
                          />
                          <QuotePill
                            label="Shtesë Unaza"
                            value={
                              orderQuote.ringSurchargeApplied
                                ? formatLek(orderQuote.ringSurchargeFee)
                                : "Jo"
                            }
                          />
                          <QuotePill
                            label="Transport"
                            value={formatLek(orderQuote.finalTransportFee)}
                          />
                          <QuotePill
                            label="Totali për pagesë"
                            value={formatLek(productSubtotal + orderQuote.finalTransportFee)}
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
                              setOrderQuote(null);
                              setOrderForm((current) => ({
                                ...current,
                                transportFeeOverride: event.target.value,
                              }));
                            }}
                            placeholder="Opsionale"
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
                          !selectedOrderProducts.length
                        }
                        onClick={createOrder}
                        type="button"
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
          {view === "catalog" && (
            <div className="ops-catalog">
              <MenuManager
                busy={busy}
                categories={dashboard?.categories ?? []}
                categoryEditForm={categoryEditForm}
                categoryForm={categoryForm}
                editForm={editForm}
                editingCategoryId={editingCategoryId}
                editingProductId={editingProductId}
                onAddCategory={addCategory}
                onAddProduct={addProduct}
                onCancelCategory={cancelEditingCategory}
                onCancelProduct={cancelEditing}
                onCategoryEditFormChange={setCategoryEditForm}
                onCategoryFormChange={setCategoryForm}
                onEditCategory={startEditingCategory}
                onEditProduct={startEditing}
                onProductEditFormChange={setEditForm}
                onProductFormChange={setProductForm}
                onRemoveCategory={removeCategory}
                onRemoveProduct={removeProduct}
                onSaveCategory={saveCategory}
                onSaveProduct={saveProduct}
                productForm={productForm}
                products={dashboard?.products ?? []}
              />
            </div>
          )}
          {view === "orders" && (
            <div className="ops-section ops-section-heading">
              <div>
                <h2>Katalogu i biznesit</h2>
                <p className="ops-subtle">
                  {dashboard.products.length} produkte ne{" "}
                  {dashboard.categories.length} kategori
                </p>
              </div>
              <button
                className="ops-link"
                onClick={() => navigateView("catalog")}
              >
                Menaxho katalogun
                <ArrowRight size={15} />
              </button>
            </div>
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
}: {
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

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="type-input block">
      {label}
      <input
        className="business-input mt-2 h-12 w-full rounded-xl border px-3 outline-none focus:border-white/35"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function ProductPicker({
  products,
  items,
  subtotal,
  onChange,
}: {
  products: BusinessProduct[];
  items: Record<string, number>;
  subtotal: number;
  onChange: (productId: string, delta: number) => void;
}) {
  const groupedProducts = products.reduce<Record<string, BusinessProduct[]>>(
    (groups, product) => {
      const key = product.section ?? "Menu";
      return {
        ...groups,
        [key]: [...(groups[key] ?? []), product],
      };
    },
    {},
  );
  const selectedCount = Object.values(items).reduce(
    (sum, quantity) => sum + quantity,
    0,
  );

  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="type-input">Produktet e porosisë</p>
          <p className="type-secondary mt-1 text-white/45">
            {products.length} produkte ne katalog.
          </p>
        </div>
        <span className="type-badge rounded-full bg-white/10 px-3 py-2 text-white/62">
          {selectedCount} artikuj
        </span>
      </div>

      {products.length ? (
        <div className="mt-3 max-h-[360px] space-y-4 overflow-auto pr-1">
          {Object.entries(groupedProducts).map(([section, sectionProducts]) => (
            <div key={section}>
              <p className="type-badge mb-2 uppercase tracking-wide text-white/38">
                {section}
              </p>
              <div className="grid gap-2">
                {sectionProducts.map((product) => {
                  const quantity = items[product.id] ?? 0;
                  return (
                    <article
                      className={`business-soft grid grid-cols-[52px_1fr] items-center gap-3 rounded-2xl border p-3 transition sm:grid-cols-[52px_1fr_auto] ${
                        quantity > 0 ? "border-happy-orange/55" : ""
                      }`}
                      key={product.id}
                    >
                      <img
                        alt={product.name}
                        className="h-[52px] w-[52px] rounded-2xl object-cover"
                        src={product.imageUrl ?? defaultProductImage}
                      />
                      <div className="min-w-0">
                        <h3 className="type-product truncate">
                          {product.name}
                        </h3>
                        <p className="type-secondary truncate text-white/42">
                          {product.description ?? section}
                        </p>
                        <strong className="type-price text-happy-orange">
                          {formatLek(product.price)}
                        </strong>
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
                        {quantity > 0 ? (
                          <button
                            className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70"
                            aria-label={`Hiq nje ${product.name}`}
                            title="Ul sasine"
                            onClick={() => onChange(product.id, -1)}
                            type="button"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                        ) : null}
                        <span className="type-price min-w-5 text-center">
                          {quantity || ""}
                        </span>
                        <button
                          className="grid h-9 w-9 place-items-center rounded-xl bg-happy-orange text-white"
                          aria-label={`Shto nje ${product.name}`}
                          title="Rrit sasine"
                          onClick={() => onChange(product.id, 1)}
                          type="button"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-white/10 p-5 text-center">
          <p className="type-body text-white/45">
            Shto produkte te menuja e biznesit, pastaj zgjidhi këtu për porosi.
          </p>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between rounded-2xl bg-black/18 p-3">
        <span className="type-secondary text-white/48">
          Totali i produkteve
        </span>
        <strong className="type-large-price text-happy-orange">
          {formatLek(subtotal)}
        </strong>
      </div>
    </section>
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

function MenuManager(props: {
  categories: BusinessCategory[];
  products: BusinessProduct[];
  busy: boolean;
  categoryForm: { name: string };
  categoryEditForm: { name: string };
  productForm: {
    name: string;
    description: string;
    price: string;
    section: string;
  };
  editForm: {
    name: string;
    description: string;
    price: string;
    section: string;
    imageUrl: string;
  };
  editingCategoryId: string | null;
  editingProductId: string | null;
  onCategoryFormChange: (form: { name: string }) => void;
  onCategoryEditFormChange: (form: { name: string }) => void;
  onProductFormChange: (form: {
    name: string;
    description: string;
    price: string;
    section: string;
  }) => void;
  onProductEditFormChange: (form: {
    name: string;
    description: string;
    price: string;
    section: string;
    imageUrl: string;
  }) => void;
  onAddCategory: () => void;
  onAddProduct: () => void;
  onEditCategory: (category: BusinessCategory) => void;
  onSaveCategory: (categoryId: string) => void;
  onCancelCategory: () => void;
  onRemoveCategory: (categoryId: string) => void;
  onEditProduct: (product: BusinessProduct) => void;
  onSaveProduct: (productId: string) => void;
  onCancelProduct: () => void;
  onRemoveProduct: (productId: string) => void;
}) {
  return (
    <>
      <section className="business-panel rounded-3xl border p-5 shadow-happy">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="type-badge uppercase tracking-wide text-happy-orange">
              Kategoritë
            </p>
            <h2 className="type-section-title mt-1">Menu e biznesit</h2>
          </div>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-happy-orange/15 text-happy-orange">
            <Store className="h-5 w-5" />
          </span>
        </div>

        <form
          className="mt-5 grid gap-3"
          onSubmit={(event) => event.preventDefault()}
        >
          <Field
            label="Kategori e re"
            onChange={(value) => props.onCategoryFormChange({ name: value })}
            placeholder="P.sh. Dreka"
            value={props.categoryForm.name}
          />
          <button
            className="type-cta flex h-12 items-center justify-center rounded-xl bg-happy-orange text-white happy-pill-shadow"
            disabled={props.busy}
            onClick={props.onAddCategory}
            type="button"
          >
            <Plus className="mr-2 h-5 w-5" />
            Shto kategori
          </button>
        </form>

        <div className="mt-5 space-y-3">
          {props.categories.length ? (
            props.categories.map((category) => (
              <CategoryCard
                busy={props.busy}
                category={category}
                editForm={props.categoryEditForm}
                editing={props.editingCategoryId === category.id}
                key={category.id}
                onCancel={props.onCancelCategory}
                onEdit={() => props.onEditCategory(category)}
                onEditFormChange={props.onCategoryEditFormChange}
                onRemove={() => props.onRemoveCategory(category.id)}
                onSave={() => props.onSaveCategory(category.id)}
              />
            ))
          ) : (
            <EmptyState text="Shto kategorinë e parë për menunë." />
          )}
        </div>
      </section>

      <section className="business-panel rounded-3xl border p-5 shadow-happy">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="type-badge uppercase tracking-wide text-happy-orange">
              Produkte
            </p>
            <h2 className="type-section-title mt-1">Shto produkt</h2>
          </div>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-happy-orange/15 text-happy-orange">
            <PackagePlus className="h-5 w-5" />
          </span>
        </div>

        <form
          className="mt-5 grid gap-3"
          onSubmit={(event) => event.preventDefault()}
        >
          <Field
            label="Emri"
            onChange={(value) =>
              props.onProductFormChange({ ...props.productForm, name: value })
            }
            placeholder="P.sh. Paketë marketi"
            value={props.productForm.name}
          />
          <Field
            label="Përshkrimi"
            onChange={(value) =>
              props.onProductFormChange({
                ...props.productForm,
                description: value,
              })
            }
            placeholder="Detaje të shkurtra"
            value={props.productForm.description}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Çmimi"
              onChange={(value) =>
                props.onProductFormChange({
                  ...props.productForm,
                  price: value,
                })
              }
              placeholder="650"
              value={props.productForm.price}
            />
            <CategorySelect
              categories={props.categories}
              label="Kategoria"
              onChange={(value) =>
                props.onProductFormChange({
                  ...props.productForm,
                  section: value,
                })
              }
              value={props.productForm.section}
            />
          </div>
          <button
            className="type-cta flex h-12 items-center justify-center rounded-xl bg-happy-orange text-white happy-pill-shadow disabled:opacity-55"
            disabled={props.busy || !props.categories.length}
            onClick={props.onAddProduct}
            type="button"
          >
            <Plus className="mr-2 h-5 w-5" />
            Shto produkt
          </button>
        </form>
      </section>

      <section className="business-panel rounded-3xl border p-5 shadow-happy">
        <div className="flex items-end justify-between">
          <div>
            <p className="type-badge uppercase tracking-wide text-happy-orange">
              Lista
            </p>
            <h2 className="type-section-title mt-1">Produkte aktive</h2>
          </div>
          <span className="type-secondary text-white/45">
            {props.products.length}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {props.products.length ? (
            props.products.map((product) => (
              <ProductCard
                busy={props.busy}
                categories={props.categories}
                editForm={props.editForm}
                editing={props.editingProductId === product.id}
                key={product.id}
                onCancel={props.onCancelProduct}
                onEdit={() => props.onEditProduct(product)}
                onEditFormChange={props.onProductEditFormChange}
                onRemove={() => props.onRemoveProduct(product.id)}
                onSave={() => props.onSaveProduct(product.id)}
                product={product}
              />
            ))
          ) : (
            <EmptyState text="Nuk ka produkte aktive." />
          )}
        </div>
      </section>
    </>
  );
}

function CategorySelect({
  label,
  value,
  onChange,
  categories,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  categories: BusinessCategory[];
}) {
  return (
    <label className="type-input block">
      {label}
      <select
        className="business-input mt-2 h-12 w-full rounded-xl border px-3 outline-none focus:border-white/35"
        disabled={categories.length === 0}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {categories.length === 0 ? (
          <option className="bg-[#101010]" value="">
            Shto kategori
          </option>
        ) : null}
        {categories.map((category) => (
          <option
            className="bg-[#101010]"
            key={category.id}
            value={category.name}
          >
            {category.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProductCard({
  product,
  editing,
  editForm,
  categories,
  busy,
  onEdit,
  onSave,
  onCancel,
  onRemove,
  onEditFormChange,
}: {
  product: BusinessProduct;
  editing: boolean;
  editForm: {
    name: string;
    description: string;
    price: string;
    section: string;
    imageUrl: string;
  };
  categories: BusinessCategory[];
  busy: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onEditFormChange: (form: {
    name: string;
    description: string;
    price: string;
    section: string;
    imageUrl: string;
  }) => void;
}) {
  if (editing) {
    return (
      <article className="business-soft rounded-2xl border p-3">
        <div className="grid gap-3">
          <Field
            label="Emri"
            onChange={(value) => onEditFormChange({ ...editForm, name: value })}
            placeholder="Emri i produktit"
            value={editForm.name}
          />
          <Field
            label="Përshkrimi"
            onChange={(value) =>
              onEditFormChange({ ...editForm, description: value })
            }
            placeholder="Përshkrim i shkurtër"
            value={editForm.description}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Çmimi"
              onChange={(value) =>
                onEditFormChange({ ...editForm, price: value })
              }
              placeholder="650"
              value={editForm.price}
            />
            <CategorySelect
              categories={categories}
              label="Kategoria"
              onChange={(value) =>
                onEditFormChange({ ...editForm, section: value })
              }
              value={editForm.section}
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            className="type-cta flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            <X className="mr-2 h-4 w-4" />
            Anulo
          </button>
          <button
            className="type-cta flex h-11 items-center justify-center rounded-xl bg-happy-orange text-white"
            disabled={busy}
            onClick={onSave}
            type="button"
          >
            <Save className="mr-2 h-4 w-4" />
            Ruaj
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="business-soft grid grid-cols-[56px_1fr_auto] items-center gap-3 rounded-2xl border p-3">
      <img
        alt={product.name}
        className="h-14 w-14 rounded-2xl object-cover"
        src={product.imageUrl ?? defaultProductImage}
      />
      <div className="min-w-0">
        <h3 className="type-product truncate">{product.name}</h3>
        <p className="type-secondary truncate text-white/45">
          {product.section ?? "Menu"}
        </p>
        <strong className="type-price text-happy-orange">
          {formatLek(product.price)}
        </strong>
      </div>
      <div className="grid gap-2">
        <IconButton busy={busy} icon={Pencil} onClick={onEdit} />
        <IconButton busy={busy} icon={Trash2} onClick={onRemove} />
      </div>
    </article>
  );
}

function CategoryCard({
  category,
  editing,
  editForm,
  busy,
  onEdit,
  onSave,
  onCancel,
  onRemove,
  onEditFormChange,
}: {
  category: BusinessCategory;
  editing: boolean;
  editForm: { name: string };
  busy: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onEditFormChange: (form: { name: string }) => void;
}) {
  if (editing) {
    return (
      <article className="business-soft rounded-2xl border p-3">
        <Field
          label="Emri"
          onChange={(value) => onEditFormChange({ ...editForm, name: value })}
          placeholder="Emri"
          value={editForm.name}
        />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            className="type-cta flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Anulo
          </button>
          <button
            className="type-cta flex h-11 items-center justify-center rounded-xl bg-happy-orange text-white"
            disabled={busy}
            onClick={onSave}
            type="button"
          >
            Ruaj
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="business-soft flex items-center justify-between gap-3 rounded-2xl border p-3">
      <div className="min-w-0">
        <h3 className="type-product truncate">{category.name}</h3>
        <p className="type-secondary text-white/45">
          {category.productCount} produkte
        </p>
      </div>
      <div className="flex gap-2">
        <IconButton busy={busy} icon={Pencil} onClick={onEdit} />
        <IconButton busy={busy} icon={Trash2} onClick={onRemove} />
      </div>
    </article>
  );
}

function IconButton({
  icon: Icon,
  busy,
  onClick,
}: {
  icon: typeof Pencil;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/58 hover:text-happy-orange"
      disabled={busy}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center">
      <p className="type-body text-white/45">{text}</p>
    </div>
  );
}
