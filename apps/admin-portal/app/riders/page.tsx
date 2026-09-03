"use client";

import {
  Bike,
  FileCheck2,
  Plus,
  RadioTower,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { AdminMetric, AdminShell } from "../../components/admin-shell";
import {
  createAdminRider,
  formatLek,
  getAdminRiders,
  type AdminRider,
} from "../../lib/api";

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  password: "",
  vehicleType: "MOTORBIKE",
  licenseNumber: "",
  status: "ACTIVE",
};

const statusOptions = [
  { value: "ACTIVE", label: "Aktiv" },
  { value: "INACTIVE", label: "Jo aktiv" },
  { value: "SUSPENDED", label: "I pezulluar" },
];

const vehicleOptions = [
  { value: "MOTORBIKE", label: "Motor" },
  { value: "DIESEL", label: "Diesel" },
];

export default function RidersPage() {
  const [riders, setRiders] = useState<AdminRider[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadRiders() {
    setLoading(true);
    try {
      const data = await getAdminRiders();
      setRiders(data.riders);
      setMessage("");
    } catch {
      setMessage("Nuk u lexuan motoristet nga databaza lokale.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
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
      await createAdminRider({
        name: form.name,
        phone: form.phone,
        email: form.email,
        password: form.password,
        vehicleType: form.vehicleType as "MOTORBIKE" | "DIESEL",
        licenseNumber: form.licenseNumber,
        status: form.status as "ACTIVE" | "INACTIVE" | "SUSPENDED",
      });
      setForm(emptyForm);
      setShowForm(false);
      await loadRiders();
      setMessage(
        "Motoristi u krijua dhe mund te hyje me email/password-in e vendosur.",
      );
    } catch {
      setMessage(
        "Krijimi i motoristit deshtoi. Kontrollo telefonin/email-in ose Postgres.",
      );
    } finally {
      setSaving(false);
    }
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
      <section className="grid gap-3 md:grid-cols-3">
        <AdminMetric
          icon={Bike}
          label="Motoriste aktive"
          value={String(metrics.active)}
        />
        <AdminMetric
          icon={RadioTower}
          label="Online tani"
          value={String(metrics.online)}
        />
        <AdminMetric
          icon={FileCheck2}
          label="Bllokuar nga debiti"
          value={String(metrics.blocked)}
        />
      </section>

      {showForm ? (
        <section className="admin-panel rounded-3xl border p-5 shadow-happy">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="type-badge uppercase tracking-wide text-happy-orange">
                Kredenciale
              </p>
              <h2 className="type-section-title mt-1">Krijo motorist te ri</h2>
            </div>
            <span className="type-secondary w-fit rounded-full bg-white/8 px-3 py-2 text-white/55">
              Vendos kredencialet e motoristit
            </span>
          </div>

          <form className="mt-4 grid gap-3" onSubmit={submitRider}>
            <Field label="Emri i motoristit">
              <input
                className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-happy-orange"
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
                className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-happy-orange"
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
                placeholder="+35569..."
                required
                value={form.phone}
              />
            </Field>
            <Field label="Email">
              <input
                className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-happy-orange"
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                placeholder="motorist@example.local"
                type="email"
                value={form.email}
              />
            </Field>
            <Field label="Password">
              <input
                className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-happy-orange"
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                placeholder="Minimumi 6 karaktere"
                required
                type="password"
                value={form.password}
              />
            </Field>
            <Field label="Mjeti">
              <select
                className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-happy-orange"
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
            <Field label="Targa / ID dokumenti">
              <input
                className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-happy-orange"
                onChange={(event) =>
                  setForm({ ...form, licenseNumber: event.target.value })
                }
                placeholder="P.sh. TR-HTC-24"
                value={form.licenseNumber}
              />
            </Field>
            <Field label="Statusi i motoristit">
              <select
                className="admin-input h-11 w-full rounded-xl border px-3 outline-none focus:border-happy-orange"
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
              className="type-cta flex h-11 items-center justify-center rounded-xl bg-happy-orange text-white happy-pill-shadow"
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
        <div className="mt-4 grid gap-3">
          {riders.map((rider) => (
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
                  {rider.vehicleType}
                </p>
                <p className="type-secondary mt-1 text-white/45">
                  Debit {formatLek(rider.platformDue)} / limit{" "}
                  {formatLek(rider.debitLimitAll)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {rider.isDebitBlocked ? (
                  <span className="type-badge w-fit rounded-full bg-red-500/18 px-3 py-2 text-red-100">
                    DEBIT
                  </span>
                ) : null}
                <span
                  className={`type-badge w-fit rounded-full px-3 py-2 ${rider.isOnline ? "bg-happy-orange text-white" : "bg-white/10 text-white/58"}`}
                >
                  {rider.isOnline ? "ONLINE" : rider.status}
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
