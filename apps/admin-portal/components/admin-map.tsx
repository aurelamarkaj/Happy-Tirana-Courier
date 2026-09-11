"use client";

import { MousePointer2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  AdminLiveOrder,
  AdminRider,
  AdminZone,
  MapPoint,
} from "../lib/api";
import { getPublicRoute } from "../lib/api";
import {
  createHappyMarker,
  hasGoogleMapsKey,
  loadGoogleMaps,
} from "../lib/google-maps";
import { OpenStreetAdminMap } from "./openstreet-map";

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
  const [mapReady, setMapReady] = useState(false);
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
        setMapReady(true);
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
  }, [mapReady, points]);

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
  }, [mapReady, zones]);

  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-[#171717] sm:min-h-[528px]">
      <div className="absolute inset-0" ref={mapElementRef} />
      {loadError || !hasGoogleMapsKey() ? (
        <OpenStreetAdminMap
          points={points}
          zones={zones}
          onPointsChange={onPointsChange}
        />
      ) : null}
      <div className="absolute left-4 top-4 z-[500] rounded-2xl bg-[#101010]/90 px-4 py-3 text-white shadow-happy backdrop-blur">
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
  const requestedRoutesRef = useRef(new Set<string>());
  const [routePaths, setRoutePaths] = useState<Record<string, MapPoint[]>>({});
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapElementRef.current) return;
        if (!mapRef.current) mapRef.current = createBaseMap(mapElementRef.current);
        setMapReady(true);
      })
      .catch(() => setLoadError(true));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const missing = orders.filter(
      (order) =>
        !routePaths[order.id] && !requestedRoutesRef.current.has(order.id),
    );
    missing.forEach((order) => requestedRoutesRef.current.add(order.id));
    if (!missing.length) return;

    Promise.all(
      missing.map(async (order) => {
        try {
          const route = await getPublicRoute({
            fromLat: order.pickupLat,
            fromLng: order.pickupLng,
            toLat: order.dropoffLat,
            toLng: order.dropoffLng,
          });
          return [order.id, route.coordinates] as const;
        } catch {
          requestedRoutesRef.current.delete(order.id);
          return [order.id, []] as const;
        }
      }),
    ).then((routes) => {
      if (cancelled) return;
      const successfulRoutes = routes.filter(([, points]) => points.length > 1);
      if (!successfulRoutes.length) return;
      setRoutePaths((current) => ({
        ...current,
        ...Object.fromEntries(successfulRoutes),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [orders, routePaths]);

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
      const routePath =
        routePaths[order.id]?.length > 1
          ? routePaths[order.id]
          : [pickup, dropoff];
      boundsPoints.push(pickup, dropoff);
      overlaysRef.current.push(
        new window.google.maps.Polyline({
          geodesic: true,
          map: mapRef.current,
          path: routePath,
          strokeColor: "#FF5500",
          strokeOpacity: 0.8,
          strokeWeight: 4,
        }),
        createHappyMarker(mapRef.current, pickup, "B", "admin-map-business"),
        createHappyMarker(mapRef.current, dropoff, "K", "admin-map-dropoff"),
      );
    });

    if (boundsPoints.length > 1) fitMapToPoints(mapRef.current, boundsPoints);
  }, [mapReady, orders, riders, routePaths]);

  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-[#171717] sm:min-h-[528px]">
      <div className="absolute inset-0" ref={mapElementRef} />
      {loadError || !hasGoogleMapsKey() ? (
        <OpenStreetAdminMap
          riders={riders}
          orders={orders}
          routePaths={routePaths}
        />
      ) : null}
      <div className="absolute left-4 top-4 z-[500] rounded-2xl bg-[#101010]/90 px-4 py-3 text-white shadow-happy backdrop-blur">
        <p className="type-badge uppercase tracking-wide text-white/55">
          {loadError || !hasGoogleMapsKey()
            ? "OpenStreetMap live"
            : "Google live map"}
        </p>
        <p className="type-secondary mt-1 text-white/70">
          {riders.length} motoriste · {orders.length} porosi aktive
        </p>
      </div>
    </div>
  );
}
