"use client";

import { MousePointer2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  AdminLiveOrder,
  AdminRider,
  AdminZone,
  MapPoint,
} from "../lib/api";

declare global {
  interface Window {
    L?: any;
    happyLeafletReady?: Promise<any>;
  }
}

function loadLeaflet() {
  if (typeof window === "undefined")
    return Promise.reject(new Error("NO_WINDOW"));
  if (window.L) return Promise.resolve(window.L);
  if (window.happyLeafletReady) return window.happyLeafletReady;

  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(css);

  window.happyLeafletReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("LEAFLET_LOAD_FAILED"));
    document.body.appendChild(script);
  });

  return window.happyLeafletReady;
}

function createBaseMap(L: any, element: HTMLDivElement) {
  const map = L.map(element, {
    attributionControl: false,
    zoomControl: false,
  }).setView([41.3275, 19.8187], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "OpenStreetMap",
  }).addTo(map);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  return map;
}

export function ZoneBuilderMap({
  points,
  zones,
  onPointsChange,
}: {
  points: MapPoint[];
  zones: AdminZone[];
  onPointsChange: (points: MapPoint[]) => void;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const drawnLayerRef = useRef<any>(null);
  const zonesLayerRef = useRef<any>(null);
  const pointsRef = useRef(points);
  const onPointsChangeRef = useRef(onPointsChange);
  const [loadError, setLoadError] = useState(false);

  pointsRef.current = points;
  onPointsChangeRef.current = onPointsChange;

  useEffect(() => {
    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapElementRef.current) return;
        if (!mapRef.current) {
          mapRef.current = createBaseMap(L, mapElementRef.current);
          mapRef.current.on(
            "click",
            (event: { latlng: { lat: number; lng: number } }) => {
              onPointsChangeRef.current([
                ...pointsRef.current,
                { lat: event.latlng.lat, lng: event.latlng.lng },
              ]);
            },
          );
        }
      })
      .catch(() => setLoadError(true));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadLeaflet().then((L) => {
      if (!mapRef.current) return;
      if (drawnLayerRef.current) drawnLayerRef.current.remove();

      drawnLayerRef.current = L.layerGroup().addTo(mapRef.current);
      const latLngs = points.map((point) => [point.lat, point.lng]);
      points.forEach((point, index) => {
        L.marker([point.lat, point.lng], {
          icon: L.divIcon({
            className: "admin-zone-point",
            html: `<span>${index + 1}</span>`,
            iconSize: [30, 30],
          }),
        }).addTo(drawnLayerRef.current);
      });

      if (latLngs.length >= 2) {
        L.polyline(latLngs, {
          color: "#FF5500",
          weight: 4,
          opacity: 0.92,
          lineCap: "round",
        }).addTo(drawnLayerRef.current);
      }
      if (latLngs.length >= 3) {
        L.polygon(latLngs, {
          color: "#FF5500",
          weight: 2,
          fillColor: "#FF5500",
          fillOpacity: 0.18,
        }).addTo(drawnLayerRef.current);
        mapRef.current.fitBounds(L.latLngBounds(latLngs), {
          padding: [32, 32],
        });
      }
    });
  }, [points]);

  useEffect(() => {
    loadLeaflet().then((L) => {
      if (!mapRef.current) return;
      if (zonesLayerRef.current) zonesLayerRef.current.remove();

      zonesLayerRef.current = L.layerGroup().addTo(mapRef.current);
      const bounds: Array<[number, number]> = [];
      zones.forEach((zone) => {
        const latLngs = zone.points.map((point) => [point.lat, point.lng]);
        if (latLngs.length < 3) return;
        L.polygon(latLngs, {
          color: "#ffffff",
          weight: 2,
          fillColor: "#FF5500",
          fillOpacity: 0.1,
        })
          .bindTooltip(`${zone.name} - ${Math.round(zone.transportFee)} ALL`)
          .addTo(zonesLayerRef.current);
        zone.points.forEach((point) => bounds.push([point.lat, point.lng]));
      });
      if (bounds.length > 2 && pointsRef.current.length === 0)
        mapRef.current.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
    });
  }, [zones]);

  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-2xl bg-[#f8f9fa] sm:min-h-[528px]">
      <div className="absolute inset-0" ref={mapElementRef} />
      <div className="absolute left-4 top-4 rounded-2xl bg-[#101010]/90 px-4 py-3 text-white shadow-happy backdrop-blur">
        <p className="type-badge flex items-center uppercase tracking-wide text-white/55">
          <MousePointer2 className="mr-2 h-4 w-4 text-happy-orange" />
          Kliko ne harte
        </p>
        <p className="type-secondary mt-1 text-white/70">
          {points.length} pika te zgjedhura
        </p>
      </div>
      {loadError ? (
        <div className="absolute inset-0 grid place-items-center bg-[#101010] p-6 text-center text-white">
          <p className="type-body max-w-sm text-white/70">
            Harta nuk u ngarkua. Kontrollo lidhjen me internet per tile-at
            OpenStreetMap.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function AdminLiveMap({
  riders,
  orders,
}: {
  riders: AdminRider[];
  orders: AdminLiveOrder[];
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapElementRef.current) return;
        if (!mapRef.current)
          mapRef.current = createBaseMap(L, mapElementRef.current);
      })
      .catch(() => setLoadError(true));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadLeaflet().then((L) => {
      if (!mapRef.current) return;
      if (layerRef.current) layerRef.current.remove();

      layerRef.current = L.layerGroup().addTo(mapRef.current);
      const bounds: Array<[number, number]> = [];

      riders.forEach((rider) => {
        if (rider.lastLat === undefined || rider.lastLng === undefined) return;
        bounds.push([rider.lastLat, rider.lastLng]);
        L.marker([rider.lastLat, rider.lastLng], {
          icon: L.divIcon({
            className: rider.isOnline
              ? "admin-map-rider admin-map-rider-online"
              : "admin-map-rider",
            html: "<span>HTC</span>",
            iconSize: [54, 54],
          }),
        })
          .bindTooltip(
            `${rider.name} - ${rider.isOnline ? "Online" : "Offline"}`,
          )
          .addTo(layerRef.current);
      });

      orders.forEach((order) => {
        bounds.push(
          [order.pickupLat, order.pickupLng],
          [order.dropoffLat, order.dropoffLng],
        );
        L.polyline(
          [
            [order.pickupLat, order.pickupLng],
            [order.dropoffLat, order.dropoffLng],
          ],
          {
            color: "#FF5500",
            weight: 4,
            opacity: 0.75,
            dashArray: "8 10",
            lineCap: "round",
          },
        ).addTo(layerRef.current);
        L.marker([order.pickupLat, order.pickupLng], {
          icon: L.divIcon({
            className: "admin-map-pin admin-map-business",
            html: "<span>B</span>",
            iconSize: [30, 30],
          }),
        })
          .bindTooltip(`${order.businessName} - pickup`)
          .addTo(layerRef.current);
        L.marker([order.dropoffLat, order.dropoffLng], {
          icon: L.divIcon({
            className: "admin-map-pin admin-map-dropoff",
            html: "<span>K</span>",
            iconSize: [30, 30],
          }),
        })
          .bindTooltip(`${order.code} - klienti`)
          .addTo(layerRef.current);
      });

      if (bounds.length > 1)
        mapRef.current.fitBounds(L.latLngBounds(bounds), { padding: [42, 42] });
    });
  }, [orders, riders]);

  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-2xl bg-[#f8f9fa] sm:min-h-[528px]">
      <div className="absolute inset-0" ref={mapElementRef} />
      <div className="absolute left-4 top-4 rounded-2xl bg-[#101010]/90 px-4 py-3 text-white shadow-happy backdrop-blur">
        <p className="type-badge uppercase tracking-wide text-white/55">
          Live map
        </p>
        <p className="type-secondary mt-1 text-white/70">
          {riders.length} motoriste · {orders.length} porosi aktive
        </p>
      </div>
      {loadError ? (
        <div className="absolute inset-0 grid place-items-center bg-[#101010] p-6 text-center text-white">
          <p className="type-body max-w-sm text-white/70">
            Harta nuk u ngarkua. Kontrollo lidhjen me internet per tile-at
            OpenStreetMap.
          </p>
        </div>
      ) : null}
    </div>
  );
}
