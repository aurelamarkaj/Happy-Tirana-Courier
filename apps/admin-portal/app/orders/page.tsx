"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { cancelAdminOrder, formatLek, getAdminOrders, type AdminOrder } from "../../lib/api";

const statuses = [
  ["", "Të gjitha statuset"], ["CREATED", "Krijuar"], ["OFFERED", "Ofertuar"],
  ["ACCEPTED", "Pranuar"], ["PICKED_UP", "Marrë nga biznesi"],
  ["DELIVERED", "Dorëzuar"], ["CANCELLED", "Anuluar"],
] as const;

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const result = await getAdminOrders({ q, status, page });
      setOrders(result.orders);
      setTotal(result.total);
    } catch {
      setMessage("Porositë nuk u lexuan. Hyr sërish si admin dhe provo përsëri.");
    }
  }, [q, status, page]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function cancel(order: AdminOrder) {
    setBusy(true);
    try {
      await cancelAdminOrder(order.id);
      setConfirmId(null);
      await refresh();
      setMessage(`Porosia ${order.code} u anulua.`);
    } catch {
      setMessage("Anulimi nuk u krye. Rifresko porositë dhe provo përsëri.");
    } finally { setBusy(false); }
  }

  return <AdminShell eyebrow="MENAXHIM" title="Porositë" description="Të gjitha porositë e bizneseve dhe anulimi nga administratori.">
    <section className="admin-panel rounded-2xl border p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="type-section-title">Porositë e bizneseve</h2><p className="muted mt-1">{total} porosi gjithsej</p></div>
        <div className="flex flex-wrap gap-3">
          <input aria-label="Kërko porosi" className="admin-input h-11 rounded-xl border px-3" placeholder="Kodi, biznesi ose klienti" value={q} onChange={event => {setQ(event.target.value);setPage(1);}} />
          <select aria-label="Filtro porositë" className="admin-input h-11 rounded-xl border px-3" value={status} onChange={event => {setStatus(event.target.value);setPage(1);}}>
            {statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </div>
      </div>
      {message && <p className="notice mt-4" role="status">{message}</p>}
      <div className="mt-5 grid gap-3">
        {orders.length === 0 && <p className="muted">Nuk ka porosi për këtë filtër.</p>}
        {orders.map(order => <article className="admin-soft rounded-xl border p-4" key={order.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <strong>{order.code}</strong> <span className="muted">· {order.status}</span>
              <p className="mt-1"><Link href={`/businesses/${order.businessId}/orders`}>{order.businessName}</Link> · {order.customerName ?? "Klient pa emër"}</p>
              <p className="muted mt-1">{order.dropoffAddress} · {new Date(order.createdAt).toLocaleString("sq-AL")}</p>
            </div>
            {order.status !== "DELIVERED" && order.status !== "CANCELLED" && (
              confirmId === order.id ? <div className="flex items-center gap-2">
                <span>Konfirmo anulimin?</span>
                <button type="button" className="secondary-button" disabled={busy} onClick={() => void cancel(order)}>Po, anulo</button>
                <button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirmId(null)}>Jo</button>
              </div> : <button type="button" className="secondary-button" onClick={() => setConfirmId(order.id)}>Anulo</button>
            )}
          </div>
          <p className="mt-3">Vlera e porosisë: {formatLek(order.productValue)} · Transporti: {formatLek(order.transportFee)} · Klienti: <strong>{formatLek(order.totalAmount)}</strong></p>
        </article>)}
      </div>
      <div className="mt-5 flex items-center justify-end gap-3">
        <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Mbrapa</button>
        <span>Faqja {page} nga {Math.max(1, Math.ceil(total / 50))}</span>
        <button type="button" className="secondary-button" disabled={page * 50 >= total} onClick={() => setPage(value => value + 1)}>Tjetra</button>
      </div>
    </section>
  </AdminShell>;
}
