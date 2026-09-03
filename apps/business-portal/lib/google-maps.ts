"use client";

declare global {
  interface Window {
    google?: any;
    happyGoogleMapsReady?: Promise<any>;
  }
}

const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export function hasGoogleMapsKey() {
  return Boolean(googleMapsApiKey && !googleMapsApiKey.includes("replace-with"));
}

export function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("NO_WINDOW"));
  if (!hasGoogleMapsKey()) return Promise.reject(new Error("GOOGLE_MAPS_API_KEY_MISSING"));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.happyGoogleMapsReady) return window.happyGoogleMapsReady;

  window.happyGoogleMapsReady = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google));
      existing.addEventListener("error", () => reject(new Error("GOOGLE_MAPS_LOAD_FAILED")));
      return;
    }

    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: googleMapsApiKey,
      loading: "async",
      libraries: "geometry",
      v: "weekly",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("GOOGLE_MAPS_LOAD_FAILED"));
    document.head.appendChild(script);
  });

  return window.happyGoogleMapsReady;
}
