"use client";

import {
  Building2,
  CheckCircle2,
  ImagePlus,
  Mail,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  Store,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { AdminMetric, AdminShell } from "../../components/admin-shell";
import { DeleteAccountConfirmation } from "../../components/delete-account-confirmation";
import {
  createAdminBusiness,
  createAdminBusinessCategory,
  deleteAdminBusiness,
  getAdminBusinessCategories,
  getAdminBusinesses,
  resetAdminBusinessPassword,
  updateAdminBusiness,
  ApiError,
  type AdminBusiness,
  type AdminBusinessCategory,
} from "../../lib/api";

import { businessErrorMessage } from "../../lib/business-error";

const emptyForm = {
  name: "",
  legalName: "",
  phone: "",
  email: "",
  password: "",
  addressText: "",
  googleMapsUrl: "",
  category: "",
  status: "ACTIVE",
  coverImageUrl: "",
  description: "",
};

const statusOptions = [
  { value: "ACTIVE", label: "Aktiv" },
  { value: "INACTIVE", label: "Jo aktiv" },
  { value: "SUSPENDED", label: "I pezulluar" },
];

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [categories, setCategories] = useState<AdminBusinessCategory[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminBusiness | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const filteredBusinesses = businesses.filter(
    (business) =>
      (statusFilter === "ALL" || business.status === statusFilter) &&
      [business.name, business.phone, business.email, business.addressText]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );

  async function loadBusinesses() {
    setLoading(true);
    try {
      const businessData = await getAdminBusinesses();
      setBusinesses(businessData.businesses);
      setMessage("");
    } catch {
      setMessage("Nuk u lexuan bizneset. Provo përsëri.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    setLoadingCategories(true);
    try {
      const data = await getAdminBusinessCategories();
      setCategories(data.categories);
    } catch {
      setMessage("Kategoritë nuk u ngarkuan. Rifresko faqen dhe provo përsëri.");
    } finally {
      setLoadingCategories(false);
    }
  }

  useEffect(() => {
    setShowForm(
      new URLSearchParams(window.location.search).get("create") === "1",
    );
    void (async () => {
      await loadBusinesses();
      await loadCategories();
    })();
  }, []);

  const metrics = useMemo(
    () => ({
      active: businesses.filter((business) => business.status === "ACTIVE")
        .length,
      accepting: businesses.filter((business) => business.status === "ACTIVE")
        .length,
      total: businesses.length,
    }),
    [businesses],
  );

  async function submitBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const input = {
        name: form.name,
        legalName: form.legalName,
        phone: form.phone,
        email: form.email,
        password: form.password,
        addressText: form.addressText,
        googleMapsUrl: form.googleMapsUrl,
        category: form.category,
        status: form.status as "ACTIVE" | "INACTIVE" | "SUSPENDED",
        etaMinutes: 25,
        coverImageUrl: form.coverImageUrl,
        description: form.description,
      };
      if (editingId) {
        const { password: _password, ...updateInput } = input;
        await updateAdminBusiness(editingId, updateInput);
        if (_password) await resetAdminBusinessPassword(editingId, _password);
      } else {
        await createAdminBusiness(input);
      }
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      await loadBusinesses();
      setMessage(
        editingId
          ? "Biznesi u përditësua me sukses."
          : "Biznesi u krijua me sukses.",
      );
    } catch (error) {
      setMessage(businessErrorMessage(error, Boolean(editingId)));
    } finally {
      setSaving(false);
    }
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryName.trim();
    if (name.length < 2) {
      setMessage("Emri i kategorisë duhet të ketë të paktën 2 karaktere.");
      return;
    }
    if (categories.some((category) => category.name.toLocaleLowerCase("sq-AL") === name.toLocaleLowerCase("sq-AL"))) {
      setMessage("Kjo kategori ekziston tashmë.");
      return;
    }
    setSavingCategory(true);
    setMessage("");
    try {
      const { category } = await createAdminBusinessCategory({ name });
      setCategories((current) => [...current, category].sort((a, b) =>
        a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "sq-AL")));
      setCategoryName("");
      setShowCategoryForm(false);
      setMessage(`Kategoria “${name}” u shtua me sukses.`);
    } catch {
      setMessage("Kategoria nuk u ruajt. Provo përsëri.");
    } finally {
      setSavingCategory(false);
    }
  }

  function editBusiness(business: AdminBusiness) {
    setEditingId(business.id);
    setForm({
      name: business.name,
      legalName: business.legalName ?? "",
      phone: business.phone,
      email: business.email ?? "",
      password: "",
      addressText: business.addressText,
      googleMapsUrl: business.lat == null || business.lng == null ? "" : `https://www.google.com/maps?q=${business.lat},${business.lng}`,
      category: business.category ?? "Te tjera",
      status: business.status,
      coverImageUrl: business.coverImageUrl ?? "",
      description: business.description ?? "",
    });
    setShowForm(true);
    setMessage("");
  }

  async function removeBusiness(business: AdminBusiness) {
    setDeletingId(business.id);
    setMessage("");
    try {
      await deleteAdminBusiness(business.id);
      if (editingId === business.id) {
        setEditingId(null);
        setForm(emptyForm);
        setShowForm(false);
      }
      await loadBusinesses();
      await loadCategories();
      setPendingDelete(null);
      setMessage(`Biznesi “${business.name}” u fshi.`);
    } catch (error) {
      setMessage(error instanceof ApiError && error.code === "BUSINESS_HAS_ACTIVE_ORDERS"
        ? "Biznesi ka porosi aktive. Mbylli ose anuloji nga faqja e porosive para fshirjes."
        : "Biznesi nuk u fshi. Provo përsëri.");
    } finally {
      setDeletingId(null);
    }
  }

  function handleCoverUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Zgjidh një skedar fotografie.");
      return;
    }
    if (file.size > 2_000_000) {
      setMessage("Fotoja eshte shume e madhe. Zgjidh nje foto deri ne 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setForm((current) => ({ ...current, coverImageUrl: result }));
        setMessage("");
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <AdminShell
      action={
        <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button
            className="type-cta flex h-11 w-full items-center justify-center rounded-xl bg-happy-orange px-4 text-white happy-pill-shadow sm:w-auto"
            onClick={() => setShowForm((current) => !current)}
            type="button"
          >
            {showForm ? (
              <X className="mr-2 h-5 w-5" />
            ) : (
              <Plus className="mr-2 h-5 w-5" />
            )}
            {showForm ? "Mbyll formen" : "Krijo biznes"}
          </button>
          <button
            className="secondary-button flex h-11 w-full items-center justify-center px-4 sm:w-auto"
            onClick={() => setShowCategoryForm((current) => !current)}
            type="button"
          >
            {showCategoryForm ? <X className="mr-2 h-5 w-5" /> : <Tags className="mr-2 h-5 w-5" />}
            {showCategoryForm ? "Mbyll kategorinë" : "Krijo kategori"}
          </button>
        </div>
      }
      description="Krijo kredenciale per bizneset, vendos lokacionin, statusin dhe foton. Koha e dergeses llogaritet automatikisht nga distanca me klientin."
      eyebrow="Menaxhim"
      title="Biznese"
    >
      <section className="entity-metrics grid gap-3 md:grid-cols-3">
        <AdminMetric
          icon={Building2}
          label="Biznese aktive"
          value={String(metrics.active)}
          loading={loading}
        />
        <AdminMetric
          icon={CheckCircle2}
          label="Pranojne porosi"
          value={String(metrics.accepting)}
          tone="green"
          loading={loading}
        />
        <AdminMetric
          icon={Store}
          label="Biznese gjithsej"
          value={String(metrics.total)}
          tone="blue"
          loading={loading}
        />
      </section>

      {showCategoryForm ? (
        <section className="admin-panel rounded-3xl border p-4 shadow-happy md:p-5">
          <p className="type-badge uppercase tracking-wide text-happy-orange">Kategoritë</p>
          <h2 className="type-section-title mt-1">Shto kategori biznesi</h2>
          <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={submitCategory}>
            <Field label="Emri i kategorisë" className="min-w-0 flex-1">
              <input
                className="admin-input h-11 w-full rounded-xl border px-3"
                maxLength={80}
                minLength={2}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="P.sh. Restorant"
                required
                value={categoryName}
              />
            </Field>
            <button className="primary-button h-11 justify-center" disabled={savingCategory} type="submit">
              <Plus className="h-4 w-4" />
              {savingCategory ? "Duke ruajtur..." : "Ruaj kategorinë"}
            </button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Kategoritë ekzistuese">
            {categories.map((category) => (
              <span className="admin-soft rounded-full border px-3 py-1.5 text-sm" key={category.id}>
                {category.name}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {showForm ? (
        <section>
          <form
            className="admin-panel rounded-3xl border p-4 shadow-happy md:p-5"
            onSubmit={submitBusiness}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="type-badge uppercase tracking-wide text-happy-orange">
                  Kredenciale
                </p>
                <h2 className="type-section-title mt-1">
                  {editingId ? "Ndrysho biznesin" : "Krijo biznes te ri"}
                </h2>
              </div>
              <span className="type-secondary w-fit rounded-full bg-white/8 px-3 py-2 text-white/55">
                Vendos kredencialet e biznesit
              </span>
            </div>

            <div className="admin-form-grid mt-4">
              <Field label="Emri i biznesit">
                <input
                  className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="P.sh. Bio Store Tirana"
                  required
                  value={form.name}
                />
              </Field>
              <Field label="Emri ligjor">
                <input
                  className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                  onChange={(event) =>
                    setForm({ ...form, legalName: event.target.value })
                  }
                  placeholder="P.sh. Bio Store sh.p.k."
                  value={form.legalName}
                />
              </Field>
              <Field label="Telefoni i biznesit">
                <input
                  className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                  placeholder="+35569..."
                  type="tel"
                  required
                  value={form.phone}
                />
              </Field>
              <Field label="Email per login">
                <input
                  className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  placeholder="biznes@example.com"
                  type="email"
                  required
                  value={form.email}
                />
              </Field>
              <Field label="Password per biznesin">
                <input
                  className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                  onChange={(event) =>
                    setForm({ ...form, password: event.target.value })
                  }
                  placeholder="Minimumi 6 karaktere"
                  required={!editingId}
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  value={form.password}
                />
              </Field>
              <Field label="Statusi i biznesit">
                <select
                  className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                  onChange={(event) =>
                    setForm({ ...form, status: event.target.value })
                  }
                  required
                  value={form.status}
                >
                  {statusOptions.map((status) => (
                    <option
                      className="bg-[#101010]"
                      key={status.value}
                      value={status.value}
                    >
                      {status.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Kategoria e biznesit">
                <select
                  className="admin-input h-11 w-full rounded-xl border px-3"
                  disabled={loadingCategories || !categories.length}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  required
                  value={form.category}
                >
                  <option value="" disabled>{loadingCategories ? "Po ngarkohen kategoritë..." : "Zgjidh kategorinë"}</option>
                  {categories.filter((category) => category.active || (editingId && category.name === form.category)).map((category) => (
                    <option key={category.id} value={category.name}>{category.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Adresa e biznesit">
                <input
                  className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                  onChange={(event) =>
                    setForm({ ...form, addressText: event.target.value })
                  }
                  placeholder="P.sh. Rruga e Elbasanit, Tirane"
                  required
                  value={form.addressText}
                />
              </Field>
              <Field label="Link Google Maps" className="col-span-full">
                <input className="admin-input h-11 w-full rounded-xl border px-3" type="url" required
                  placeholder="https://maps.app.goo.gl/..." value={form.googleMapsUrl}
                  onChange={(event) => setForm({...form, googleMapsUrl:event.target.value})} />
              </Field>
              <Field label="Pershkrim i shkurter">
                <textarea
                  className="admin-input min-h-20 w-full rounded-xl border px-3 py-3 outline-none focus:border-white/35"
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Cfare shet ky biznes?"
                  value={form.description}
                />
              </Field>
              <label className="admin-soft flex min-h-20 cursor-pointer items-center gap-3 rounded-2xl border p-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-happy-orange/15 text-happy-orange">
                  <ImagePlus className="h-5 w-5" />
                </span>
                <span>
                  <span className="type-product block">Foto cover</span>
                  <span className="type-secondary mt-1 block text-white/50">
                    Foto deri ne 2MB.
                  </span>
                </span>
                <input
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverUpload}
                  type="file"
                />
              </label>
              {form.coverImageUrl ? (
                <img
                  alt="Cover preview"
                  className="h-32 w-full rounded-2xl object-cover"
                  src={form.coverImageUrl}
                />
              ) : null}
              <button
                className="type-cta col-span-full flex h-11 w-full items-center justify-center rounded-xl bg-happy-orange text-white happy-pill-shadow"
                disabled={saving}
                type="submit"
              >
                <Save className="mr-2 h-5 w-5" />
                {saving
                  ? "Duke ruajtur..."
                  : editingId
                    ? "Ruaj ndryshimet"
                    : "Ruaj biznesin"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {message ? (
        <p className="type-warning rounded-2xl border border-happy-orange/40 bg-happy-orange/10 p-4 text-happy-orange">
          {message}
        </p>
      ) : null}

      {pendingDelete ? (
        <DeleteAccountConfirmation
          busy={deletingId === pendingDelete.id}
          kind="biznesin"
          name={pendingDelete.name}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void removeBusiness(pendingDelete)}
        />
      ) : null}

      <section className="admin-panel rounded-3xl border p-5 shadow-happy">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="type-badge uppercase tracking-wide text-happy-orange">
              Lista
            </p>
            <h2 className="type-section-title mt-1">Bizneset e regjistruara</h2>
          </div>
          <span className="type-secondary text-white/45">
            {loading ? "Duke lexuar..." : `${businesses.length} subjekte`}
          </span>
        </div>
        <div className="list-toolbar">
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Kerko biznes"
              placeholder="Emri, telefoni ose adresa..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                aria-label="Pastro kerkimin"
                title="Pastro kerkimin"
                onClick={() => setQuery("")}
              >
                <X size={14} />
              </button>
            )}
          </label>
          <select
            aria-label="Filtro bizneset sipas statusit"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="ALL">Te gjitha statuset</option>
            {statusOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 grid gap-3" aria-busy={loading}>
          {!loading && !filteredBusinesses.length && !message && (
            <div className="empty-state">
              <Building2 size={30} />
              <h3>
                {businesses.length
                  ? "Asnje biznes nuk perputhet"
                  : "Nuk ka biznese te regjistruara"}
              </h3>
              {businesses.length ? (
                <button
                  className="text-button"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("ALL");
                  }}
                >
                  Pastro filtrat
                </button>
              ) : (
                <button
                  className="secondary-button"
                  onClick={() => setShowForm(true)}
                >
                  <Plus size={16} />
                  Krijo biznes
                </button>
              )}
            </div>
          )}
          {filteredBusinesses.map((business) => (
            <article
              className="admin-soft grid gap-4 rounded-2xl border p-4 md:grid-cols-[64px_1fr_auto]"
              key={business.id}
            >
              <img
                alt=""
                className="h-16 w-16 rounded-2xl object-cover"
                src={business.coverImageUrl ?? "/happy-logo.svg"}
              />
              <div>
                <h3 className="type-restaurant"><Link href={`/businesses/${business.id}/orders`} className="hover:text-happy-orange">{business.name}</Link></h3>
                <p className="type-secondary mt-1 text-white/52">
                  {business.addressText}
                </p>
                <p className="type-secondary mt-2 flex flex-wrap items-center gap-y-1 text-white/45">
                  <Phone className="mr-2 h-4 w-4 text-happy-orange" />
                  {business.phone}
                  <Mail className="ml-4 mr-2 h-4 w-4 text-happy-orange" />
                  {business.email ?? "pa email"}
                </p>
              </div>
              <div className="flex flex-wrap items-start justify-start gap-2 md:justify-end">
                <Link className="secondary-button" href={`/businesses/${business.id}/orders`}>Porositë</Link>
                <button
                  aria-label={`Ndrysho ${business.name}`}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/70 hover:border-happy-orange/50 hover:text-happy-orange"
                  onClick={() => editBusiness(business)}
                  title="Ndrysho biznesin"
                  type="button"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  aria-label={`Fshi ${business.name}`}
                  className="flex h-10 items-center justify-center gap-2 rounded-xl border border-red-300 px-3 text-red-700 hover:bg-red-50 disabled:opacity-50"
                  disabled={deletingId === business.id}
                  onClick={() => setPendingDelete(business)}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" /> Fshi
                </button>
                <span className="type-badge h-fit rounded-full bg-white/10 px-3 py-2 text-white/62">
                  {business.category ?? "Te tjera"}
                </span>
                <span className="type-badge h-fit rounded-full bg-white/10 px-3 py-2 text-white/62">
                  {business.productCount} produkte
                </span>
                <span className="type-badge h-fit rounded-full bg-happy-orange/15 px-3 py-2 text-happy-orange">
                  {statusOptions.find((item) => item.value === business.status)
                    ?.label ?? business.status}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`type-input block text-white/72 ${className}`}>
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
  );
}
