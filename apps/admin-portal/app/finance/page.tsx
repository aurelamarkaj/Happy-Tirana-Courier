"use client";

import { Banknote, ReceiptText, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminMetric, AdminShell } from "../../components/admin-shell";
import { formatLek, getAdminFinance, type AdminFinance } from "../../lib/api";

export default function FinancePage() {
  const [finance, setFinance] = useState<AdminFinance | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getAdminFinance()
      .then((data) => {
        setFinance(data);
        setMessage("");
      })
      .catch(() => setMessage("Të dhënat financiare nuk u ngarkuan. Provo përsëri pas pak."));
  }, []);

  return (
    <AdminShell
      description="Raporte financiare per transportet, ndarja 80/20 dhe shlyerjet periodike motorist drejt platformes."
      eyebrow="Raporte"
      title="Financa"
    >
      <section className="grid gap-3 md:grid-cols-3">
        <AdminMetric
          icon={Banknote}
          label="Transport total"
          value={formatLek(finance?.metrics.totalTransportFee ?? 0)}
        />
        <AdminMetric
          icon={WalletCards}
          label="Motoristet 80%"
          value={formatLek(finance?.metrics.riderEarnings ?? 0)}
        />
        <AdminMetric
          icon={ReceiptText}
          label="Platforma 20%"
          value={formatLek(finance?.metrics.platformCommission ?? 0)}
        />
      </section>

      {message ? (
        <p className="type-warning rounded-2xl border border-happy-orange/40 bg-happy-orange/10 p-4 text-happy-orange">
          {message}
        </p>
      ) : null}

      <section className="admin-panel rounded-3xl border p-5 shadow-happy">
        <h2 className="type-section-title">Shlyerje periodike</h2>
        <div className="mt-4 grid gap-3">
          {finance?.settlements.length ? (
            finance.settlements.map((settlement) => (
              <div
                className="admin-soft flex items-center justify-between rounded-2xl border p-4"
                key={settlement.riderId}
              >
                <span className="type-body">
                  {settlement.riderName} - {formatLek(settlement.platformDue)}
                </span>
                <span className="type-badge rounded-full bg-happy-orange/15 px-3 py-2 text-happy-orange">
                  {settlement.status}
                </span>
              </div>
            ))
          ) : (
            <div className="admin-soft rounded-2xl border p-4 text-white/55">
              Nuk ka shlyerje te hapura.
            </div>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
