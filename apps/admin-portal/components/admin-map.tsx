"use client";

import { MousePointer2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  AdminLiveOrder,
  AdminRider,
  AdminZone,
  MapPoint,
} from "../lib/api";
import {
  createHappyMarker,
  hasGoogleMapsKey,
  loadGoogleMaps,
} from "../lib/google-maps";

const defaultCenter = { lat: 41.3275, lng: 19.8187 };

function createBaseMap(element: HTMLDivElement) {
  return new window.google.maps.Map(element, {
    center: defaultCenter,
    clickableIcons: false,
    fullscreenControl: false,
    mapTypeControl: false,
    streetViewControl: false,
    zoom: 13,
    zoomControl: true,
  });
}

function fitMapToPoints(map: any, points: MapPoint[], padding = 42) {
  if (!points.length) return;
  const bounds = new window.google.maps.LatLngBounds();
  points.forEach((point) => bounds.extend(point));
  map.fitBounds(bounds, padding);
}

function clearOverlays(overlays: Array<{ setMap: (map: any) => void }>) {
  overlays.forEach((overlay) => overlay.setMap(null));
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
  const drawnOverlaysRef = useRef<Array<{ setMap: (map: any) => void }>>([]);
  const zoneOverlaysRef = useRef<Array<{ setMap: (map: any) => void }>>([]);
  const pointsRef = useRef(points);
  const onPointsChangeRef = useRef(onPointsChange);
  const [loadError, setLoadError] = useState(false);

  pointsRef.current = points;
  onPointsChangeRef.current = onPointsChange;

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapElementRef.current) return;
        if (mapRef.current) return;
        mapRef.current = createBaseMap(mapElementRef.current);
        mapRef.current.addListener("click", (event: any) => {
          const latLng = event.latLng;
          if (!latLng) return;
          onPointsChangeRef.current([
            ...pointsRef.current,
            { lat: latLng.lat(), lng: latLng.lng() },
          ]);
        });
      })
      .catch(() => setLoadError(true));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;
    clearOverlays(drawnOverlaysRef.current);
    drawnOverlaysRef.current = [];

    points.forEach((point, index) => {
      drawnOverlaysRef.current.push(
        createHappyMarker(mapRef.current, point, String(index + 1), "admin-map-pin"),
      );
    });

    if (points.length >= 2) {
      drawnOverlaysRef.current.push(
        new window.google.maps.Polyline({
          clickable: false,
          geodesic: true,
          map: mapRef.current,
          path: points,
          strokeColor: "#FF5500",
          strokeOpacity: 0.94,
          strokeWeight: 4,
        }),
      );
    }

    if (points.length >= 3) {
      drawnOverlaysRef.current.push(
        new window.google.maps.Polygon({
          clickable: false,
          fillColor: "#FF5500",
          fillOpacity: 0.18,
          map: mapRef.current,
          paths: points,
          strokeColor: "#FF5500",
          strokeOpacity: 0.95,
          strokeWeight: 2,
        }),
      );
      fitMapToPoints(mapRef.current, points, 32);
    }
  }, [points]);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;
    clearOverlays(zoneOverlaysRef.current);
    zoneOverlaysRef.current = [];

    const boundsPoints: MapPoint[] = [];
    zones.forEach((zone) => {
      if (zone.points.length < 3) return;
      boundsPoints.push(...zone.points);
      const polygon = new window.google.maps.Polygon({
        fillColor: zone.isSurchargeArea ? "#f59e0b" : "#FF5500",
        fillOpacity: zone.isSurchargeArea ? 0.16 : 0.1,
        map: mapRef.current,
        paths: zone.points,
        strokeColor: "#ffffff",
        strokeOpacity: 0.9,
        strokeWeight: 2,
      });
      polygon.addListener("mouseover", () =>
        polygon.setOptions({ fillOpacity: 0.24 }),
      );
      polygon.addListener("mouseout", () =>
        polygon.setOptions({ fillOpacity: zone.isSurchargeArea ? 0.16 : 0.1 }),
      );
      zoneOverlaysRef.current.push(polygon);
    });

    if (boundsPoints.length > 2 && pointsRef.current.length === 0)
      fitMapToPoints(mapRef.current, boundsPoints, 40);
  }, [zones]);

  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-[#171717] sm:min-h-[528px]">
      <div className="absolute inset-0" ref={mapElementRef} />
      {loadError || !hasGoogleMapsKey() ? (
        <MapFallback
          detail="Google Maps aktivizohet sapo te vendoset API key."
          title="Ndertues zonash"
        />
      ) : null}
      <div className="absolute left-4 top-4 rounded-2xl bg-[#101010]/90 px-4 py-3 text-white shadow-happy backdrop-blur">
        <p className="type-badge flex items-center uppercase tracking-wide text-white/55">
          <MousePointer2 className="mr-2 h-4 w-4 text-happy-orange" />
          Kliko ne harte
        </p>
        <p className="type-secondary mt-1 text-white/70">
          {points.length} pika te zgjedhura
        </p>
      </div>
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
  const overlaysRef = useRef<Array<{ setMap: (map: any) => void }>>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapElementRef.current) return;
        if (!mapRef.current) mapRef.current = createBaseMap(mapElementRef.current);
      })
      .catch(() => setLoadError(true));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;
    clearOverlays(overlaysRef.current);
    overlaysRef.current = [];
    const boundsPoints: MapPoint[] = [];

    riders.forEach((rider) => {
      if (rider.lastLat === undefined || rider.lastLng === undefined) return;
      const position = { lat: rider.lastLat, lng: rider.lastLng };
      boundsPoints.push(position);
      const marker = createHappyMarker(
        mapRef.current,
        position,
        "HTC",
        rider.isOnline ? "admin-map-rider-online" : "admin-map-rider",
      );
      const info = new window.google.maps.InfoWindow({
        content: `<strong>${rider.name}</strong><br/>${rider.isOnline ? "Online" : "Offline"}`,
      });
      marker.addListener("click", () => info.open({ anchor: marker, map: mapRef.current }));
      overlaysRef.current.push(marker);
    });

    orders.forEach((order) => {
      const pickup = { lat: order.pickupLat, lng: order.pickupLng };
      const dropoff = { lat: order.dropoffLat, lng: order.dropoffLng };
      boundsPoints.push(pickup, dropoff);
      overlaysRef.current.push(
        new window.google.maps.Polyline({
          geodesic: true,
          map: mapRef.current,
          path: [pickup, dropoff],
          strokeColor: "#FF5500",
          strokeOpacity: 0.8,
          strokeWeight: 4,
        }),
        createHappyMarker(mapRef.current, pickup, "B", "admin-map-business"),
        createHappyMarker(mapRef.current, dropoff, "K", "admin-map-dropoff"),
      );
    });

    if (boundsPoints.length > 1) fitMapToPoints(mapRef.current, boundsPoints);
  }, [orders, riders]);

  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-[#171717] sm:min-h-[528px]">
      <div className="absolute inset-0" ref={mapElementRef} />
      {loadError || !hasGoogleMapsKey() ? (
        <MapFallback
          detail="Vendndodhjet live do shfaqen mbi Google Maps me API key."
          title="Live map"
        />
      ) : null}
      <div className="absolute left-4 top-4 rounded-2xl bg-[#101010]/90 px-4 py-3 text-white shadow-happy backdrop-blur">
        <p className="type-badge uppercase tracking-wide text-white/55">
          Google live map
        </p>
        <p className="type-secondary mt-1 text-white/70">
          {riders.length} motoriste · {orders.length} porosi aktive
        </p>
      </div>
    </div>
  );
}

function MapFallback({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[linear-gradient(135deg,#181818_0%,#222_46%,#141414_100%)]">
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="absolute left-[12%] top-[58%] h-1 w-[76%] -rotate-6 rounded-full bg-happy-orange/70 shadow-[0_0_28px_rgba(255,85,0,.35)]" />
      <div className="absolute left-[24%] top-[43%] grid h-10 w-10 place-items-center rounded-2xl border border-white/30 bg-happy-orange text-sm font-extrabold text-white shadow-happy">
        B
      </div>
      <div className="absolute right-[22%] top-[61%] grid h-10 w-10 place-items-center rounded-2xl border border-white/30 bg-[#101010] text-sm font-extrabold text-white shadow-happy">
        K
      </div>
      <div className="absolute bottom-4 right-4 max-w-xs rounded-2xl border border-white/10 bg-[#101010]/86 p-4 text-white shadow-happy backdrop-blur">
        <p className="type-badge uppercase text-happy-orange">{title}</p>
        <p className="type-secondary mt-1 text-white/62">{detail}</p>
      </div>
    </div>
  );
}
