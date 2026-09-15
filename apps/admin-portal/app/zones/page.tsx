"use client";

import {
  Layers3,
  Map,
  Pentagon,
  Plus,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { ZoneBuilderMap } from "../../components/admin-map";
import { AdminMetric, AdminShell } from "../../components/admin-shell";
import {
  ApiError,
  createAdminZone,
  deleteAdminZone,
  updateAdminZone,
  getAdminZones,
  type AdminZone,
  type MapPoint,
} from "../../lib/api";

export default function ZonesPage() {
  const [zones, setZones] = useState<AdminZone[]>([]);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [name, setName] = useState("");
  const [city, setCity] = useState("Tirana");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [isSurchargeArea, setIsSurchargeArea] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingZoneId, setDeletingZoneId] = useState<string | null>(null);
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

  function resetForm() {
    setEditingId(null);
    setName("");
    setCity("Tirana");
    setActive(true);
    setIsSurchargeArea(false);
    setPoints([]);
  }

  function editZone(zone: AdminZone) {
    setEditingId(zone.id);
    setName(zone.name);
    setCity(zone.city || "Tirana");
    setActive(zone.active);
    setIsSurchargeArea(zone.isSurchargeArea);
    const vertices = [...zone.points];
    if (
      vertices.length > 3 &&
      vertices[0].lat === vertices.at(-1)?.lat &&
      vertices[0].lng === vertices.at(-1)?.lng
    )
      vertices.pop();
    setPoints(vertices);
    setMessage("");
  }

  async function submitZone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (points.length < 3) {
      setMessage("Zgjidh te pakten 3 pika ne harte per te krijuar poligonin.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const input = {
        name,
        city,
        isSurchargeArea,
        active,
        points,
        transportFee: 300,
        surchargeFee: 100,
      };
      if (editingId) await updateAdminZone(editingId, input);
      else await createAdminZone(input);
      resetForm();
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

  async function removeZone(zone: AdminZone) {
    if (
      !window.confirm(
        `A je i sigurt që dëshiron të fshish zonën \"${zone.name}\"?`,
      )
    ) {
      return;
    }

    setDeletingZoneId(zone.id);
    setMessage("");
    try {
      await deleteAdminZone(zone.id);
      setZones((currentZones) =>
        currentZones.filter((currentZone) => currentZone.id !== zone.id),
      );
      setMessage(`Zona \"${zone.name}\" u fshi me sukses.`);
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.code === "ZONE_HAS_ORDERS"
          ? "Kjo zonë nuk mund të fshihet sepse ka porosi të lidhura në historik."
          : "Zona nuk u fshi. Provo përsëri.",
      );
    } finally {
      setDeletingZoneId(null);
    }
  }

  return (
    <AdminShell
      action={
        <button
          className="type-cta flex h-12 items-center justify-center rounded-xl bg-happy-orange px-5 text-white happy-pill-shadow"
          onClick={resetForm}
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
          label="Zona 1 aktive"
          value={String(
            zones.filter((zone) => zone.active && zone.isSurchargeArea).length,
          )}
        />
      </section>

      {message ? (
        <p className="type-warning rounded-2xl border border-happy-orange/40 bg-happy-orange/10 p-4 text-happy-orange">
          {message}
        </p>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="admin-panel rounded-3xl border p-5 shadow-happy">
          <h2 className="type-section-title">
            {editingId ? "Ndrysho zonen" : "Zone e re"}
          </h2>
          <p className="type-body mt-2 text-white/58">
            300 ALL deri ne 3 km; 0.1 ALL per meter shtese.
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
              Lloji i zones
              <select
                className="admin-input mt-2 h-12 w-full rounded-xl border px-3"
                value={isSurchargeArea ? "tariff" : "coverage"}
                onChange={(event) =>
                  setIsSurchargeArea(event.target.value === "tariff")
                }
              >
                <option value="tariff">Zona 1 - Tarifa</option>
                <option value="coverage">Zona 2 - Mbulimi</option>
              </select>
            </label>
            <p className="type-secondary text-white/60">
              {isSurchargeArea
                ? "Destinacion jashte zones: +100 ALL."
                : "Biznesi dhe destinacioni duhet te jene brenda mbulimit."}
            </p>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              Zone aktive
            </label>
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
            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {zones.map((zone) => (
                <article
                  className="admin-soft rounded-2xl border p-3"
                  key={zone.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="type-body">{zone.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="type-badge rounded-full bg-happy-orange/15 px-2 py-1 text-happy-orange">
                        {zone.isSurchargeArea ? "Zona 1" : "Zona 2"}
                      </span>
                      <button
                        type="button"
                        title="Ndrysho zonen"
                        aria-label={`Ndrysho ${zone.name}`}
                        onClick={() => editZone(zone)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        aria-label={`Fshi zonën ${zone.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-400/35 text-red-300 transition hover:bg-red-400/15"
                        disabled={deletingZoneId !== null}
                        onClick={() => void removeZone(zone)}
                        title="Fshi zonën"
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="type-secondary mt-1 text-white/45">
                    {zone.points.length} pika · {zone.city}
                    {zone.active ? " · Aktive" : " · Joaktive"}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </aside>

        <section className="admin-panel min-h-[420px] overflow-hidden rounded-3xl border p-4 shadow-happy sm:min-h-[560px]">
          <ZoneBuilderMap
            onPointsChange={setPoints}
            points={points}
            zones={zones.filter((zone) => zone.active && zone.id !== editingId)}
          />
        </section>
      </section>
    </AdminShell>
  );
}
