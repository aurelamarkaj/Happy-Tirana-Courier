"use client";

import { Layers3, Map, Pentagon, Plus, RotateCcw, Save } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ZoneBuilderMap } from "../../components/admin-map";
import { AdminMetric, AdminShell } from "../../components/admin-shell";
import {
  createAdminZone,
  formatLek,
  getAdminZones,
  type AdminZone,
  type MapPoint,
} from "../../lib/api";

export default function ZonesPage() {
  const [zones, setZones] = useState<AdminZone[]>([]);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [name, setName] = useState("");
  const [city, setCity] = useState("Tirana");
  const [transportFee, setTransportFee] = useState("250");
  const [isSurchargeArea, setIsSurchargeArea] = useState(false);
  const [surchargeFee, setSurchargeFee] = useState("100");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadZones() {
    setLoading(true);
    try {
      const data = await getAdminZones();
      setZones(data.zones);
      setMessage("");
    } catch {
      setMessage("Nuk u lexuan zonat Përditësim i porosisë.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadZones();
  }, []);

  const minFee = useMemo(() => {
    const fees = zones
      .filter((zone) => zone.active)
      .map((zone) => zone.transportFee);
    return fees.length ? Math.min(...fees) : 0;
  }, [zones]);

  async function submitZone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (points.length < 3) {
      setMessage("Zgjidh te pakten 3 pika ne harte per te krijuar poligonin.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      await createAdminZone({
        name,
        city,
        transportFee: Number(transportFee),
        isSurchargeArea,
        surchargeFee: Number(surchargeFee),
        points,
      });
      setName("");
      setTransportFee("250");
      setIsSurchargeArea(false);
      setSurchargeFee("100");
      setPoints([]);
      await loadZones();
      setMessage(
        "Zona u ruajt me sukses dhe është gati për llogaritjen e transportit.",
      );
    } catch {
      setMessage(
        "Zona nuk u ruajt. Kontrollo që kufijtë e saj të mos kryqëzohen dhe provo përsëri.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell
      action={
        <button
          className="type-cta flex h-12 items-center justify-center rounded-xl bg-happy-orange px-5 text-white happy-pill-shadow"
          onClick={() =>
            setMessage(
              "Kliko ne harte per te vendosur pikat e zones, pastaj ruaje nga paneli majtas.",
            )
          }
          type="button"
        >
          <Plus className="mr-2 h-5 w-5" />
          Krijo zone
        </button>
      }
      description="Përcakto zonat e dorëzimit në hartë dhe tarifat shtesë për zona të veçanta, si Unaza."
      eyebrow="Zonat e dorëzimit"
      title="Zona dhe cmime"
    >
      <section className="grid gap-3 md:grid-cols-3">
        <AdminMetric
          icon={Map}
          label="Zona aktive"
          value={String(zones.filter((zone) => zone.active).length)}
        />
        <AdminMetric
          icon={Pentagon}
          label="Poligone"
          value={String(zones.length)}
        />
        <AdminMetric
          icon={Layers3}
          label="Cmimi min"
          value={minFee ? formatLek(minFee) : "0 ALL"}
        />
      </section>

      {message ? (
        <p className="type-warning rounded-2xl border border-happy-orange/40 bg-happy-orange/10 p-4 text-happy-orange">
          {message}
        </p>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="admin-panel rounded-3xl border p-5 shadow-happy">
          <h2 className="type-section-title">Ndertues zone</h2>
          <p className="type-body mt-2 text-white/58">
            Vizato kufijte, vendos emrin dhe cakto tarifen fikse te transportit.
          </p>
          <form className="mt-5 grid gap-3" onSubmit={submitZone}>
            <label className="type-input block">
              Emri zones
              <input
                className="admin-input mt-2 h-12 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                onChange={(event) => setName(event.target.value)}
                placeholder="P.sh. Tirana Qender"
                required
                value={name}
              />
            </label>
            <label className="type-input block">
              Qyteti
              <input
                className="admin-input mt-2 h-12 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                onChange={(event) => setCity(event.target.value)}
                placeholder="Tirana"
                required
                value={city}
              />
            </label>
            <label className="type-input block">
              Transporti reference
              <input
                className="admin-input mt-2 h-12 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                onChange={(event) => setTransportFee(event.target.value)}
                placeholder="250 ALL"
                required
                value={transportFee}
              />
            </label>
            <label className="admin-soft flex items-center justify-between gap-3 rounded-2xl border p-4">
              <span>
                <span className="type-product block">Area shtese / Unaza</span>
                <span className="type-secondary text-white/45">
                  Shto tarife kur rruga e porosise e kalon kete poligon.
                </span>
              </span>
              <input
                checked={isSurchargeArea}
                className="h-5 w-5 accent-happy-orange"
                onChange={(event) => setIsSurchargeArea(event.target.checked)}
                type="checkbox"
              />
            </label>
            {isSurchargeArea ? (
              <label className="type-input block">
                Tarifa shtese
                <input
                  className="admin-input mt-2 h-12 w-full rounded-xl border px-3 outline-none focus:border-white/35"
                  onChange={(event) => setSurchargeFee(event.target.value)}
                  placeholder="100 ALL"
                  required
                  value={surchargeFee}
                />
              </label>
            ) : null}
            <div className="admin-soft rounded-2xl border p-4">
              <p className="type-badge uppercase tracking-wide text-white/42">
                Pika te zgjedhura
              </p>
              <strong className="type-large-price mt-1 block">
                {points.length}
              </strong>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                className="type-cta flex h-12 items-center justify-center rounded-xl bg-white/10 text-white"
                onClick={() => setPoints([])}
                type="button"
              >
                <RotateCcw className="mr-2 h-5 w-5" />
                Pastro
              </button>
              <button
                className="type-cta flex h-12 items-center justify-center rounded-xl bg-happy-orange text-white happy-pill-shadow"
                disabled={saving}
                type="submit"
              >
                <Save className="mr-2 h-5 w-5" />
                {saving ? "..." : "Ruaj"}
              </button>
            </div>
          </form>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="type-product">Zona ekzistuese</h3>
              <span className="type-secondary text-white/45">
                {loading ? "Duke lexuar..." : zones.length}
              </span>
            </div>
            {zones.slice(0, 6).map((zone) => (
              <article
                className="admin-soft rounded-2xl border p-3"
                key={zone.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="type-body">{zone.name}</p>
                  <span className="type-badge rounded-full bg-happy-orange/15 px-2 py-1 text-happy-orange">
                    {zone.isSurchargeArea
                      ? `+${formatLek(zone.surchargeFee)}`
                      : formatLek(zone.transportFee)}
                  </span>
                </div>
                <p className="type-secondary mt-1 text-white/45">
                  {zone.points.length} pika · {zone.city}
                  {zone.isSurchargeArea ? " · Area shtese" : ""}
                </p>
              </article>
            ))}
          </div>
        </aside>

        <section className="admin-panel min-h-[420px] overflow-hidden rounded-3xl border p-4 shadow-happy sm:min-h-[560px]">
          <ZoneBuilderMap
            onPointsChange={setPoints}
            points={points}
            zones={zones}
          />
        </section>
      </section>
    </AdminShell>
  );
}
