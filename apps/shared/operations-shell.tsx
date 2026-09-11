"use client";

import {
  ChevronRight,
  LogOut,
  Menu,
  RefreshCw,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type OperationsNavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
};

export function OperationsShell({
  role,
  name,
  title,
  active,
  items,
  onNavigate,
  onLogout,
  onRefresh,
  refreshing,
  action,
  children,
}: {
  role: string;
  name: string;
  title: string;
  active: string;
  items: OperationsNavItem[];
  onNavigate?: (id: string) => void;
  onLogout: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menu.current?.querySelector<HTMLElement>("a, button")?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab") return;
      const targets = menu.current?.querySelectorAll<HTMLElement>("a, button");
      if (!targets?.length) return;
      const first = targets[0],
        last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    function resize() {
      if (innerWidth >= 1024) setOpen(false);
    }
    window.addEventListener("keydown", keydown);
    window.addEventListener("resize", resize);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", resize);
      requestAnimationFrame(() => trigger.current?.focus());
    };
  }, [open]);
  function select(id: string) {
    onNavigate?.(id);
    setOpen(false);
  }
  return (
    <div className="ops-frame">
      <a className="ops-skip" href="#ops-content">
        Kalo te permbajtja
      </a>
      {open && (
        <button
          className="ops-backdrop"
          aria-label="Mbyll menune"
          tabIndex={-1}
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`ops-sidebar ${open ? "is-open" : ""}`}
        ref={menu}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label="Menuja kryesore"
      >
        <Link className="ops-brand" href="/">
          <img src="/happy-logo.svg" alt="" width={44} height={44} />
          <span>
            <strong>Happy Tirana</strong>
            <small>COURIER</small>
          </span>
        </Link>
        <p className="ops-nav-label">HAPESIRA E PUNES</p>
        <nav aria-label="Navigimi kryesor">
          {items.map((item) => {
            const content = (
              <>
                <item.icon size={18} />
                <span>{item.label}</span>
                {active === item.id && (
                  <ChevronRight size={14} className="ops-chevron" />
                )}
              </>
            );
            const props = {
              className: `ops-nav-link ${active === item.id ? "is-active" : ""}`,
              "aria-current":
                active === item.id ? ("page" as const) : undefined,
            };
            return item.href ? (
              <Link
                {...props}
                href={item.href}
                key={item.id}
                onClick={() => setOpen(false)}
              >
                {content}
              </Link>
            ) : (
              <button {...props} key={item.id} onClick={() => select(item.id)}>
                {content}
              </button>
            );
          })}
        </nav>
        <div className="ops-account">
          <span className="ops-avatar">
            <ShieldCheck size={18} />
          </span>
          <span>
            <strong>{name}</strong>
            <small>{role}</small>
          </span>
          <button
            className="ops-icon"
            title="Dil nga llogaria"
            aria-label="Dil nga llogaria"
            onClick={onLogout}
          >
            <LogOut size={17} />
          </button>
        </div>
        <button
          className="ops-menu-close ops-icon"
          aria-label="Mbyll menune"
          onClick={() => setOpen(false)}
        >
          <X size={20} />
        </button>
      </aside>
      <div className="ops-workspace" inert={open || undefined}>
        <header className="ops-topbar">
          <div>
            <button
              className="ops-menu-toggle ops-icon"
              ref={trigger}
              aria-label="Hap menune"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>Happy Tirana</span>
            <ChevronRight size={14} />
            <strong>{role}</strong>
          </div>
          <span className="ops-topbar-note">Tirane, Shqiperi</span>
        </header>
        <main id="ops-content" className="ops-content" tabIndex={-1}>
          <header className="ops-heading">
            <div>
              <p className="ops-eyebrow">{role}</p>
              <h1>{title}</h1>
            </div>
            <div className="ops-heading-actions">
              <button
                className="ops-icon ops-refresh"
                title="Rifresko te dhenat"
                aria-label="Rifresko te dhenat"
                disabled={refreshing}
                onClick={onRefresh}
              >
                <RefreshCw size={17} className={refreshing ? "ops-spin" : ""} />
              </button>
              {action}
            </div>
          </header>
          {children}
          <footer className="ops-footer">
            <span>Happy Tirana Courier</span>
            <span>{role}</span>
          </footer>
        </main>
        <nav className="ops-mobile-nav" aria-label="Navigimi i shpejte">
          {items.map((item) => {
            const props = {
              className: active === item.id ? "is-active" : "",
              "aria-current":
                active === item.id ? ("page" as const) : undefined,
            };
            const content = (
              <>
                <item.icon size={20} />
                <span>{item.label}</span>
              </>
            );
            return item.href ? (
              <Link {...props} href={item.href} key={item.id}>
                {content}
              </Link>
            ) : (
              <button {...props} key={item.id} onClick={() => select(item.id)}>
                {content}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function OperationsMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "orange",
  loading = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone?: "orange" | "green" | "blue";
  loading?: boolean;
}) {
  return (
    <article className={`ops-metric ops-tone-${tone}`} aria-busy={loading}>
      <div>
        <span>{label}</span>
        <Icon size={18} />
      </div>
      {loading ? <span className="ops-skeleton" /> : <strong>{value}</strong>}
      <small>{loading ? "Duke ngarkuar..." : detail}</small>
    </article>
  );
}

export function OperationsSearch({
  value,
  onChange,
  label = "Kerko porosi",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <input
      className="ops-search"
      type="search"
      aria-label={label}
      placeholder={label + "..."}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
