"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminShell } from "../../../../components/admin-shell";
import { cancelAdminOrder, formatLek, getAdminBusinessOrders, type AdminBusinessOrder } from "../../../../lib/api";

export default function BusinessOrdersPage() {
  const { id } = useParams<{ id: string }>();
  const [business, setBusiness] = useState<{name:string;category:string|null}|null>(null);
  const [orders, setOrders] = useState<AdminBusinessOrder[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string|null>(null);
  async function refresh() {
    try { const result = await getAdminBusinessOrders(id); setBusiness(result.business); setOrders(result.orders); setMessage(""); }
    catch { setMessage("Porositë nuk u lexuan. Hyr sërish si admin dhe provo përsëri."); }
  }
  useEffect(() => { if(id) void refresh(); }, [id]);
  async function cancel(order: AdminBusinessOrder) {
    if (!window.confirm(`Anulo porosinë ${order.code}?`)) return;
    setBusy(order.id);
    try { await cancelAdminOrder(order.id); await refresh(); setMessage(`Porosia ${order.code} u anulua.`); }
    catch { setMessage("Anulimi nuk u krye. Rifresko porositë dhe provo përsëri."); }
    finally { setBusy(null); }
  }
  return <AdminShell eyebrow="BIZNESET" title={business ? `Porositë: ${business.name}` : "Porositë e biznesit"}
    description={business?.category ?? ""} action={<Link className="secondary-button" href="/businesses">Kthehu te bizneset</Link>}>
    {message && <p className="notice" role="status">{message}</p>}
    <section className="admin-panel rounded-2xl border p-5">
      <h2 className="type-section-title">Historiku i porosive</h2>
      <div className="mt-4 grid gap-3">
        {orders.length === 0 && <p className="muted">Nuk ka porosi për këtë biznes.</p>}
        {orders.map(order => <article className="admin-soft rounded-xl border p-4" key={order.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><strong>{order.code}</strong><p className="muted mt-1">{order.dropoffAddress}</p>
              <p className="muted mt-1">{new Date(order.createdAt).toLocaleString("sq-AL")} · {order.status}</p></div>
            {order.status !== "DELIVERED" && order.status !== "CANCELLED" && <button type="button" className="secondary-button" disabled={busy===order.id} onClick={() => void cancel(order)}>Anulo</button>}
          </div>
          <p className="mt-3">Vlera e porosisë: {formatLek(order.productValue)} · Transporti: {formatLek(order.transportFee)} · Klienti: <strong>{formatLek(order.totalAmount)}</strong></p>
        </article>)}
      </div>
    </section>
  </AdminShell>;
}
