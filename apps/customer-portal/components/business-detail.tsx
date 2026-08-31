"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import type { AddressSuggestion } from "../lib/addresses";
import {
  type ApiBusiness,
  type BusinessCard,
  type Product,
  mapBusinessFromApi,
  mapProductFromApi,
} from "../lib/catalog";
import {
  defaultDeliveryAddress,
  deliveryAddressFromSuggestion,
  loadDeliveryAddress,
  saveDeliveryAddress,
  type DeliveryAddressState,
} from "../lib/delivery-address";
import { BusinessMenu } from "./business-menu";

export function BusinessDetail({ businessId }: { businessId: string }) {
  const [business, setBusiness] = useState<BusinessCard | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [deliveryAddress, setDeliveryAddress] = useState<DeliveryAddressState>(
    defaultDeliveryAddress,
  );
  const [status, setStatus] = useState("Duke lexuar menune nga databaza...");

  useEffect(() => {
    const savedAddress = loadDeliveryAddress();
    if (savedAddress) setDeliveryAddress(savedAddress);
  }, []);

  useEffect(() => {
    const params = `?lat=${encodeURIComponent(deliveryAddress.lat)}&lng=${encodeURIComponent(deliveryAddress.lng)}`;
    apiFetch<ApiBusiness>(`/public/businesses/${businessId}${params}`)
      .then((row) => {
        setBusiness(mapBusinessFromApi(row));
        setProducts((row.products ?? []).map(mapProductFromApi));
        setStatus("");
      })
      .catch(() => setStatus("Ky biznes nuk u gjet ne databazen lokale."));
  }, [businessId, deliveryAddress.lat, deliveryAddress.lng]);

  function updateAddressText(address: string) {
    setDeliveryAddress((current) => ({ ...current, address }));
  }

  function selectAddress(suggestion: AddressSuggestion) {
    const nextAddress = deliveryAddressFromSuggestion(suggestion);
    setDeliveryAddress(nextAddress);
    saveDeliveryAddress(nextAddress);
  }

  if (!business) {
    return (
      <main className="happy-page grid min-h-screen place-items-center px-4">
        <section className="theme-panel max-w-md rounded-2xl border p-6 text-center shadow-happy">
          <img
            alt="Happy Tirana Courier"
            className="mx-auto h-16 w-28 object-contain"
            src="/happy-logo.svg"
          />
          <p className="theme-muted mt-5 text-sm font-medium">{status}</p>
          {status.includes("nuk u gjet") ? (
            <Link
              className="mt-5 inline-flex rounded-xl bg-happy-orange px-5 py-3 text-sm font-semibold text-white"
              href="/"
            >
              Kthehu te bizneset
            </Link>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <BusinessMenu
      address={deliveryAddress.address}
      business={business}
      onAddressChange={updateAddressText}
      onAddressSelect={selectAddress}
      products={products}
    />
  );
}
