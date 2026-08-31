"use client";

import { ArrowRight, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AddressAutocomplete } from "./address-autocomplete";
import { ApiError, loginCustomer, signupCustomer } from "../lib/api";
import { emptyCustomerProfile, getCustomerProfile } from "../lib/customer-session";

const themeStorageKey = "happy-tirana-theme-v3";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [profile, setProfile] = useState(emptyCustomerProfile);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = getCustomerProfile();
    setProfile(saved);
    document.documentElement.classList.toggle("happy-light-mode", window.localStorage.getItem(themeStorageKey) === "light");
  }, []);

  async function submit() {
    setError("");
    const phone = profile.phone.trim();
    const name = profile.name.trim();
    const email = profile.email.trim();
    const defaultAddress = profile.defaultAddress.trim();

    if (!phone || password.length < 4) {
      setError("Vendos telefonin dhe password-in.");
      return;
    }

    if (mode === "signup" && (!name || !defaultAddress)) {
      setError("Ploteso emrin dhe adresen kryesore.");
      return;
    }

    try {
      if (mode === "signup") {
        await signupCustomer({ ...profile, name, phone, email, defaultAddress, password });
      } else {
        await loginCustomer({ phone, password });
      }
      router.push("/checkout");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "INVALID_CUSTOMER_LOGIN") {
          setError("Telefoni ose password-i nuk jane te sakta.");
          return;
        }
        if (error.code === "CUSTOMER_PHONE_EXISTS") {
          setError("Ky numer telefoni eshte regjistruar. Provo login.");
          return;
        }
        if (error.code === "CUSTOMER_EMAIL_EXISTS") {
          setError("Ky email eshte regjistruar. Provo login.");
          return;
        }
      }
      setError("Nuk u lidh dot me API/Postgres lokal. Kontrollo qe backend dhe databaza jane ndezur.");
    }
  }

  return (
    <main className="happy-page min-h-screen">
      <section className="grid min-h-screen lg:grid-cols-2">
        <div className="relative hidden min-h-screen overflow-hidden bg-[#101010] lg:block">
          <img alt="Porosi ushqimesh dhe marketi" className="absolute inset-0 h-full w-full object-cover object-center opacity-95" src="/catalog/happy-hero-delivery.png" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#101010]/10 to-[#101010]/80" />
          <div className="absolute bottom-8 left-8 right-8 rounded-2xl border border-white/10 bg-[#101010]/68 p-4 shadow-happy backdrop-blur">
            <p className="type-badge uppercase tracking-wide text-happy-orange">Porosi lokale</p>
            <p className="type-section-title mt-1 text-white">Ushqim, market dhe farmaci ne Tirane.</p>
          </div>
        </div>

        <form className="theme-panel mx-auto my-8 w-[calc(100%-32px)] max-w-[520px] self-center rounded-2xl border p-5 shadow-happy md:p-8" onSubmit={(event) => event.preventDefault()}>
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-happy-orange/15 text-happy-orange">
            <UserRound className="h-6 w-6" />
          </div>
          <h2 className="type-screen-title theme-text mt-4">{mode === "signup" ? "Krijo llogari" : "Hyr ne llogari"}</h2>
          <p className="type-body theme-muted mt-2">
            {mode === "signup" ? "Pas regjistrimit checkout-i mbushet automatikisht." : "Te dhenat e ruajtura do shfaqen automatikisht ne checkout."}
          </p>

          <div className="mt-6 grid gap-4">
            {mode === "signup" ? <Field label="Emri" value={profile.name} onChange={(value) => setProfile((current) => ({ ...current, name: value }))} /> : null}
            <Field label="Telefoni" value={profile.phone} onChange={(value) => setProfile((current) => ({ ...current, phone: value }))} />
            {mode === "signup" ? <Field label="Email" value={profile.email} onChange={(value) => setProfile((current) => ({ ...current, email: value }))} /> : null}
            <Field label="Password" type="password" value={password} onChange={setPassword} />
            {mode === "signup" ? (
              <label className="type-input theme-text block">
                Adresa kryesore
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
            ) : null}
          </div>

          {error ? <p className="type-warning mt-4 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-red-500">{error}</p> : null}

          <button className="type-cta mt-6 flex h-12 w-full items-center justify-center rounded-lg bg-happy-orange text-white happy-pill-shadow" onClick={submit} type="button">
            {mode === "signup" ? "Regjistrohu" : "Hyr"}
            <ArrowRight className="ml-2 h-5 w-5" />
          </button>

          <p className="type-secondary theme-muted mt-5 text-center">
            {mode === "signup" ? "Ke llogari?" : "Nuk ke llogari?"}{" "}
            <Link className="text-happy-orange" href={mode === "signup" ? "/login" : "/signup"}>
              {mode === "signup" ? "Login" : "Signup"}
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}

function Field({ label, type = "text", value, onChange }: { label: string; type?: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="type-input theme-text block">
      {label}
      <input
        className="theme-input mt-2 w-full rounded-xl border px-3 py-3 outline-none focus:border-happy-orange"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}
