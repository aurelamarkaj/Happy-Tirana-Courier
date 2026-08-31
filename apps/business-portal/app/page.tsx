"use client";

import {
  CheckCircle2,
  Clock3,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Store,
  Trash2,
  Truck,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  addBusinessCategory,
  addBusinessProduct,
  decideBusinessOrder,
  editBusinessCategory,
  editBusinessProduct,
  formatLek,
  getBusinessDashboard,
  logoutBusiness,
  removeBusinessCategory,
  removeBusinessProduct,
  type BusinessCategory,
  type BusinessDashboard,
  type BusinessOrder,
  type BusinessProduct,
} from "../lib/api";
import { getBusinessSession } from "../lib/business-session";
import { useRouter } from "next/navigation";

const defaultProductImage = "/catalog/product-grocery-basket.webp";

export default function BusinessHome() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<BusinessDashboard | null>(null);
  const [message, setMessage] = useState("Po hapet dashboard-i i biznesit...");
  const [busy, setBusy] = useState(false);
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    price: "",
    section: "",
  });
  const [categoryForm, setCategoryForm] = useState({
    name: "",
  });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [categoryEditForm, setCategoryEditForm] = useState({
    name: "",
  });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    price: "",
    section: "",
    imageUrl: defaultProductImage,
  });

  useEffect(() => {
    if (!getBusinessSession()) {
      router.replace("/login");
      return;
    }
    refreshDashboard();
  }, [router]);

  useEffect(() => {
    const firstCategory = dashboard?.categories[0]?.name;
    if (!firstCategory) return;
    setProductForm((current) =>
      current.section ? current : { ...current, section: firstCategory },
    );
  }, [dashboard?.categories]);

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

  const pendingOrders = useMemo(
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
      setMessage("Produkti nuk u shtua dot ne databaze.");
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
      setMessage("Kategoria nuk u shtua dot ne databaze.");
    } finally {
      setBusy(false);
    }
  }

  function startEditingCategory(category: BusinessCategory) {
    setEditingCategoryId(category.id);
    setCategoryEditForm({
      name: category.name,
    });
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

  async function decide(order: BusinessOrder, action: "CONFIRM" | "REFUSE") {
    setBusy(true);
    setMessage("");
    try {
      await decideBusinessOrder(order.id, action);
      await refreshDashboard();
    } catch {
      setMessage(
        action === "CONFIRM"
          ? "Porosia nuk u konfirmua dot."
          : "Porosia nuk u refuzua dot.",
      );
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
          <button
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70"
            onClick={refreshDashboard}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            className="type-cta rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/70"
            onClick={logout}
            type="button"
          >
            Dil
          </button>
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
              className="absolute inset-0 h-full w-full object-cover opacity-28"
              src={
                dashboard?.business.coverImageUrl ??
                "/catalog/business-market.webp"
              }
            />
            <div className="absolute inset-0 bg-gradient-to-br from-black/94 via-black/72 to-black/38" />
            <div className="relative flex min-h-52 flex-col justify-between gap-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="type-badge uppercase tracking-wide text-happy-orange">
                    Dashboard biznesi
                  </p>
                  <h1 className="type-screen-title mt-2">
                    {dashboard?.business.name ?? "Biznesi"}
                  </h1>
                  <p className="type-body mt-2 max-w-xl text-white/62">
                    {dashboard?.business.description ??
                      "Menaxho produktet, konfirmo porosite dhe ndiq dorezimet nga databaza lokale."}
                  </p>
                </div>
                <span className="type-badge rounded-full bg-happy-orange px-3 py-2 text-white">
                  {dashboard?.business.status ?? "ACTIVE"}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  icon={Clock3}
                  label="Ne pritje"
                  value={`${dashboard?.metrics.pendingOrders ?? 0} porosi`}
                />
                <Metric
                  icon={Truck}
                  label="Ne proces"
                  value={`${dashboard?.metrics.activeOrders ?? 0} porosi`}
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

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
          <div className="space-y-5">
            <section className="business-panel rounded-3xl border p-5 shadow-happy">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="type-badge uppercase tracking-wide text-happy-orange">
                    Porosite
                  </p>
                  <h2 className="type-section-title mt-1">
                    Konfirmo ose refuzo
                  </h2>
                </div>
                <span className="type-secondary text-white/45">
                  {pendingOrders.length} ne pritje
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {pendingOrders.length ? (
                  pendingOrders.map((order) => (
                    <OrderCard
                      busy={busy}
                      key={order.id}
                      onConfirm={() => decide(order, "CONFIRM")}
                      onRefuse={() => decide(order, "REFUSE")}
                      order={order}
                    />
                  ))
                ) : (
                  <EmptyState text="Nuk ka porosi te reja per konfirmim." />
                )}
              </div>
            </section>

            <section className="business-panel rounded-3xl border p-5 shadow-happy">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="type-badge uppercase tracking-wide text-happy-orange">
                    Live
                  </p>
                  <h2 className="type-section-title mt-1">Porosi ne dorezim</h2>
                </div>
                <span className="type-secondary text-white/45">
                  {activeOrders.length} aktive
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                {activeOrders.length ? (
                  activeOrders.map((order) => (
                    <article
                      className="business-soft rounded-2xl border p-4"
                      key={order.id}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="type-badge uppercase text-happy-orange">
                            {order.code}
                          </p>
                          <h3 className="type-product mt-1 truncate">
                            {order.deliveryAddress}
                          </h3>
                          <p className="type-secondary mt-1 text-white/52">
                            Motoristi: {order.riderName ?? "Ne pritje"}
                          </p>
                        </div>
                        <span className="type-badge rounded-full bg-white/10 px-3 py-2 text-white/62">
                          {order.status}
                        </span>
                      </div>
                    </article>
                  ))
                ) : (
                  <EmptyState text="Ska porosi aktive ne kete moment." />
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="business-panel rounded-3xl border p-5 shadow-happy">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="type-badge uppercase tracking-wide text-happy-orange">
                    Kategorite
                  </p>
                  <h2 className="type-section-title mt-1">Shto kategori</h2>
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
                  label="Emri"
                  value={categoryForm.name}
                  onChange={(value) =>
                    setCategoryForm((current) => ({
                      ...current,
                      name: value,
                    }))
                  }
                  placeholder="P.sh. Mengjes"
                />
                <button
                  className="type-cta mt-2 flex h-12 items-center justify-center rounded-xl bg-happy-orange text-white happy-pill-shadow"
                  disabled={busy}
                  onClick={addCategory}
                  type="button"
                >
                  <Plus className="mr-2 h-5 w-5" />
                  Shto kategori
                </button>
              </form>

              <div className="mt-5 space-y-3">
                {dashboard?.categories.length ? (
                  dashboard.categories.map((category) => (
                    <CategoryCard
                      busy={busy}
                      category={category}
                      editForm={categoryEditForm}
                      editing={editingCategoryId === category.id}
                      key={category.id}
                      onCancel={cancelEditingCategory}
                      onEdit={() => startEditingCategory(category)}
                      onEditFormChange={setCategoryEditForm}
                      onRemove={() => removeCategory(category.id)}
                      onSave={() => saveCategory(category.id)}
                    />
                  ))
                ) : (
                  <EmptyState text="Nuk ka kategori aktive." />
                )}
              </div>
            </section>

            <section className="business-panel rounded-3xl border p-5 shadow-happy">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="type-badge uppercase tracking-wide text-happy-orange">
                    Menu
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
                  value={productForm.name}
                  onChange={(value) =>
                    setProductForm((current) => ({ ...current, name: value }))
                  }
                  placeholder="P.sh. Leng detox"
                />
                <Field
                  label="Pershkrimi"
                  value={productForm.description}
                  onChange={(value) =>
                    setProductForm((current) => ({
                      ...current,
                      description: value,
                    }))
                  }
                  placeholder="Perberesit ose detajet"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Cmimi"
                    value={productForm.price}
                    onChange={(value) =>
                      setProductForm((current) => ({
                        ...current,
                        price: value,
                      }))
                    }
                    placeholder="650"
                  />
                  <CategorySelect
                    categories={dashboard?.categories ?? []}
                    label="Kategoria"
                    onChange={(value) =>
                      setProductForm((current) => ({
                        ...current,
                        section: value,
                      }))
                    }
                    value={productForm.section}
                  />
                </div>
                <button
                  className="type-cta mt-2 flex h-12 items-center justify-center rounded-xl bg-happy-orange text-white happy-pill-shadow disabled:opacity-55"
                  disabled={busy || !dashboard?.categories.length}
                  onClick={addProduct}
                  type="button"
                >
                  <Plus className="mr-2 h-5 w-5" />
                  {dashboard?.categories.length
                    ? "Shto produkt"
                    : "Shto kategori fillimisht"}
                </button>
              </form>
            </section>

            <section className="business-panel rounded-3xl border p-5 shadow-happy">
              <div className="flex items-end justify-between">
                <div>
                  <p className="type-badge uppercase tracking-wide text-happy-orange">
                    Produktet
                  </p>
                  <h2 className="type-section-title mt-1">Aktive</h2>
                </div>
                <span className="type-secondary text-white/45">
                  {dashboard?.products.length ?? 0}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {dashboard?.products.length ? (
                  dashboard.products.map((product) => (
                    <ProductCard
                      busy={busy}
                      categories={dashboard.categories}
                      editForm={editForm}
                      editing={editingProductId === product.id}
                      key={product.id}
                      onCancel={cancelEditing}
                      onEdit={() => startEditing(product)}
                      onEditFormChange={setEditForm}
                      onRemove={() => removeProduct(product.id)}
                      onSave={() => saveProduct(product.id)}
                      product={product}
                    />
                  ))
                ) : (
                  <EmptyState text="Nuk ka produkte aktive." />
                )}
              </div>
            </section>
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
    <article className="business-soft rounded-2xl border p-4">
      <Icon className="h-5 w-5 text-happy-orange" />
      <p className="type-badge mt-4 uppercase text-white/42">{label}</p>
      <strong className="type-price mt-1 block">{value}</strong>
    </article>
  );
}

function OrderCard({
  order,
  busy,
  onConfirm,
  onRefuse,
}: {
  order: BusinessOrder;
  busy: boolean;
  onConfirm: () => void;
  onRefuse: () => void;
}) {
  return (
    <article className="business-soft rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="type-badge uppercase text-happy-orange">{order.code}</p>
          <h3 className="type-restaurant mt-1 truncate">
            {order.customerName ?? "Klient"}
          </h3>
          <p className="type-secondary mt-1 text-white/55">
            {order.deliveryAddress}
          </p>
        </div>
        <span className="type-badge rounded-full bg-white/10 px-3 py-2 text-white/62">
          {order.status}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <SmallStat label="Produkt" value={formatLek(order.productValue)} />
        <SmallStat label="Transport" value={formatLek(order.transportFee)} />
        <SmallStat label="Total" value={formatLek(order.totalAmount)} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          className="type-cta flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70"
          disabled={busy}
          onClick={onRefuse}
          type="button"
        >
          <X className="mr-2 h-5 w-5" />
          Refuzo
        </button>
        <button
          className="type-cta flex h-12 items-center justify-center rounded-xl bg-happy-orange text-white"
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          <CheckCircle2 className="mr-2 h-5 w-5" />
          Konfirmo
        </button>
      </div>
    </article>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/18 p-3">
      <p className="type-badge uppercase text-white/40">{label}</p>
      <strong className="type-price mt-1 block">{value}</strong>
    </div>
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
            Shto kategori fillimisht
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
            value={editForm.name}
            onChange={(value) => onEditFormChange({ ...editForm, name: value })}
            placeholder="Emri i produktit"
          />
          <Field
            label="Pershkrimi"
            value={editForm.description}
            onChange={(value) =>
              onEditFormChange({ ...editForm, description: value })
            }
            placeholder="Pershkrim i shkurter"
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Cmimi"
              value={editForm.price}
              onChange={(value) =>
                onEditFormChange({ ...editForm, price: value })
              }
              placeholder="650"
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
          <Field
            label="Foto"
            value={editForm.imageUrl}
            onChange={(value) =>
              onEditFormChange({ ...editForm, imageUrl: value })
            }
            placeholder="/catalog/product-grocery-basket.webp"
          />
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
        <button
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/58 hover:text-happy-orange"
          disabled={busy}
          onClick={onEdit}
          type="button"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/58 hover:text-happy-orange"
          disabled={busy}
          onClick={onRemove}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
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
          value={editForm.name}
          onChange={(value) => onEditFormChange({ ...editForm, name: value })}
          placeholder="Emri"
        />
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
    <article className="business-soft grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border p-3">
      <div className="min-w-0">
        <h3 className="type-product truncate">{category.name}</h3>
        <p className="type-secondary text-white/45">
          {category.productCount} produkte
        </p>
      </div>
      <div className="flex gap-2">
        <button
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/58 hover:text-happy-orange"
          disabled={busy}
          onClick={onEdit}
          type="button"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/58 hover:text-happy-orange"
          disabled={busy}
          onClick={onRemove}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="business-soft rounded-2xl border p-5 text-center">
      <Store className="mx-auto h-8 w-8 text-happy-orange" />
      <p className="type-body mt-3 text-white/58">{text}</p>
    </div>
  );
}
