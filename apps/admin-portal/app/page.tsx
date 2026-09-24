"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bike,
  Building2,
  CheckCircle2,
  MapPinned,
  Package,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminMetric, AdminShell } from "../components/admin-shell";
import {
  formatLek,
  getAdminBusinesses,
  getAdminFinance,
  getAdminLiveMap,
  getAdminRiders,
  type AdminBusiness,
  type AdminFinance,
  type AdminLiveOrder,
  type AdminRider,
} from "../lib/api";

const statusLabels: Record<string, string> = {
  CREATED: "E re",
  OFFERED: "Ne pritje",
  ACCEPTED: "E pranuar",
  PICKED_UP: "Ne transport",
  DELIVERED: "E dorezuar",
  CANCELLED: "E anuluar",
};

export default function AdminHome() {
  const [businesses, setBusinesses] = useState<AdminBusiness[] | null>(null);
  const [riders, setRiders] = useState<AdminRider[] | null>(null);
  const [orders, setOrders] = useState<AdminLiveOrder[] | null>(null);
  const [finance, setFinance] = useState<AdminFinance | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [updatedAt, setUpdatedAt] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    async function load() {
      const results = await Promise.allSettled([
        getAdminBusinesses(),
        getAdminRiders(),
        getAdminLiveMap(),
        getAdminFinance(),
      ]);
      if (!mounted) return;
      const [businessResult, riderResult, liveResult, financeResult] = results;
      setBusinesses(
        businessResult.status === "fulfilled"
          ? businessResult.value.businesses
          : null,
      );
      setRiders(
        riderResult.status === "fulfilled" ? riderResult.value.riders : null,
      );
      setOrders(
        liveResult.status === "fulfilled" ? liveResult.value.orders : null,
      );
      setFinance(
        financeResult.status === "fulfilled" ? financeResult.value : null,
      );
      setErrors(
        results.flatMap((result, index) =>
          result.status === "rejected"
            ? [["bizneset", "motoristet", "porosite", "financat"][index]]
            : [],
        ),
      );
      setUpdatedAt(
        results.every((result) => result.status === "fulfilled")
          ? new Date().toLocaleTimeString("sq-AL", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "",
      );
      setLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [refresh]);

  const waiting =
    orders?.filter((order) => ["CREATED", "OFFERED"].includes(order.status)) ??
    [];
  const blocked = riders?.filter((rider) => rider.isDebitBlocked) ?? [];
  const filteredOrders =
    orders?.filter((order) => {
      const matchesStatus =
        filter === "all" ||
        (filter === "waiting"
          ? ["CREATED", "OFFERED"].includes(order.status)
          : ["ACCEPTED", "PICKED_UP"].includes(order.status));
      return (
        matchesStatus &&
        `${order.code} ${order.businessName} ${order.dropoffAddress}`
          .toLowerCase()
          .includes(query.toLowerCase().trim())
      );
    }) ?? [];
  const online = riders?.filter((rider) => rider.isOnline).length ?? 0;

  return (
    <AdminShell
      eyebrow="OPERACIONET"
      title="Pasqyra e platformes"
      description=""
      action={
        <>
          <button
            className="icon-button refresh-button"
            title="Rifresko te dhenat"
            aria-label="Rifresko te dhenat"
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw size={17} className={loading ? "spin" : ""} />
          </button>
          <Link className="primary-button" href="/live-map">
            <MapPinned size={17} />
            Harta live
            <ArrowRight size={16} />
          </Link>
        </>
      }
    >
      <div className="dashboard-meta" role="status">
        <span
          className={`status-dot ${errors.length ? "is-warning" : loading ? "is-loading" : ""}`}
        />
        {loading
          ? "Duke ngarkuar te dhenat..."
          : errors.length
            ? "Disa te dhena mungojne"
            : `Perditesuar ne ${updatedAt}`}
      </div>
      {errors.length > 0 && (
        <div className="notice" role="alert">
          <AlertTriangle size={19} />
          <span>Nuk u ngarkuan: {errors.join(", ")}. Provo perseri.</span>
          <button
            className="text-button"
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Riprovo
          </button>
        </div>
      )}

      <section
        className="dashboard-metrics"
        aria-label="Statistikat e platformes"
      >
        <AdminMetric
          icon={Package}
          label="Porosi aktive"
          value={orders ? String(orders.length) : "--"}
          detail={
            orders
              ? `${waiting.length} ne pritje te motoristit`
              : "Te dhenat mungojne"
          }
          tone="blue"
          loading={loading}
        />
        <AdminMetric
          icon={Bike}
          label="Motoriste online"
          value={riders ? String(online) : "--"}
          detail={
            riders
              ? `${riders.length} motoriste ne flote`
              : "Te dhenat mungojne"
          }
          tone="green"
          loading={loading}
        />
        <AdminMetric
          icon={Building2}
          label="Biznese aktive"
          value={
            businesses
              ? String(
                  businesses.filter((item) => item.status === "ACTIVE").length,
                )
              : "--"
          }
          detail={
            businesses
              ? `${businesses.length} biznese te regjistruara`
              : "Te dhenat mungojne"
          }
          tone="orange"
          loading={loading}
        />
        <AdminMetric
          icon={ReceiptText}
          label="Komisioni i platformes"
          value={finance ? formatLek(finance.metrics.platformCommission) : "--"}
          detail="20% e transportit te dorezuar"
          tone="violet"
          loading={loading}
        />
      </section>

      <div className="dashboard-columns">
        <section className="orders-section" aria-labelledby="orders-title">
          <div className="section-heading">
            <div className="heading-with-count">
              <h2 id="orders-title">Porosite aktive</h2>
              <span className="count-badge">{orders?.length ?? "--"}</span>
            </div>
            <Link className="text-link" href="/live-map">
              Shiko ne harte
              <ArrowRight size={15} />
            </Link>
          </div>
          <div className="order-controls">
            <div
              className="segmented-control"
              aria-label="Filtro porosite"
              role="group"
            >
              {[
                { id: "all", label: "Te gjitha" },
                { id: "waiting", label: "Ne pritje" },
                { id: "delivery", label: "Ne dergese" },
              ].map((item) => (
                <button
                  key={item.id}
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Kerko porosi"
                placeholder="Kerko porosi..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  title="Pastro kerkimin"
                  aria-label="Pastro kerkimin"
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              )}
            </label>
          </div>
          <div className="table-scroll" aria-busy={loading}>
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Porosia / Biznesi</th>
                  <th>Destinacioni</th>
                  <th>Statusi</th>
                  <th>Totali</th>
                  <th>
                    <span className="sr-only">Veprime</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {!loading &&
                  filteredOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong>{order.code}</strong>
                        <Link className="cell-secondary text-link" href={`/businesses/${order.businessId}/orders`}>
                          {order.businessName}
                        </Link>
                      </td>
                      <td className="destination-cell">
                        {order.dropoffAddress}
                      </td>
                      <td>
                        <span
                          className={`order-status status-${order.status.toLowerCase()}`}
                        >
                          {statusLabels[order.status] ?? order.status}
                        </span>
                      </td>
                      <td className="amount-cell">
                        {formatLek(order.totalAmount)}
                      </td>
                      <td>
                        <Link
                          className="icon-button"
                          href="/live-map"
                          title="Hap harten e porosive"
                          aria-label={`Hap harten e porosive: ${order.code}`}
                        >
                          <ArrowRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {loading ? (
            <div className="empty-state" role="status">
              <RefreshCw size={25} className="spin" />
              <h3>Po ngarkohen porosite...</h3>
            </div>
          ) : orders === null ? (
            <div className="empty-state">
              <AlertTriangle size={30} />
              <h3>Porosite nuk u ngarkuan</h3>
              <button
                className="secondary-button"
                onClick={() => setRefresh((value) => value + 1)}
              >
                <RefreshCw size={16} />
                Provo perseri
              </button>
            </div>
          ) : !filteredOrders.length ? (
            <div className="empty-state">
              <span className="empty-icon">
                <Package size={29} strokeWidth={1.4} />
              </span>
              <h3>
                {orders.length ? "Asnje rezultat" : "Nuk ka porosi aktive"}
              </h3>
              {orders.length ? (
                <button
                  className="text-button"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Pastro filtrat
                </button>
              ) : (
                <p>Porosite e reja do te shfaqen ketu.</p>
              )}
            </div>
          ) : null}
          <div className="section-footnote">
            <span>
              {loading
                ? "Duke ngarkuar..."
                : orders
                  ? `${filteredOrders.length} nga ${orders.length} porosi aktive`
                  : "Te dhenat mungojne"}
            </span>
            <span>Transporti</span>
          </div>
        </section>

        <aside className="dashboard-aside" aria-label="Flota dhe financat">
          <section className="overview-section">
            <div className="section-heading">
              <h2>Gjendja e flotes</h2>
              <Bike size={18} className="muted" />
            </div>
            <div className="fleet-summary">
              <span className="fleet-value">
                {loading || !riders ? "--" : online}
              </span>
              <span>
                motoriste online
                <span className="cell-secondary">
                  {riders ? `${riders.length} gjithsej` : "Te dhenat mungojne"}
                </span>
              </span>
            </div>
            <div className="fleet-meter" aria-hidden="true">
              <span
                style={{
                  width: `${riders?.length ? (online / riders.length) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="detail-row">
              <span>Jashte linje</span>
              <strong>
                {loading || !riders ? "--" : riders.length - online}
              </strong>
            </div>
            <div className="detail-row">
              <span>Bllokuar nga debiti</span>
              <strong className={blocked.length ? "warning-text" : ""}>
                {loading || !riders ? "--" : blocked.length}
              </strong>
            </div>
            <Link className="text-link" href="/riders">
              Menaxho floten
              <ArrowRight size={15} />
            </Link>
          </section>
          <section className="overview-section">
            <div className="section-heading">
              <h2>Bilanci i transportit</h2>
              <Wallet size={18} className="muted" />
            </div>
            <div className="finance-total">
              {loading || !finance
                ? "--"
                : formatLek(finance.metrics.totalTransportFee)}
            </div>
            <p className="muted text-sm">
              {finance
                ? `${finance.metrics.deliveredOrders} porosi te dorezuara`
                : "Te dhenat mungojne"}
            </p>
            <div className="detail-row finance-row">
              <span>
                <i className="legend-dot green" />
                Motoristet <small>80%</small>
              </span>
              <strong>
                {loading || !finance
                  ? "--"
                  : formatLek(finance.metrics.riderEarnings)}
              </strong>
            </div>
            <div className="detail-row finance-row">
              <span>
                <i className="legend-dot orange" />
                Platforma <small>20%</small>
              </span>
              <strong>
                {loading || !finance
                  ? "--"
                  : formatLek(finance.metrics.platformCommission)}
              </strong>
            </div>
            <Link className="text-link" href="/finance">
              Hap financat
              <ArrowRight size={15} />
            </Link>
          </section>
        </aside>
      </div>

      <section className="attention-section">
        <div>
          {blocked.length || riders === null ? (
            <AlertTriangle
              size={20}
              className={blocked.length ? "warning-text" : "muted"}
            />
          ) : (
            <CheckCircle2 size={20} className="success-text" />
          )}
          <h2>Vemendje operative</h2>
        </div>
        <span>
          {loading
            ? "Duke kontrolluar..."
            : riders === null
              ? "Gjendja e debitit nuk u ngarkua"
              : blocked.length
                ? `${blocked.length} motoriste te bllokuar nga debiti`
                : "Asnje motorist i bllokuar nga debiti"}
        </span>
        {blocked.length > 0 && (
          <Link className="text-link" href="/riders">
            Shiko motoristet
            <ArrowRight size={15} />
          </Link>
        )}
      </section>
      <section className="quick-actions" aria-label="Veprime te shpejta">
        <Link href="/businesses?create=1">
          <span className="quick-icon">
            <Building2 size={21} />
          </span>
          <span>
            <strong>Shto biznes</strong>
            <small>Biznes i ri ne platforme</small>
          </span>
          <Plus size={19} />
        </Link>
        <Link href="/riders?create=1">
          <span className="quick-icon green">
            <Bike size={21} />
          </span>
          <span>
            <strong>Shto motorist</strong>
            <small>Zgjero floten e dergesave</small>
          </span>
          <Plus size={19} />
        </Link>
        <Link href="/zones">
          <span className="quick-icon blue">
            <MapPinned size={21} />
          </span>
          <span>
            <strong>Zonat e sherbimit</strong>
            <small>Zona dhe tarifa transporti</small>
          </span>
          <ArrowRight size={19} />
        </Link>
      </section>
    </AdminShell>
  );
}
