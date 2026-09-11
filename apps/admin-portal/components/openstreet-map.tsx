"use client";

import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { useEffect, useRef, useState } from "react";
import type {
  AdminLiveOrder,
  AdminRider,
  AdminZone,
  MapPoint,
} from "../lib/api";

const defaultCenter: [number, number] = [41.3275, 19.8187];

function markerHtml(label: string, color: string) {
  return `<div style="display:grid;place-items:center;width:36px;height:36px;border:2px solid rgba(255,255,255,.9);border-radius:12px;background:${color};color:#fff;font:800 12px Manrope,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35)">${label}</div>`;
}

export function OpenStreetAdminMap({
  points = [],
  zones = [],
  riders = [],
  orders = [],
  onPointsChange,
}: {
  points?: MapPoint[];
  zones?: AdminZone[];
  riders?: AdminRider[];
  orders?: AdminLiveOrder[];
  onPointsChange?: (points: MapPoint[]) => void;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<LayerGroup | null>(null);
  const pointsRef = useRef(points);
  const onPointsChangeRef = useRef(onPointsChange);
  const [ready, setReady] = useState(false);

  pointsRef.current = points;
  onPointsChangeRef.current = onPointsChange;

  useEffect(() => {
    let cancelled = false;
    let createdMap: LeafletMap | null = null;

    import("leaflet").then((L) => {
      if (cancelled || !elementRef.current) return;
      createdMap = L.map(elementRef.current, {
        attributionControl: true,
        zoomControl: true,
      }).setView(defaultCenter, 13);
      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
          maxZoom: 19,
        },
      ).addTo(createdMap);
      layersRef.current = L.layerGroup().addTo(createdMap);
      mapRef.current = createdMap;
      if (onPointsChangeRef.current) {
        createdMap.on("click", (event) => {
          onPointsChangeRef.current?.([
            ...pointsRef.current,
            { lat: event.latlng.lat, lng: event.latlng.lng },
          ]);
        });
      }
      setReady(true);
    });

    return () => {
      cancelled = true;
      setReady(false);
      layersRef.current = null;
      mapRef.current = null;
      createdMap?.remove();
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !layersRef.current) return;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current || !layersRef.current) return;
      const layers = layersRef.current;
      layers.clearLayers();
      const bounds: Array<[number, number]> = [];
      const icon = (label: string, color: string) =>
        L.divIcon({
          className: "happy-leaflet-marker",
          html: markerHtml(label, color),
          iconAnchor: [18, 18],
          iconSize: [36, 36],
        });

      zones.forEach((zone) => {
        if (zone.points.length < 3) return;
        const polygonPoints = zone.points.map(
          (point) => [point.lat, point.lng] as [number, number],
        );
        bounds.push(...polygonPoints);
        L.polygon(polygonPoints, {
          color: "#ffffff",
          fillColor: zone.isSurchargeArea ? "#f59e0b" : "#ff5500",
          fillOpacity: zone.isSurchargeArea ? 0.18 : 0.12,
          opacity: 0.85,
          weight: 2,
        }).addTo(layers);
      });

      points.forEach((point, index) => {
        const position: [number, number] = [point.lat, point.lng];
        bounds.push(position);
        L.marker(position, { icon: icon(String(index + 1), "#ff5500") }).addTo(
          layers,
        );
      });
      if (points.length >= 2)
        L.polyline(
          points.map((point) => [point.lat, point.lng] as [number, number]),
          { color: "#ff5500", opacity: 0.95, weight: 4 },
        ).addTo(layers);
      if (points.length >= 3)
        L.polygon(
          points.map((point) => [point.lat, point.lng] as [number, number]),
          { color: "#ff5500", fillColor: "#ff5500", fillOpacity: 0.18 },
        ).addTo(layers);

      riders.forEach((rider) => {
        if (rider.lastLat === undefined || rider.lastLng === undefined) return;
        const position: [number, number] = [rider.lastLat, rider.lastLng];
        bounds.push(position);
        const popup = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = rider.name;
        popup.append(name, document.createElement("br"));
        popup.append(rider.isOnline ? "Online" : "Offline");
        L.marker(position, {
          icon: icon("R", rider.isOnline ? "#ff5500" : "#252525"),
        })
          .bindPopup(popup)
          .addTo(layers);
      });

      orders.forEach((order) => {
        const pickup: [number, number] = [order.pickupLat, order.pickupLng];
        const dropoff: [number, number] = [order.dropoffLat, order.dropoffLng];
        bounds.push(pickup, dropoff);
        L.polyline([pickup, dropoff], {
          color: "#ff5500",
          opacity: 0.9,
          weight: 4,
        }).addTo(layers);
        L.marker(pickup, { icon: icon("B", "#ff5500") }).addTo(layers);
        L.marker(dropoff, { icon: icon("K", "#101010") }).addTo(layers);
      });

      if (bounds.length > 1)
        mapRef.current.fitBounds(bounds, { maxZoom: 15, padding: [42, 42] });
      else if (bounds.length === 1) mapRef.current.setView(bounds[0], 15);
    });

    return () => {
      cancelled = true;
    };
  }, [orders, points, ready, riders, zones]);

  return <div className="absolute inset-0 z-0" ref={elementRef} />;
}
