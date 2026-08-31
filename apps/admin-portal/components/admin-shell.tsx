"use client";

import {
  Bike,
  Building2,
  LayoutDashboard,
  LogOut,
  Map,
  ReceiptText,
  Route,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  clearAdminSession,
  getAdminSession,
  type AdminSession,
} from "../lib/admin-session";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/businesses", label: "Biznese", icon: Building2 },
  { href: "/riders", label: "Motoriste", icon: Bike },
  { href: "/zones", label: "Zona", icon: Map },
  { href: "/live-map", label: "Live Map", icon: Route },
  { href: "/finance", label: "Financa", icon: ReceiptText },
];

export function AdminShell({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(null);

  useEffect(() => {
    const currentSession = getAdminSession();
    if (!currentSession) {
      router.replace("/login");
      return;
    }
    setSession(currentSession);
  }, [router]);

  function logout() {
    clearAdminSession();
    router.replace("/login");
  }

  if (!session) {
    return (
      <main className="admin-page grid min-h-screen place-items-center px-4 text-white">
        <section className="admin-panel rounded-3xl border p-6 text-center shadow-happy">
          <img
            alt="Happy Tirana Courier"
            className="mx-auto h-14 w-24 object-contain"
            src="/happy-logo.svg"
          />
          <p className="type-body mt-4 text-white/58">Po hapet login...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page min-h-screen pb-10 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#101010]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
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
                Superadmin
              </span>
            </span>
          </Link>

          <label className="admin-soft hidden h-11 max-w-md flex-1 items-center rounded-xl border px-3 lg:flex">
            <Search className="mr-2 h-4 w-4 shrink-0 text-happy-orange" />
            <input
              className="type-input w-full bg-transparent outline-none placeholder:text-white/35"
              placeholder="Kerko biznes, motorist, porosi..."
            />
          </label>

          <div className="flex items-center gap-2">
            <div className="hidden rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right sm:block">
              <p className="type-badge text-happy-orange">{session.role}</p>
              <p className="type-secondary text-white/55">{session.name}</p>
            </div>
            <button
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70"
              onClick={logout}
              title="Dil"
              type="button"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-happy-orange">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 md:px-6 lg:grid-cols-[230px_1fr]">
        <nav className="admin-panel flex gap-2 overflow-x-auto rounded-3xl border p-2 shadow-happy lg:flex-col">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                className={`type-cta flex min-h-11 items-center gap-3 rounded-2xl px-4 py-3 transition ${
                  isActive
                    ? "bg-happy-orange text-white happy-pill-shadow"
                    : "text-white/62 hover:bg-white/8 hover:text-white"
                }`}
                href={item.href}
                key={item.href}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-5">
          <section className="admin-panel overflow-hidden rounded-3xl border p-5 shadow-happy md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="type-badge uppercase tracking-wide text-happy-orange">
                  {eyebrow}
                </p>
                <h1 className="type-screen-title mt-2">{title}</h1>
                <p className="type-body mt-2 max-w-2xl text-white/58">
                  {description}
                </p>
              </div>
              {action}
            </div>
          </section>

          {children}
        </div>
      </section>
    </main>
  );
}

export function AdminMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  value: string;
}) {
  return (
    <article className="admin-panel rounded-2xl border p-4 shadow-happy">
      <Icon className="h-5 w-5 text-happy-orange" />
      <p className="type-badge mt-4 uppercase text-white/42">{label}</p>
      <strong className="type-large-price mt-1 block">{value}</strong>
    </article>
  );
}
