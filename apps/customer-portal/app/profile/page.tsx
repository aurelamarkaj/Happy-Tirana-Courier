"use client";

import { Clock3, PackageCheck, Save, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AddressAutocomplete } from "../../components/address-autocomplete";
import { CustomerHeader } from "../../components/customer-header";
import { getOrderHistory, getMe, updateMe } from "../../lib/api";
import { emptyCustomerProfile, getCustomerId, type CustomerProfile } from "../../lib/customer-session";

interface HistoryOrder {
  id?: string;
  code?: string;
  status?: string;
  business_name?: string;
  total_amount?: string | number;
  created_at?: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<CustomerProfile>(emptyCustomerProfile);
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!getCustomerId()) {
      setMessage("Bej login ose signup per te pare profilin.");
      return;
    }

    getMe()
      .then(setProfile)
      .catch(() => setMessage("Profili nuk u lexua dot nga databaza lokale."));

    getOrderHistory()
      .then((data) => setOrders(data.orders as HistoryOrder[]))
      .catch(() => setOrders([]));
  }, []);

  async function saveProfile() {
    try {
      const saved = await updateMe(profile);
      setProfile(saved);
      setMessage("Profili u ruajt ne databaze.");
    } catch {
      setMessage("Profili nuk u ruajt dot. Kontrollo API/Postgres.");
    }
  }

  return (
    <main className="happy-page min-h-screen">
      <CustomerHeader address={profile.defaultAddress} onAddressChange={(defaultAddress) => setProfile((current) => ({ ...current, defaultAddress }))} />

      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-6 md:px-6 lg:grid-cols-[380px_1fr]">
        <aside className="theme-panel rounded-2xl border p-5 shadow-happy">
          <div className="theme-soft-button grid h-14 w-14 place-items-center rounded-2xl border text-happy-orange">
            <UserRound className="h-7 w-7" />
          </div>
          <h1 className="type-screen-title theme-text mt-4">Profili</h1>
          <p className="type-body theme-muted mt-2">Ndrysho te dhenat qe perdoren automatikisht ne checkout.</p>

          <div className="mt-6 grid gap-4">
            <Field label="Emri" value={profile.name} onChange={(value) => setProfile((current) => ({ ...current, name: value }))} />
            <Field label="Telefoni" value={profile.phone} onChange={(value) => setProfile((current) => ({ ...current, phone: value }))} />
            <Field label="Email" value={profile.email} onChange={(value) => setProfile((current) => ({ ...current, email: value }))} />
            <label className="type-input theme-text block">
              Adresa
              <div className="mt-2">
                <AddressAutocomplete
                  value={profile.defaultAddress}
                  onChange={(value) => setProfile((current) => ({ ...current, defaultAddress: value }))}
                  onSelect={(suggestion) =>
                    setProfile((current) => ({
                      ...current,
                      defaultAddress: `${suggestion.label}, ${suggestion.area}`,
                      defaultLat: suggestion.lat,
                      defaultLng: suggestion.lng
                    }))
                  }
                />
              </div>
            </label>
          </div>

          {message ? <p className="type-warning mt-4 rounded-xl border border-happy-orange/25 bg-happy-orange/10 p-3 text-happy-orange">{message}</p> : null}

          <button className="type-cta mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-happy-orange text-white happy-pill-shadow" onClick={saveProfile} type="button">
            <Save className="mr-2 h-5 w-5" />
            Ruaj profilin
          </button>
        </aside>

        <section className="theme-panel rounded-2xl border p-5 shadow-happy">
          <div className="flex items-center justify-between">
            <div>
              <p className="type-badge uppercase tracking-wide text-happy-orange">Historiku</p>
              <h2 className="type-section-title theme-text mt-1">Blerjet e tua</h2>
            </div>
            <PackageCheck className="h-6 w-6 text-happy-orange" />
          </div>

          <div className="mt-5 grid gap-3">
            {orders.length === 0 ? (
              <div className="type-body theme-soft-button rounded-xl border p-5">
                Nuk ka ende porosi te ruajtura. Krijo nje porosi dhe do shfaqet ketu.
              </div>
            ) : (
              orders.map((order) => (
                <Link className="theme-soft-button rounded-xl border p-4 transition hover:border-happy-orange/60" href={`/orders/track?orderCode=${order.code}`} key={order.id ?? order.code}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <strong className="type-product theme-text">{order.code}</strong>
                      <p className="type-secondary theme-muted mt-1">{order.business_name}</p>
                    </div>
                    <span className="type-badge rounded-lg bg-happy-orange/15 px-3 py-1 text-happy-orange shadow-sm">{order.status}</span>
                  </div>
                  <div className="type-secondary theme-muted mt-3 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Clock3 className="h-4 w-4" />
                      {order.created_at ? new Date(order.created_at).toLocaleDateString("sq-AL") : "Sot"}
                    </span>
                    <span className="type-price text-happy-orange">{Number(order.total_amount ?? 0).toLocaleString("sq-AL")} ALL</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="type-input theme-text block">
      {label}
      <input className="theme-input mt-2 w-full rounded-xl border px-3 py-3 outline-none focus:border-happy-orange" onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  );
}
