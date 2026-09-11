"use client";

import {
  Building2,
  CheckCircle2,
  ImagePlus,
  Mail,
  Phone,
  Plus,
  Save,
  Search,
  Store,
  Tags,
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
import { AdminMetric, AdminShell } from "../../components/admin-shell";
import {
  createAdminBusiness,
  createAdminBusinessCategory,
  getAdminBusinesses,
  getAdminBusinessCategories,
  type AdminBusiness,
  type AdminBusinessCategory,
} from "../../lib/api";

const emptyForm = {
  name: "",
  legalName: "",
  phone: "",
  email: "",
  password: "",
  addressText: "",
  lat: "",
  lng: "",
  category: "Ushqime",
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
  const [categoryForm, setCategoryForm] = useState({
    name: "",
  });
  const [showForm, setShowForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
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
      const [businessData, categoryData] = await Promise.all([
        getAdminBusinesses(),
        getAdminBusinessCategories(),
      ]);
      setBusinesses(businessData.businesses);
      setCategories(categoryData.categories);
      if (
        !categoryData.categories.some(
          (category) => category.name === form.category,
        ) &&
        categoryData.categories[0]
      ) {
        setForm((current) => ({
          ...current,
          category: categoryData.categories[0].name,
        }));
      }
      setMessage("");
    } catch {
      setMessage("Nuk u lexuan bizneset/kategorite Përditësim i porosisë.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setShowForm(
      new URLSearchParams(window.location.search).get("create") === "1",
    );
    void loadBusinesses();
  }, []);

  const metrics = useMemo(
    () => ({
      active: businesses.filter((business) => business.status === "ACTIVE")
        .length,
      accepting: businesses.filter((business) => business.status === "ACTIVE")
        .length,
      categories: categories.filter((category) => category.active).length,
    }),
    [businesses, categories],
  );

  async function submitBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      await createAdminBusiness({
        name: form.name,
        legalName: form.legalName,
        phone: form.phone,
        email: form.email,
        password: form.password,
        addressText: form.addressText,
        lat: form.lat ? Number(form.lat) : null,
        lng: form.lng ? Number(form.lng) : null,
        category: form.category,
        status: form.status as "ACTIVE" | "INACTIVE" | "SUSPENDED",
        coverImageUrl: form.coverImageUrl,
        description: form.description,
      });
      setForm(emptyForm);
      setShowForm(false);
      await loadBusinesses();
      setMessage("Biznesi u krijua me sukses.");
    } catch {
      setMessage(
        "Biznesi nuk u krijua. Kontrollo të dhënat dhe provo përsëri.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryForm.name.trim()) return;

    setSavingCategory(true);
    setMessage("");
    try {
      const data = await createAdminBusinessCategory({
        name: categoryForm.name.trim(),
        sortOrder: 50,
      });
      setCategoryForm({ name: "" });
      setForm((current) => ({ ...current, category: data.category.name }));
      await loadBusinesses();
      setMessage("Kategoria u krijua dhe është gati për t’u përdorur.");
    } catch {
      setMessage(
        "Kategoria nuk u ruajt. Kontrollo nëse ky emër ekziston dhe provo përsëri.",
      );
    } finally {
      setSavingCategory(false);
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
            className="type-cta flex h-11 w-full items-center justify-center rounded-xl bg-white/10 px-4 text-white hover:bg-white/15 sm:w-auto"
            onClick={() => setShowCategoryForm((current) => !current)}
            type="button"
          >
            {showCategoryForm ? (
              <X className="mr-2 h-5 w-5" />
            ) : (
              <Tags className="mr-2 h-5 w-5 text-happy-orange" />
            )}
            {showCategoryForm ? "Mbyll kategorine" : "Krijo kategori"}
          </button>
        </div>
      }
      description="Krijo kredenciale per bizneset, vendos kategorine, statusin dhe foton. Koha e dergeses llogaritet automatikisht nga distanca me klientin."
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
          label="Kategori"
          value={String(metrics.categories)}
          tone="blue"
          loading={loading}
        />
      </section>

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
                <h2 className="type-section-title mt-1">Krijo biznes te ri</h2>
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
                  required
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  value={form.password}
                />
              </Field>
              <Field label="Kategoria e biznesit">
                <select
                  className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                  required
                  value={form.category}
                >
                  {categories
                    .filter((category) => category.active)
                    .map((category) => (
                      <option
                        className="bg-[#101010]"
                        key={category.id}
                        value={category.name}
                      >
                        {category.name}
                      </option>
                    ))}
                </select>
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
              <Field label="Latitude">
                <input
                  className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                  onChange={(event) =>
                    setForm({ ...form, lat: event.target.value })
                  }
                  placeholder="41.3275"
                  value={form.lat}
                />
              </Field>
              <Field label="Longitude">
                <input
                  className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                  onChange={(event) =>
                    setForm({ ...form, lng: event.target.value })
                  }
                  placeholder="19.8187"
                  value={form.lng}
                />
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
                className="type-cta flex h-11 items-center justify-center rounded-xl bg-happy-orange text-white happy-pill-shadow"
                disabled={saving}
                type="submit"
              >
                <Save className="mr-2 h-5 w-5" />
                {saving ? "Duke ruajtur..." : "Ruaj biznesin"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {showCategoryForm ? (
        <section className="admin-panel rounded-3xl border p-4 shadow-happy md:p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-happy-orange/15 text-happy-orange">
              <Tags className="h-5 w-5" />
            </span>
            <div>
              <p className="type-badge uppercase tracking-wide text-happy-orange">
                Kategori
              </p>
              <h2 className="type-section-title">Shto kategori</h2>
            </div>
          </div>
          <form className="mt-5 grid gap-3" onSubmit={submitCategory}>
            <Field label="Emri i kategorise">
              <input
                className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                onChange={(event) =>
                  setCategoryForm({
                    ...categoryForm,
                    name: event.target.value,
                  })
                }
                placeholder="P.sh. Farmaci, Lule"
                value={categoryForm.name}
              />
            </Field>
            <button
              className="type-cta h-11 rounded-xl bg-happy-orange text-white happy-pill-shadow"
              disabled={savingCategory}
              type="submit"
            >
              {savingCategory ? "Duke shtuar..." : "Shto kategori"}
            </button>
          </form>
          <div className="mt-5 space-y-2">
            {categories.map((category) => (
              <div
                className="admin-soft flex items-center justify-between rounded-2xl border px-3 py-2"
                key={category.id}
              >
                <span className="type-body">{category.name}</span>
                <span className="type-badge text-white/42">
                  {category.businessCount}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {message ? (
        <p className="type-warning rounded-2xl border border-happy-orange/40 bg-happy-orange/10 p-4 text-happy-orange">
          {message}
        </p>
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
                <h3 className="type-restaurant">{business.name}</h3>
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
