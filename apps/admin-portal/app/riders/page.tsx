"use client";

import {
  Bike,
  FileCheck2,
  Plus,
  Pencil,
  RadioTower,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { AdminMetric, AdminShell } from "../../components/admin-shell";
import { DeleteAccountConfirmation } from "../../components/delete-account-confirmation";
import {
  createAdminRider,
  deleteAdminRider,
  formatLek,
  getAdminRiders,
  setRiderAccountBalance,
  updateAdminRider,
  ApiError,
  type AdminRider,
} from "../../lib/api";

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  password: "",
  vehicleType: "ELECTRIC",
  licenseNumber: "",
  personalId: "",
  status: "ACTIVE",
};

const statusOptions = [
  { value: "ACTIVE", label: "Aktiv" },
  { value: "INACTIVE", label: "Jo aktiv" },
  { value: "SUSPENDED", label: "I pezulluar" },
];

const vehicleOptions = [
  { value: "ELECTRIC", label: "Elektrik" },
  { value: "DIESEL", label: "Diesel" },
];

export default function RidersPage() {
  const [riders, setRiders] = useState<AdminRider[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminRider | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [fleetFilter, setFleetFilter] = useState("ALL");
  const [payoutRider, setPayoutRider] = useState<AdminRider | null>(null);
  const [remainingBalance, setRemainingBalance] = useState("");
  const filteredRiders = riders.filter(
    (rider) =>
      (fleetFilter === "ALL" ||
        (fleetFilter === "ONLINE"
          ? rider.isOnline
          : fleetFilter === "BLOCKED"
            ? rider.isDebitBlocked
            : rider.vehicleType === fleetFilter)) &&
      [rider.name, rider.phone, rider.email, rider.licenseNumber]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );

  async function loadRiders() {
    setLoading(true);
    try {
      const data = await getAdminRiders();
      setRiders(data.riders);
      setMessage("");
    } catch {
      setMessage("Nuk u lexuan motoristet Përditësim i porosisë.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setShowForm(
      new URLSearchParams(window.location.search).get("create") === "1",
    );
    void loadRiders();
  }, []);

  const metrics = useMemo(
    () => ({
      active: riders.filter((rider) => rider.status === "ACTIVE").length,
      online: riders.filter((rider) => rider.isOnline).length,
      blocked: riders.filter((rider) => rider.isDebitBlocked).length,
    }),
    [riders],
  );

  async function submitRider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const input = {
        name: form.name,
        phone: form.phone,
        email: form.email,
        password: form.password,
        vehicleType: form.vehicleType as "ELECTRIC" | "DIESEL",
        licenseNumber: form.licenseNumber,
        personalId: form.personalId,
        status: form.status as "ACTIVE" | "INACTIVE" | "SUSPENDED",
      };
      if (editingId) {
        const { password: _password, ...updateInput } = input;
        await updateAdminRider(editingId, updateInput);
      } else {
        await createAdminRider(input);
      }
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      await loadRiders();
      setMessage(
        editingId
          ? "Motoristi u përditësua me sukses."
          : "Motoristi u krijua dhe mund te hyje me email/password-in e vendosur.",
      );
    } catch {
      setMessage(
        "Motoristi nuk u regjistrua. Kontrollo të dhënat dhe provo përsëri.",
      );
    } finally {
      setSaving(false);
    }
  }

  function editRider(rider: AdminRider) {
    setEditingId(rider.id);
    setForm({
      name: rider.name,
      phone: rider.phone,
      email: rider.email ?? "",
      password: "",
      vehicleType: rider.vehicleType,
      licenseNumber: rider.licenseNumber ?? "",
      personalId: rider.personalId ?? "",
      status: rider.status,
    });
    setShowForm(true);
    setMessage("");
  }

  async function removeRider(rider: AdminRider) {
    setDeletingId(rider.id);
    setMessage("");
    try {
      await deleteAdminRider(rider.id);
      if (editingId === rider.id) {
        setEditingId(null);
        setForm(emptyForm);
        setShowForm(false);
      }
      if (payoutRider?.id === rider.id) setPayoutRider(null);
      await loadRiders();
      setPendingDelete(null);
      setMessage(`Motoristi “${rider.name}” u fshi.`);
    } catch (error) {
      setMessage(error instanceof ApiError && error.code === "RIDER_HAS_ACTIVE_ORDERS"
        ? "Motoristi ka porosi aktive. Përfundoji para fshirjes."
        : "Motoristi nuk u fshi. Provo përsëri.");
    } finally {
      setDeletingId(null);
    }
  }

  async function recordPayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payoutRider) return;
    const balance = Number(remainingBalance);
    if (!Number.isFinite(balance) || balance < 0 || balance > 5000 || balance > payoutRider.accountBalanceAll) {
      setMessage("Gjendja e re duhet të jetë nga 0 deri në 5000 ALL dhe nuk mund të rritet gjatë tërheqjes.");
      return;
    }
    setSaving(true);
    try {
      const result = await setRiderAccountBalance(payoutRider.id, balance);
      setPayoutRider(null);
      await loadRiders();
      setMessage(`Tërheqja prej ${formatLek(result.withdrawal)} u regjistrua.`);
    } catch {
      setMessage("Tërheqja nuk u regjistrua. Rifresko gjendjen dhe provo përsëri.");
    } finally { setSaving(false); }
  }

  return (
    <AdminShell
      action={
        <button
          className="type-cta flex h-12 w-full items-center justify-center rounded-xl bg-happy-orange px-5 text-white happy-pill-shadow sm:w-auto"
          onClick={() => setShowForm((current) => !current)}
          type="button"
        >
          {showForm ? (
            <X className="mr-2 h-5 w-5" />
          ) : (
            <Plus className="mr-2 h-5 w-5" />
          )}
          {showForm ? "Mbyll formen" : "Krijo motorist"}
        </button>
      }
      description="Admini krijon kredencialet, kontrollon dokumentet, statusin aktiv dhe performancen ditore te motoristeve."
      eyebrow="Menaxhim"
      title="Motoriste"
    >
      <section className="entity-metrics grid gap-3 md:grid-cols-3">
        <AdminMetric
          icon={Bike}
          label="Motoriste aktive"
          value={String(metrics.active)}
          loading={loading}
        />
        <AdminMetric
          icon={RadioTower}
          label="Online tani"
          value={String(metrics.online)}
          tone="green"
          loading={loading}
        />
        <AdminMetric
          icon={FileCheck2}
          label="Bllokuar nga debiti"
          value={String(metrics.blocked)}
          tone="blue"
          loading={loading}
        />
      </section>

      {showForm ? (
        <section className="admin-panel rounded-3xl border p-5 shadow-happy">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="type-badge uppercase tracking-wide text-happy-orange">
                Kredenciale
              </p>
              <h2 className="type-section-title mt-1">
                {editingId ? "Ndrysho motoristin" : "Krijo motorist te ri"}
              </h2>
            </div>
            <span className="type-secondary w-fit rounded-full bg-white/8 px-3 py-2 text-white/55">
              Vendos kredencialet e motoristit
            </span>
          </div>

          <form className="admin-form-grid mt-4" onSubmit={submitRider}>
            <Field label="Emri i motoristit">
              <input
                className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="P.sh. Ardit Kurti"
                required
                value={form.name}
              />
            </Field>
            <Field label="Telefoni i motoristit">
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
            <Field label="Email">
              <input
                className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                placeholder="motorist@example.com"
                type="email"
                value={form.email}
              />
            </Field>
            <Field label="Password">
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
            <Field label="Mjeti">
              <select
                className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                onChange={(event) =>
                  setForm({ ...form, vehicleType: event.target.value })
                }
                value={form.vehicleType}
              >
                {vehicleOptions.map((vehicle) => (
                  <option
                    className="bg-[#101010]"
                    key={vehicle.value}
                    value={vehicle.value}
                  >
                    {vehicle.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Targa (opsionale)">
              <input
                className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                onChange={(event) =>
                  setForm({ ...form, licenseNumber: event.target.value })
                }
                placeholder="P.sh. TR-HTC-24"
                value={form.licenseNumber}
              />
            </Field>
            <Field label="ID personale (opsionale)">
              <input className="admin-input h-11 w-full rounded-xl border px-3" value={form.personalId}
                onChange={(event)=>setForm({...form,personalId:event.target.value})} />
            </Field>
            <Field label="Statusi i motoristit">
              <select
                className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value })
                }
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
            <button
              className="type-cta col-span-full flex h-11 w-full items-center justify-center rounded-xl bg-happy-orange text-white happy-pill-shadow"
              disabled={saving}
              type="submit"
            >
              <Save className="mr-2 h-5 w-5" />
              {saving ? "Duke ruajtur..." : "Ruaj motoristin"}
            </button>
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
          kind="motoristin"
          name={pendingDelete.name}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void removeRider(pendingDelete)}
        />
      ) : null}

      <section className="admin-panel rounded-3xl border p-5 shadow-happy">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="type-section-title">Flota</h2>
          <div className="flex items-center gap-2 text-white/45">
            <span className="type-secondary">
              {loading ? "Duke lexuar..." : `${riders.length} profile`}
            </span>
            <ShieldCheck className="h-5 w-5 text-happy-orange" />
          </div>
        </div>
        <div className="list-toolbar">
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Kerko motorist"
              placeholder="Emri, telefoni ose targa..."
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
            aria-label="Filtro floten"
            value={fleetFilter}
            onChange={(event) => setFleetFilter(event.target.value)}
          >
            <option value="ALL">E gjithe flota</option>
            <option value="ONLINE">Online</option>
            <option value="BLOCKED">Bllokuar nga debiti</option>
            <option value="ELECTRIC">Elektrik</option>
            <option value="DIESEL">Diesel</option>
          </select>
        </div>
        <div className="mt-4 grid gap-3" aria-busy={loading}>
          {!loading && !filteredRiders.length && !message && (
            <div className="empty-state">
              <Bike size={30} />
              <h3>
                {riders.length
                  ? "Asnje motorist nuk perputhet"
                  : "Flota eshte ende bosh"}
              </h3>
              {riders.length ? (
                <button
                  className="text-button"
                  onClick={() => {
                    setQuery("");
                    setFleetFilter("ALL");
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
                  Krijo motorist
                </button>
              )}
            </div>
          )}
          {filteredRiders.map((rider) => (
            <article
              className="admin-soft flex flex-col justify-between gap-4 rounded-2xl border p-4 md:flex-row md:items-center"
              key={rider.id}
            >
              <div>
                <h3 className="type-restaurant">{rider.name}</h3>
                <p className="type-secondary mt-1 text-white/52">
                  {rider.licenseNumber ?? "pa dokument"} ·{" "}
                  {rider.deliveriesToday} porosi sot
                </p>
                <p className="type-secondary mt-1 text-white/45">
                  {rider.phone} · {rider.email ?? "pa email"} ·{" "}
                  {vehicleOptions.find(
                    (item) => item.value === rider.vehicleType,
                  )?.label ?? rider.vehicleType}
                </p>
                <p className="type-secondary mt-1 text-white/45">
                  Debit {formatLek(rider.platformDue)} / limit{" "}
                  {formatLek(rider.debitLimitAll)}
                </p>
                <p className="type-secondary mt-1">Fitime për t’u tërhequr: <strong>{formatLek(rider.accountBalanceAll)}</strong></p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="secondary-button" type="button" onClick={() => {
                  setPayoutRider(rider);
                  setRemainingBalance(String(Math.min(rider.accountBalanceAll, 5000)));
                  setMessage("");
                }}>Regjistro tërheqje</button>
                <button
                  aria-label={`Ndrysho ${rider.name}`}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/70 hover:border-happy-orange/50 hover:text-happy-orange"
                  onClick={() => editRider(rider)}
                  title="Ndrysho motoristin"
                  type="button"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  aria-label={`Fshi ${rider.name}`}
                  className="flex h-10 items-center justify-center gap-2 rounded-xl border border-red-300 px-3 text-red-700 hover:bg-red-50 disabled:opacity-50"
                  disabled={deletingId === rider.id}
                  onClick={() => setPendingDelete(rider)}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" /> Fshi
                </button>
                {rider.isDebitBlocked ? (
                  <span className="type-badge w-fit rounded-full bg-red-500/18 px-3 py-2 text-red-100">
                    DEBIT
                  </span>
                ) : null}
                <span
                  className={`type-badge w-fit rounded-full px-3 py-2 ${rider.isOnline ? "bg-happy-orange text-white" : "bg-white/10 text-white/58"}`}
                >
                  {rider.isOnline
                    ? "Online"
                    : (statusOptions.find((item) => item.value === rider.status)
                        ?.label ?? rider.status)}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
      {payoutRider && <section className="admin-panel rounded-2xl border p-5">
        <h2 className="type-section-title">Tërheqja e {payoutRider.name}</h2>
        <p className="type-secondary mt-2">Gjendja aktuale: {formatLek(payoutRider.accountBalanceAll)}. Vendos gjendjen që mbetet pas tërheqjes.</p>
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={recordPayout}>
          <Field label="Gjendja e re (0–5000 ALL)"><input className="admin-input h-11 rounded-xl border px-3" type="number" min="0" max="5000" step="0.01" required value={remainingBalance} onChange={event => setRemainingBalance(event.target.value)} /></Field>
          <button className="primary-button" disabled={saving} type="submit">Konfirmo tërheqjen</button>
          <button className="secondary-button" type="button" onClick={() => setPayoutRider(null)}>Mbyll</button>
        </form>
      </section>}
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
