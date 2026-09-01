"use client";

import {
  BellRing,
  Minus,
  LogOut,
  MapPin,
  PackagePlus,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import {
  addBusinessCategory,
  addBusinessProduct,
  createBusinessOrder,
  editBusinessCategory,
  editBusinessProduct,
  formatLek,
  getBusinessDashboard,
  logoutBusiness,
  removeBusinessCategory,
  removeBusinessProduct,
  searchAddresses,
  type AddressSuggestion,
  type BusinessCategory,
  type BusinessDashboard,
  type BusinessOrder,
  type BusinessProduct,
} from "../lib/api";
import { getBusinessSession } from "../lib/business-session";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const defaultProductImage = "/catalog/product-grocery-basket.webp";

export default function BusinessHome() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<BusinessDashboard | null>(null);
  const [message, setMessage] = useState("Po hapet dashboard-i i biznesit...");
  const [busy, setBusy] = useState(false);
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
  });
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
    try {
      const data = await getBusinessDashboard();
      setDashboard(data);
      setMessage("");
    } catch {
      router.replace("/login");
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

  async function createOrder() {
    const lat = Number(orderForm.lat);
    const lng = Number(orderForm.lng);

    if (
      !orderForm.customerName.trim() ||
      !orderForm.customerPhone.trim() ||
      !orderForm.addressText.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      selectedOrderProducts.length === 0
    ) {
      setMessage(
        "Ploteso klientin, telefonin, adresen nga dropdown dhe zgjidh te pakten nje produkt.",
      );
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
      });
      setOrderItems({});
      setAddressSuggestions([]);
      setMessage(
        data.offeredRiders.length
          ? `Porosia u krijua dhe iu dergua ${data.offeredRiders.length} motorristëve më të afërt.`
          : "Porosia u krijua. Nuk ka motorrist online për momentin.",
      );
      await refreshDashboard();
    } catch {
      setMessage(
        "Porosia nuk u krijua dot. Kontrollo adresen, zonen e dorezimit dhe API/Postgres.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addProduct() {
    const price = Number(productForm.price);
    if (!productForm.name.trim() || !Number.isFinite(price) || !productForm.section) {
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
      setMessage("Produkti nuk u shtua dot ne databaze.");
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
      const data = await addBusinessCategory({ name: categoryForm.name.trim() });
      setCategoryForm({ name: "" });
      setProductForm((current) => ({ ...current, section: data.category.name }));
      await refreshDashboard();
    } catch {
      setMessage("Kategoria nuk u shtua dot ne databaze.");
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
      setMessage("Produkti nuk u hoq dot nga databaza.");
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
      setMessage("Produkti nuk u ruajt dot ne databaze.");
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
      setMessage("Kategoria nuk u ruajt dot ne databaze.");
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
      setMessage("Kategoria nuk u hoq dot nga databaza.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="business-page min-h-screen pb-10 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#101010]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Link className="flex items-center gap-3" href="/">
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
                Business
              </span>
            </span>
          </Link>
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
      </header>

      <section className="mx-auto max-w-6xl px-4 py-5 md:px-6">
        {message ? (
          <p className="type-warning mb-4 rounded-2xl border border-happy-orange/25 bg-happy-orange/10 p-4 text-happy-orange">
            {message}
          </p>
        ) : null}

        <section className="business-panel overflow-hidden rounded-3xl border shadow-happy">
          <div className="relative min-h-64 p-5 md:p-6">
            <img
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-[0.42]"
              src={
                dashboard?.business.coverImageUrl ??
                "/catalog/business-market.webp"
              }
            />
            <div className="absolute inset-0 bg-gradient-to-br from-black/96 via-black/82 to-black/58" />
            <div className="relative flex min-h-52 flex-col justify-between gap-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="type-badge uppercase tracking-wide text-happy-orange">
                    Panel operimi
                  </p>
                  <h1 className="type-screen-title mt-2">
                    {dashboard?.business.name ?? "Biznesi"}
                  </h1>
                  <p className="type-body mt-2 max-w-xl text-white/80">
                    Krijo porosine, sistemi gjen zonen dhe ia dergon
                    motorristëve më të afërt që janë online.
                  </p>
                </div>
                <span className="type-badge rounded-full bg-happy-orange px-3 py-2 text-white">
                  {dashboard?.business.status ?? "ACTIVE"}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  icon={BellRing}
                  label="Derguar rider"
                  value={`${waitingOrders.length} porosi`}
                />
                <Metric
                  icon={Truck}
                  label="Ne dorezim"
                  value={`${dashboard?.metrics.activeOrders ?? 0} aktive`}
                />
                <Metric
                  icon={WalletCards}
                  label="Arketuar sot"
                  value={formatLek(dashboard?.metrics.productRevenueToday ?? 0)}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
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

                <ProductPicker
                  items={orderItems}
                  onChange={changeOrderItem}
                  products={dashboard?.products ?? []}
                  subtotal={productSubtotal}
                />

                <div className="business-soft grid gap-3 rounded-2xl border p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <p className="type-product">
                      Subtotal produktesh: {formatLek(productSubtotal)}
                    </p>
                    <p className="type-secondary mt-1 text-white/48">
                      Transporti llogaritet nga zona e adresës. Pas krijimit,
                      oferta i shkon deri në {5} motorristëve më pranë.
                    </p>
                  </div>
                  <button
                    className="type-cta flex h-12 items-center justify-center rounded-xl bg-happy-orange px-5 text-white happy-pill-shadow disabled:opacity-55"
                    disabled={busy}
                    onClick={createOrder}
                    type="button"
                  >
                    <Send className="mr-2 h-5 w-5" />
                    Krijo porosi
                  </button>
                </div>
              </form>
            </section>

            <OrderTable
              emptyText="Nuk ka porosi që presin motorrist."
              kicker="Porosi të reja"
              orders={waitingOrders}
              title="Në pritje"
            />

            <OrderTable
              emptyText="Nuk ka porosi aktive në këtë moment."
              kicker="Live"
              orders={activeOrders}
              title="Në dorëzim"
            />

            <OrderTable
              emptyText="Nuk ka ende porosi të përfunduara."
              kicker="Historia"
              orders={completedOrders}
              title="Të përfunduara"
            />
          </div>

          <aside className="space-y-5">
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
          </aside>
        </section>
      </section>
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Store;
  label: string;
  value: string;
}) {
  return (
    <article className="business-hero-metric rounded-2xl border p-4">
      <Icon className="h-5 w-5 text-happy-orange" />
      <p className="type-badge mt-4 uppercase text-white/72">{label}</p>
      <strong className="type-price mt-1 block text-white">{value}</strong>
    </article>
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
                  {suggestion.details || `${suggestion.area}, ${suggestion.city}`}
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
        className="business-input mt-2 h-12 w-full rounded-xl border px-3 outline-none focus:border-happy-orange"
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
            Zgjidh nga produktet që biznesi ka shtuar në databazë.
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
                        <h3 className="type-product truncate">{product.name}</h3>
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
        <span className="type-secondary text-white/48">Totali i produkteve</span>
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
                <th className="w-[170px] px-4 py-3 font-semibold">Produkti</th>
                <th className="w-[160px] px-4 py-3 font-semibold">Motorristi</th>
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
    <div className="rounded-xl bg-black/18 p-3">
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
        <p className="type-product truncate">{order.customerName ?? "Klient"}</p>
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
        className="business-input mt-2 h-12 w-full rounded-xl border px-3 outline-none focus:border-happy-orange"
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
