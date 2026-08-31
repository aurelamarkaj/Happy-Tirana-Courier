"use client";

import {
  ArrowRight,
  Clock3,
  FileText,
  Grid2X2,
  LocateFixed,
  Pill,
  ShoppingBasket,
  Star,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AddressAutocomplete } from "../components/address-autocomplete";
import { CustomerFooter } from "../components/customer-footer";
import { CustomerHeader } from "../components/customer-header";
import { apiFetch, reverseAddress } from "../lib/api";
import type { AddressSuggestion } from "../lib/addresses";
import {
  type ApiBusiness,
  type BusinessCard,
  type Category,
  formatLek,
  mapBusinessFromApi,
} from "../lib/catalog";
import {
  defaultDeliveryAddress,
  deliveryAddressFromSuggestion,
  loadDeliveryAddress,
  saveDeliveryAddress,
  type DeliveryAddressState,
} from "../lib/delivery-address";

export default function CustomerHome() {
  const [selectedCategory, setSelectedCategory] =
    useState<Category>("Te gjitha");
  const [query, setQuery] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState<DeliveryAddressState>(
    defaultDeliveryAddress,
  );
  const [catalog, setCatalog] = useState<BusinessCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const savedAddress = loadDeliveryAddress();
    if (savedAddress) setDeliveryAddress(savedAddress);
  }, []);

  useEffect(() => {
    const params = `?lat=${encodeURIComponent(deliveryAddress.lat)}&lng=${encodeURIComponent(deliveryAddress.lng)}`;
    setLoading(true);
    apiFetch<ApiBusiness[]>(`/public/businesses${params}`)
      .then((rows) => {
        setCatalog(rows.map(mapBusinessFromApi));
        setMessage("");
      })
      .catch(() =>
        setMessage(
          "Nuk u lexuan dot bizneset nga databaza lokale. Kontrollo API/Postgres.",
        ),
      )
      .finally(() => setLoading(false));
  }, [deliveryAddress.lat, deliveryAddress.lng]);

  const categories = useMemo<Category[]>(() => {
    const items = Array.from(
      new Set(catalog.map((business) => business.category)),
    );
    return ["Te gjitha", ...items];
  }, [catalog]);

  const sliderBusinesses = useMemo(() => catalog.slice(0, 6), [catalog]);

  const offers = useMemo(() => {
    return catalog
      .flatMap((business) =>
        business.products.slice(0, 2).map((product) => ({
          ...product,
          businessName: business.name,
          businessId: business.id,
          eta: business.eta,
          deliveryFee: business.deliveryFee,
        })),
      )
      .slice(0, 8);
  }, [catalog]);

  const visibleBusinesses = useMemo(() => {
    return catalog.filter((business) => {
      const byCategory =
        selectedCategory === "Te gjitha" ||
        business.category === selectedCategory;
      const byQuery =
        business.name.toLowerCase().includes(query.toLowerCase()) ||
        business.area.toLowerCase().includes(query.toLowerCase()) ||
        business.category.toLowerCase().includes(query.toLowerCase());
      return byCategory && byQuery;
    });
  }, [catalog, query, selectedCategory]);

  function selectAddress(suggestion: AddressSuggestion) {
    applyDeliveryAddress(deliveryAddressFromSuggestion(suggestion));
  }

  function updateAddressText(address: string) {
    setDeliveryAddress((current) => ({ ...current, address }));
  }

  function applyDeliveryAddress(nextAddress: DeliveryAddressState) {
    setDeliveryAddress(nextAddress);
    saveDeliveryAddress(nextAddress);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition((position) => {
      const gpsAddress: DeliveryAddressState = {
        address: "Vendndodhja ime",
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      applyDeliveryAddress(gpsAddress);
      reverseAddress(position.coords.latitude, position.coords.longitude)
        .then((data) => {
          if (data.address) {
            applyDeliveryAddress(deliveryAddressFromSuggestion(data.address));
          }
        })
        .catch(() => undefined);
    });
  }

  return (
    <main className="happy-page min-h-screen pb-14">
      <CustomerHeader
        address={deliveryAddress.address}
        onAddressChange={updateAddressText}
        searchValue={query}
        onSearchChange={setQuery}
      />

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-3xl px-4 py-12 text-center md:px-6 lg:py-16">
          <div className="mx-auto max-w-2xl">
            <img
              alt="Happy Tirana Courier"
              className="mx-auto h-16 w-28 object-contain"
              src="/happy-logo.svg"
            />
            <p className="type-badge mt-6 uppercase tracking-wide text-happy-orange">
              Happy Tirana Courier
            </p>
            <h1 className="type-screen-title theme-text mt-3">
              Ku deshiron te porosisesh?
            </h1>
            <p className="type-body theme-muted mx-auto mt-4 max-w-xl">
              Vendos adresen, zgjidh biznesin dhe shto artikuj pa login.
              Llogaria kerkohet vetem ne konfirmim.
            </p>

            <div className="mx-auto mt-7 max-w-xl rounded-xl border border-happy-orange bg-[#161616] p-1 shadow-[0_0_0_4px_rgba(255,85,0,0.08)]">
              <AddressAutocomplete
                value={deliveryAddress.address}
                onChange={updateAddressText}
                onSelect={selectAddress}
              />
            </div>

            <button
              className="theme-panel mx-auto mt-3 flex h-14 w-full max-w-xl items-center rounded-xl border px-4 text-left transition hover:border-happy-orange/60"
              onClick={useCurrentLocation}
              type="button"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-happy-orange/15 text-happy-orange">
                <LocateFixed className="h-5 w-5" />
              </span>
              <span className="ml-3">
                <span className="type-cta block">
                  Perdor vendndodhjen aktuale
                </span>
                <span className="type-secondary theme-subtle block">
                  Permes shfletuesit
                </span>
              </span>
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-7 md:px-6">
        {sliderBusinesses.length ? (
          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="type-badge uppercase tracking-wide text-happy-orange">
                  Sugjerime
                </p>
                <h2 className="type-section-title theme-text mt-1">
                  Te shpejta per sot
                </h2>
              </div>
            </div>
            <div className="mt-4 flex snap-x gap-4 overflow-x-auto pb-3">
              {sliderBusinesses.map((business) => (
                <Link
                  className="theme-slider-card group relative h-56 w-[290px] shrink-0 snap-start overflow-hidden rounded-2xl border shadow-happy md:w-[360px]"
                  href={`/businesses/${business.id}`}
                  key={business.id}
                >
                  <img
                    alt={business.name}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    src={business.coverImage}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <span className="type-badge rounded-lg bg-happy-orange px-3 py-1 text-white">
                      {business.category}
                    </span>
                    <h3 className="type-restaurant mt-3 text-white">
                      {business.name}
                    </h3>
                    <p className="type-secondary mt-1 text-white/70">
                      {business.eta} · {formatLek(business.deliveryFee)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {categories.length > 1 ? (
          <section className="mt-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="type-badge uppercase tracking-wide text-happy-orange">
                  Kategorite
                </p>
                <h2 className="type-section-title theme-text mt-1">
                  Cfare po kerkon?
                </h2>
              </div>
            </div>
            <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
              {categories.map((category) => (
                <button
                  className={`type-bottom-nav group flex w-24 shrink-0 flex-col items-center gap-3 text-center transition ${
                    selectedCategory === category
                      ? "text-happy-orange"
                      : "theme-muted hover:text-happy-orange"
                  }`}
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  type="button"
                >
                  <span
                    className={`grid h-20 w-20 place-items-center rounded-full border transition ${
                      selectedCategory === category
                        ? "border-happy-orange bg-happy-orange text-white happy-pill-shadow"
                        : "theme-circle"
                    }`}
                  >
                    <CategoryIcon category={category} />
                  </span>
                  <span>{category}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {offers.length ? (
          <section className="mt-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="type-badge uppercase tracking-wide text-happy-orange">
                  Oferta
                </p>
                <h2 className="type-section-title theme-text mt-1">
                  Zgjedhje popullore
                </h2>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {offers.map((offer) => (
                <Link
                  className="theme-offer-card overflow-hidden rounded-2xl border transition hover:border-happy-orange/60 hover:shadow-happy"
                  href={`/businesses/${offer.businessId}`}
                  key={offer.id}
                >
                  <img
                    alt={offer.name}
                    className="h-32 w-full object-cover"
                    src={offer.image}
                  />
                  <div className="p-3">
                    <p className="type-badge theme-subtle uppercase tracking-wide">
                      {offer.businessName}
                    </p>
                    <h3 className="type-product theme-text mt-1 line-clamp-1">
                      {offer.name}
                    </h3>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="type-price text-happy-orange">
                        {formatLek(offer.price)}
                      </span>
                      <span className="type-secondary theme-subtle">
                        {offer.eta}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section id="bizneset">
          <div className="mt-8 flex items-end justify-between gap-4">
            <div>
              <p className="type-badge uppercase tracking-wide text-happy-orange">
                Bizneset
              </p>
              <h2 className="type-section-title theme-text mt-1">
                Hapur per porosi
              </h2>
            </div>
            <p className="type-secondary theme-subtle hidden sm:block">
              {visibleBusinesses.length} aktive
            </p>
          </div>
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="type-warning theme-panel rounded-xl border p-6 lg:col-span-3">
              Duke lexuar bizneset nga databaza...
            </div>
          ) : null}
          {message ? (
            <div className="type-warning theme-panel rounded-xl border p-6 text-happy-orange lg:col-span-3">
              {message}
            </div>
          ) : null}
          {!loading && !message && visibleBusinesses.length === 0 ? (
            <div className="type-warning theme-panel rounded-xl border p-6 lg:col-span-3">
              Nuk ka ende biznese te hapura per porosi ne kete zone.
            </div>
          ) : null}
          {visibleBusinesses.map((business) => (
            <Link
              className="theme-offer-card group overflow-hidden rounded-xl border transition duration-200 hover:-translate-y-0.5 hover:border-happy-orange/60 hover:shadow-happy"
              href={`/businesses/${business.id}`}
              key={business.id}
            >
              <div className="relative h-40 overflow-hidden bg-[#f8f9fa]">
                <img
                  alt={business.name}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  src={business.coverImage}
                />
                <span className="type-badge absolute left-3 top-3 rounded-lg bg-[#101010]/82 px-3 py-1 text-happy-orange shadow-sm backdrop-blur">
                  {business.open ? "Hapur" : "Mbyllur"}
                </span>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="type-restaurant theme-text truncate">
                      {business.name}
                    </h2>
                    <p className="type-secondary theme-subtle mt-1">
                      {business.category} · {business.area}
                    </p>
                  </div>
                  <span className="type-rating theme-panel flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1">
                    <Star className="h-3 w-3 fill-happy-orange text-happy-orange" />
                    {business.rating}
                  </span>
                </div>
                <p className="type-description theme-muted mt-2 line-clamp-2 min-h-10">
                  {business.description}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="theme-muted flex items-center gap-1">
                    <Clock3 className="h-4 w-4" />
                    {business.eta}
                  </span>
                  <span className="type-price flex items-center gap-1 text-happy-orange">
                    {formatLek(business.deliveryFee)}
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </section>
      </section>
      <CustomerFooter />
    </main>
  );
}

function CategoryIcon({ category }: { category: Category }) {
  const className = "h-7 w-7";
  if (category === "Ushqim" || category === "Ushqime")
    return <Utensils className={className} />;
  if (category === "Market") return <ShoppingBasket className={className} />;
  if (category === "Farmaci") return <Pill className={className} />;
  if (category === "Dokumente") return <FileText className={className} />;
  if (category === "Te tjera") return <Grid2X2 className={className} />;
  return <Grid2X2 className={className} />;
}
