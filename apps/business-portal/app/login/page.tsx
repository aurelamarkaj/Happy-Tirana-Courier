"use client";

import { ArrowRight, LockKeyhole, Mail, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { BusinessApiError, loginBusiness } from "../../lib/api";

export default function BusinessLoginPage() {
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
      await loginBusiness({ email, password });
      router.replace("/");
    } catch (error) {
      setMessage(error instanceof BusinessApiError && error.code === "BUSINESS_SUSPENDED"
        ? "Biznesi është i pezulluar dhe nuk mund të hyjë tani. Kontakto administratorin."
        : error instanceof BusinessApiError && error.code === "BUSINESS_INACTIVE"
          ? "Biznesi është joaktiv dhe nuk mund të hyjë tani. Kontakto administratorin për aktivizim."
          : "Hyrja nuk u krye. Kontrollo email-in dhe fjalëkalimin.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="business-page min-h-screen text-white">
      <section className="grid min-h-screen lg:grid-cols-2">
        <div className="relative hidden min-h-screen overflow-hidden bg-[#101010] lg:block">
          <img
            alt="Biznes me porosi online"
            className="absolute inset-0 h-full w-full object-cover object-center"
            src="/catalog/business-market.webp"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-black/30 to-[#101010]/82" />
        </div>

        <form
          className="business-panel mx-auto my-8 w-[calc(100%-32px)] max-w-[520px] self-center rounded-2xl border p-5 shadow-happy md:p-8"
          onSubmit={submit}
        >
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-happy-orange/15 text-happy-orange">
            <Store className="h-6 w-6" />
          </div>
          <h1 className="type-screen-title mt-4">Hyrja e biznesit</h1>
          <p className="type-body mt-2 text-white/58">
            Hyr me kredencialet që janë krijuar nga superadmini.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="type-input block">
              Email
              <span className="business-soft mt-2 flex h-12 items-center rounded-xl border px-3 focus-within:border-white/35">
                <Mail className="mr-3 h-5 w-5 text-happy-orange" />
                <input
                  className="w-full bg-transparent outline-none focus:outline-none placeholder:text-white/35"
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  required
                  value={email}
                />
              </span>
            </label>
            <label className="type-input block">
              Fjalëkalimi
              <span className="business-soft mt-2 flex h-12 items-center rounded-xl border px-3 focus-within:border-white/35">
                <LockKeyhole className="mr-3 h-5 w-5 text-happy-orange" />
                <input
                  className="w-full bg-transparent outline-none focus:outline-none placeholder:text-white/35"
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
              className="type-warning mt-4 rounded-xl border border-happy-orange/30 bg-happy-orange/10 p-3 text-happy-orange"
            >
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
