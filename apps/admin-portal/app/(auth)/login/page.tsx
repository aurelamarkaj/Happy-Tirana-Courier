"use client";

import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { loginAdmin } from "../../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      await loginAdmin({ email, password });
      router.replace("/");
    } catch {
      setMessage("Login nuk u krye. Kontrollo kredencialet ose API/Postgres.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-page min-h-screen text-white">
      <section className="grid min-h-screen lg:grid-cols-2">
        <div className="relative hidden min-h-screen overflow-hidden bg-[#101010] lg:block">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,85,0,0.28),rgba(16,16,16,0.8)),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:auto,52px_52px,52px_52px]" />
          <div className="relative flex h-full flex-col justify-between p-8">
            <img
              alt="Happy Tirana Courier"
              className="h-16 w-28 object-contain"
              src="/happy-logo.svg"
            />
            <div className="max-w-md">
              <p className="type-badge uppercase tracking-wide text-happy-orange">
                Superadmin
              </p>
              <h1 className="type-screen-title mt-3">
                Kontroll qendror per operacionin.
              </h1>
              <p className="type-body mt-3 text-white/62">
                Biznese, motoriste, zona, porosi live dhe financa ne nje panel
                te vetem.
              </p>
            </div>
          </div>
        </div>

        <form
          className="admin-panel mx-auto my-8 w-[calc(100%-32px)] max-w-[520px] self-center rounded-2xl border p-5 shadow-happy md:p-8"
          onSubmit={submit}
        >
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-happy-orange/15 text-happy-orange">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="type-screen-title mt-4">Admin Login</h1>
          <p className="type-body mt-2 text-white/58">
            Hyr per te menaxhuar platformen Happy Tirana Courier.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="type-input block">
              Email
              <span className="admin-input mt-2 flex h-12 items-center rounded-xl border px-3">
                <Mail className="mr-3 h-5 w-5 text-happy-orange" />
                <input
                  className="w-full bg-transparent outline-none"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </span>
            </label>
            <label className="type-input block">
              Fjalekalimi
              <span className="admin-input mt-2 flex h-12 items-center rounded-xl border px-3">
                <LockKeyhole className="mr-3 h-5 w-5 text-happy-orange" />
                <input
                  className="w-full bg-transparent outline-none"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </span>
            </label>
          </div>

          {message ? (
            <p className="type-warning mt-4 rounded-xl border border-happy-orange/30 bg-happy-orange/10 p-3 text-happy-orange">
              {message}
            </p>
          ) : null}

          <button
            className="type-cta mt-6 flex h-12 w-full items-center justify-center rounded-lg bg-happy-orange text-white happy-pill-shadow disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Po hyn..." : "Hyr"}
            <ArrowRight className="ml-2 h-5 w-5" />
          </button>
          <p className="type-secondary mt-4 text-center text-white/50">
            Nuk ke akses?{" "}
            <Link className="font-semibold text-happy-orange" href="/signup">
              Kerko llogari
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
