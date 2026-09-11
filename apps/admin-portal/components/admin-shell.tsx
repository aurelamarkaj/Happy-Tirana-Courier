"use client";

import {
  Bike,
  Building2,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  ReceiptText,
  Route,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  clearAdminSession,
  getAdminSession,
  type AdminSession,
} from "../lib/admin-session";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/live-map", label: "Harta live", icon: Route },
  { href: "/businesses", label: "Biznese", icon: Building2 },
  { href: "/riders", label: "Motoriste", icon: Bike },
  { href: "/zones", label: "Zona", icon: Map },
  { href: "/finance", label: "Financa", icon: ReceiptText },
];

export function AdminShell({
  eyebrow,
  title,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);

  useEffect(() => {
    const currentSession = getAdminSession();
    if (!currentSession) {
      router.replace("/login");
      return;
    }
    setSession(currentSession);
  }, [router]);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    navigation.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
      if (event.key === "Tab") {
        const elements =
          navigation.current?.querySelectorAll<HTMLElement>("a, button");
        if (!elements?.length) return;
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    function resize() {
      if (window.innerWidth >= 1024) setMenuOpen(false);
    }
    window.addEventListener("keydown", keydown);
    window.addEventListener("resize", resize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", resize);
      requestAnimationFrame(() => menuButton.current?.focus());
    };
  }, [menuOpen]);

  function logout() {
    clearAdminSession();
    router.replace("/login");
  }
  if (!session)
    return (
      <main className="session-loading">
        <img
          src="/happy-logo.svg"
          alt="Happy Tirana Courier"
          width={72}
          height={72}
        />
        <p role="status">Po hapet paneli...</p>
      </main>
    );

  return (
    <div className="admin-page admin-frame">
      <a className="skip-link" href="#main-content">
        Kalo te permbajtja
      </a>
      {menuOpen && (
        <button
          className="nav-backdrop"
          aria-label="Mbyll menune"
          onClick={() => {
            setMenuOpen(false);
            menuButton.current?.focus();
          }}
          tabIndex={-1}
        />
      )}
      <aside
        className={`admin-sidebar ${menuOpen ? "is-open" : ""}`}
        ref={navigation}
        aria-label="Menuja kryesore"
        role={menuOpen ? "dialog" : undefined}
        aria-modal={menuOpen || undefined}
      >
        <Link
          className="sidebar-brand"
          href="/"
          onClick={() => setMenuOpen(false)}
        >
          <img src="/happy-logo.svg" alt="" width={44} height={44} />
          <span>
            <strong>Happy Tirana</strong>
            <small>COURIER</small>
          </span>
        </Link>
        <div className="sidebar-label">HAPESIRA E PUNES</div>
        <nav aria-label="Navigimi kryesor">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`sidebar-link ${pathname === href ? "is-active" : ""}`}
              aria-current={pathname === href ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
              {pathname === href && (
                <ChevronRight
                  size={15}
                  className="nav-chevron"
                  aria-hidden="true"
                />
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-location">
            <Map size={16} />
            <span>Tirane, Shqiperi</span>
          </div>
          <div className="sidebar-account">
            <span className="account-avatar">
              <ShieldCheck size={19} />
            </span>
            <span className="account-info">
              <strong>{session.name}</strong>
              <small>
                {session.role === "SUPERADMIN" ? "Superadmin" : "Administrator"}
              </small>
            </span>
            <button
              className="icon-button"
              title="Dil nga llogaria"
              aria-label="Dil nga llogaria"
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
        <button
          className="mobile-menu-close icon-button"
          onClick={() => {
            setMenuOpen(false);
            menuButton.current?.focus();
          }}
          aria-label="Mbyll menune"
        >
          <X size={20} />
        </button>
      </aside>
      <div className="admin-workspace" inert={menuOpen || undefined}>
        <header className="workspace-topbar">
          <div className="topbar-path">
            <button
              ref={menuButton}
              className="icon-button mobile-menu-toggle"
              aria-label="Hap menune"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>Happy Tirana</span>
            <ChevronRight size={14} aria-hidden="true" />
            <strong>
              {navItems.find((item) => item.href === pathname)?.label ?? title}
            </strong>
          </div>
          <span className="topbar-location">Happy Tirana Courier</span>
        </header>
        <main className="workspace-content" id="main-content" tabIndex={-1}>
          <header className="page-heading">
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
            </div>
            {action && <div className="page-actions">{action}</div>}
          </header>
          {children}
          <footer className="workspace-footer">
            <span>Happy Tirana Courier</span>
            <span>Paneli i administrimit</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export function AdminMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "orange",
  loading = false,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  value: string;
  detail?: string;
  tone?: "orange" | "green" | "blue" | "violet";
  loading?: boolean;
}) {
  return (
    <article className={`metric-item metric-${tone}`} aria-busy={loading}>
      <div className="metric-top">
        <p>{label}</p>
        <span className="metric-icon">
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      {loading ? (
        <div className="metric-skeleton" aria-label="Duke ngarkuar" />
      ) : (
        <strong className="metric-value">{value}</strong>
      )}
      {detail && (
        <p className="metric-detail">{loading ? "Duke ngarkuar..." : detail}</p>
      )}
    </article>
  );
}
