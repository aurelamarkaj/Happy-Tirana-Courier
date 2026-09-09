"use client";

import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { loginRider } from "../../lib/api";

export default function RiderLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("reason") ===
      "session-expired"
    ) {
      setMessage(
        "Hyrja e ruajtur nuk eshte me e vlefshme. Te lutem, hyr perseri.",
      );
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      await loginRider({ email, password });
      router.replace("/");
    } catch {
      setMessage("Login nuk u krye. Kontrollo API/Postgres ose kredencialet.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="rider-page min-h-screen text-white">
      <section className="grid min-h-screen lg:grid-cols-2">
        <div className="relative hidden min-h-screen overflow-hidden bg-[#101010] lg:block">
          <img
            alt="Kurier me porosi ne Tirane"
            className="absolute inset-0 h-full w-full object-cover object-center opacity-100"
            src="/catalog/happy-hero-delivery.png"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#101010]/5 to-[#101010]/72" />
          <div className="absolute bottom-8 left-8 right-8 rounded-2xl border border-white/10 bg-[#101010]/62 p-4 shadow-happy backdrop-blur">
            <p className="type-badge uppercase tracking-wide text-happy-orange">
              Rider app
            </p>
            <p className="type-section-title mt-1 text-white">
              Prano porosi, ndiq rrugen dhe mbyll dorezimin.
            </p>
          </div>
        </div>

        <form
          className="rider-panel mx-auto my-8 w-[calc(100%-32px)] max-w-[520px] self-center rounded-2xl border p-5 shadow-happy md:p-8"
          onSubmit={submit}
        >
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-happy-orange/15 text-happy-orange">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="type-screen-title mt-4">Login motoristi</h1>
          <p className="type-body mt-2 text-white/58">
            Kredencialet krijohen nga superadmini. Pas hyrjes hapet dashboard-i
            me porosi live.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="type-input block">
              Email
              <span className="rider-soft mt-2 flex h-12 items-center rounded-xl border px-3">
                <Mail className="mr-3 h-5 w-5 text-happy-orange" />
                <input
                  className="w-full bg-transparent outline-none placeholder:text-white/35"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </span>
            </label>

            <label className="type-input block">
              Password
              <span className="rider-soft mt-2 flex h-12 items-center rounded-xl border px-3">
                <LockKeyhole className="mr-3 h-5 w-5 text-happy-orange" />
                <input
                  className="w-full bg-transparent outline-none placeholder:text-white/35"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </span>
            </label>
          </div>

          {message ? (
            <p
              role="alert"
              className="type-warning mt-4 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-red-500"
            >
              {message}
            </p>
          ) : null}

          <button
            className="type-cta mt-6 flex h-12 w-full items-center justify-center rounded-lg bg-happy-orange text-white happy-pill-shadow"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Duke hyre..." : "Hyr"}
            <ArrowRight className="ml-2 h-5 w-5" />
          </button>
          <p className="type-secondary mt-4 text-center text-white/50">
            Nuk ke llogari?{" "}
            <Link className="font-semibold text-happy-orange" href="/signup">
              Kerko akses
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
