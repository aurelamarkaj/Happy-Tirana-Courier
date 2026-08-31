"use client";

import type { ReactNode } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Clock3,
  Info,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Star,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CustomerFooter } from "./customer-footer";
import { CustomerHeader } from "./customer-header";
import { getCart, setCartItem } from "../lib/api";
import type { AddressSuggestion } from "../lib/addresses";
import type { BusinessCard, Product } from "../lib/catalog";
import { formatLek } from "../lib/catalog";

export function BusinessMenu({
  address,
  business,
  onAddressChange,
  onAddressSelect,
  products,
}: {
  address: string;
  business: BusinessCard;
  onAddressChange: (address: string) => void;
  onAddressSelect: (suggestion: AddressSuggestion) => void;
  products: Product[];
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [menuQuery, setMenuQuery] = useState("");
  const [notice, setNotice] = useState("");

  const visibleProducts = useMemo(() => {
    const needle = menuQuery.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) =>
      `${product.name} ${product.description} ${product.section}`
        .toLowerCase()
        .includes(needle),
    );
  }, [menuQuery, products]);

  const sections = useMemo(
    () =>
      Array.from(new Set(visibleProducts.map((product) => product.section))),
    [visibleProducts],
  );
  const totalQuantity = Object.values(cart).reduce(
    (sum, quantity) => sum + quantity,
    0,
  );
  const productTotal = products.reduce(
    (sum, product) => sum + product.price * (cart[product.id] ?? 0),
    0,
  );
  const total = productTotal + (totalQuantity > 0 ? business.deliveryFee : 0);

  useEffect(() => {
    function loadCart() {
      getCart()
        .then((serverCart) => {
          if (serverCart.business_id && serverCart.business_id !== business.id)
            return;
          setCart(
            Object.fromEntries(
              serverCart.items.map((item) => [item.productId, item.quantity]),
            ),
          );
        })
        .catch(() =>
          setNotice(
            "Shporta lokale nuk u lexua nga databaza. Kontrollo API/Postgres.",
          ),
        );
    }

    loadCart();
    window.addEventListener("focus", loadCart);
    window.addEventListener("pageshow", loadCart);

    return () => {
      window.removeEventListener("focus", loadCart);
      window.removeEventListener("pageshow", loadCart);
    };
  }, [business.id]);

  async function updateQuantity(productId: string, quantity: number) {
    setNotice("");
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[productId];
      else next[productId] = quantity;
      return next;
    });

    try {
      await setCartItem({ businessId: business.id, productId, quantity });
    } catch {
      setNotice("Nuk u ruajt dot shporta ne databaze.");
    }
  }

  function add(productId: string) {
    void updateQuantity(productId, (cart[productId] ?? 0) + 1);
  }

  function remove(productId: string) {
    void updateQuantity(productId, (cart[productId] ?? 0) - 1);
  }

  return (
    <main className="happy-page min-h-screen pb-28">
      <CustomerHeader
        address={address}
        onAddressChange={onAddressChange}
        onAddressSelect={onAddressSelect}
      />

      <section>
        <div className="relative h-64 overflow-hidden border-b border-white/10 md:h-80">
          <img
            alt={business.name}
            className="h-full w-full object-cover"
            src={business.heroImage}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-[#101010]/45 to-transparent" />
          <div className="absolute left-4 top-4 md:left-6">
            <Link
              className="type-cta inline-flex h-11 items-center rounded-xl border border-white/10 bg-[#101010]/70 px-4 text-white backdrop-blur hover:border-happy-orange/60"
              href="/"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kthehu
            </Link>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="relative -mt-16 grid gap-5 lg:grid-cols-[1fr_360px]">
            <section className="theme-panel rounded-2xl border p-5 shadow-happy md:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-start gap-4">
                  <img
                    alt={`${business.name} logo`}
                    className="h-20 w-20 rounded-2xl border border-white/10 object-cover shadow-happy"
                    src={business.coverImage}
                  />
                  <div>
                    <span className="type-badge inline-flex rounded-lg bg-happy-orange/15 px-3 py-1 uppercase tracking-wide text-happy-orange">
                      {business.open ? "Hapur" : "Mbyllur"}
                    </span>
                    <h1 className="type-screen-title theme-text mt-3">
                      {business.name}
                    </h1>
                    <p className="type-body theme-muted mt-2 max-w-2xl">
                      {business.description}
                    </p>
                  </div>
                </div>
                <button
                  className="type-cta theme-soft-button inline-flex h-10 items-center rounded-xl border px-4"
                  type="button"
                >
                  <Info className="mr-2 h-4 w-4 text-happy-orange" />
                  Me shume
                </button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <InfoTile
                  icon={<Clock3 className="h-4 w-4" />}
                  label="Koha"
                  value={business.eta}
                />
                <InfoTile
                  icon={<Truck className="h-4 w-4" />}
                  label="Transporti"
                  value={formatLek(business.deliveryFee)}
                />
                <InfoTile
                  icon={<Star className="h-4 w-4 fill-happy-orange" />}
                  label="Vleresimi"
                  value={String(business.rating)}
                />
              </div>
            </section>

            <aside className="theme-panel hidden rounded-2xl border p-5 shadow-happy lg:block">
              <CartSummary
                businessId={business.id}
                deliveryFee={business.deliveryFee}
                productTotal={productTotal}
                total={total}
                totalQuantity={totalQuantity}
              />
            </aside>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <MenuSearch menuQuery={menuQuery} setMenuQuery={setMenuQuery} />
              <nav className="theme-panel mt-3 grid gap-1 rounded-2xl border p-2">
                {sections.map((section) => (
                  <a
                    className="type-secondary rounded-xl px-3 py-2 hover:bg-happy-orange hover:text-white"
                    href={`#${section}`}
                    key={section}
                  >
                    {section}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          <div>
            <div className="lg:hidden">
              <MenuSearch menuQuery={menuQuery} setMenuQuery={setMenuQuery} />
              <nav className="mt-3 flex gap-2 overflow-x-auto pb-2">
                {sections.map((section) => (
                  <a
                    className="type-secondary theme-soft-button h-10 shrink-0 rounded-xl border px-4 py-2 hover:border-happy-orange/60"
                    href={`#${section}`}
                    key={section}
                  >
                    {section}
                  </a>
                ))}
              </nav>
            </div>

            <div className="space-y-7">
              {notice ? (
                <p className="type-warning rounded-xl border border-happy-orange/30 bg-happy-orange/10 p-3 text-happy-orange">
                  {notice}
                </p>
              ) : null}
              {sections.map((section) => (
                <section id={section} key={section}>
                  <h2 className="type-section-title theme-text">{section}</h2>
                  <div className="mt-3 grid gap-3">
                    {visibleProducts
                      .filter((product) => product.section === section)
                      .map((product) => (
                        <article
                          className="theme-offer-card grid grid-cols-[1fr_116px] gap-4 rounded-2xl border p-3 transition hover:border-happy-orange/50 md:grid-cols-[1fr_150px]"
                          key={product.id}
                        >
                          <div className="min-w-0 p-1">
                            <span className="type-badge uppercase tracking-wide text-happy-orange">
                              {product.badge}
                            </span>
                            <h3 className="type-product theme-text mt-2">
                              {product.name}
                            </h3>
                            <p className="type-description theme-muted mt-1 line-clamp-2">
                              {product.description}
                            </p>
                            <strong className="type-price mt-4 block text-happy-orange">
                              {formatLek(product.price)}
                            </strong>
                          </div>
                          <div className="flex flex-col items-end justify-between gap-3">
                            <img
                              alt={product.name}
                              className="h-24 w-28 rounded-xl object-cover md:h-28 md:w-36"
                              src={product.image}
                            />
                            <QuantityControl
                              count={cart[product.id] ?? 0}
                              onAdd={() => add(product.id)}
                              onRemove={() => remove(product.id)}
                            />
                          </div>
                        </article>
                      ))}
                  </div>
                </section>
              ))}
              {sections.length === 0 ? (
                <div className="type-body theme-panel rounded-2xl border p-6">
                  Nuk u gjet asnje produkt ne kete menu.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <CustomerFooter />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#101010]/92 p-4 shadow-dock backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-happy-orange/15 text-happy-orange">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <div>
              <p className="type-bottom-nav theme-subtle">
                {totalQuantity} artikuj
              </p>
              <strong className="type-large-price theme-text">
                {formatLek(total)}
              </strong>
            </div>
          </div>
          <Link
            className="type-cta flex h-11 items-center rounded-xl bg-happy-orange px-5 text-white"
            href={`/checkout?businessId=${business.id}`}
          >
            Vazhdo
            <ChevronRight className="ml-1 h-5 w-5" />
          </Link>
        </div>
      </div>
    </main>
  );
}

function MenuSearch({
  menuQuery,
  setMenuQuery,
}: {
  menuQuery: string;
  setMenuQuery: (value: string) => void;
}) {
  return (
    <label className="type-input theme-search flex h-11 items-center rounded-xl border px-3">
      <Search className="mr-2 h-4 w-4 text-happy-orange" />
      <input
        aria-label="Kerko ne menu"
        className="theme-search-input w-full bg-transparent outline-none"
        onChange={(event) => setMenuQuery(event.target.value)}
        placeholder="Kerko ne menu..."
        value={menuQuery}
      />
    </label>
  );
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="theme-soft-button rounded-xl border p-3">
      <p className="type-badge theme-subtle flex items-center gap-2 uppercase tracking-wide">
        <span className="text-happy-orange">{icon}</span>
        {label}
      </p>
      <strong className="type-rating theme-text mt-1 block">{value}</strong>
    </div>
  );
}

function CartSummary({
  businessId,
  totalQuantity,
  productTotal,
  deliveryFee,
  total,
}: {
  businessId: string;
  totalQuantity: number;
  productTotal: number;
  deliveryFee: number;
  total: number;
}) {
  return (
    <div className="sticky top-24">
      <div className="flex items-center justify-between">
        <h2 className="type-section-title theme-text">Shporta</h2>
        <ShoppingBag className="h-5 w-5 text-happy-orange" />
      </div>
      {totalQuantity === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-white/15 p-5 text-center">
          <p className="type-body theme-muted">Shto artikuj nga menuja.</p>
        </div>
      ) : (
        <>
          <div className="type-body mt-5 space-y-3">
            <Row label="Artikuj" value={String(totalQuantity)} />
            <Row label="Produktet" value={formatLek(productTotal)} />
            <Row label="Transporti" value={formatLek(deliveryFee)} />
            <div className="flex justify-between gap-3 border-t border-white/10 pt-3">
              <span className="type-product theme-text">Totali</span>
              <span className="type-large-price text-happy-orange">
                {formatLek(total)}
              </span>
            </div>
          </div>
          <Link
            className="type-cta mt-5 flex h-12 items-center justify-center rounded-xl bg-happy-orange text-white happy-pill-shadow"
            href={`/checkout?businessId=${businessId}`}
          >
            Vazhdo
            <ChevronRight className="ml-1 h-5 w-5" />
          </Link>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="theme-muted font-normal">{label}</span>
      <span className="theme-text font-semibold">{value}</span>
    </div>
  );
}

function QuantityControl({
  count,
  onAdd,
  onRemove,
}: {
  count: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  if (count === 0) {
    return (
      <button
        className="grid h-9 w-9 place-items-center rounded-lg bg-happy-orange text-white shadow-sm"
        onClick={onAdd}
        title="Shto"
        type="button"
      >
        <Plus className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="theme-soft-button grid h-9 grid-cols-3 rounded-lg border">
      <button
        className="grid w-9 place-items-center"
        onClick={onRemove}
        title="Hiq"
        type="button"
      >
        <Minus className="h-4 w-4" />
      </button>
      <strong className="type-rating grid w-8 place-items-center">
        {count}
      </strong>
      <button
        className="grid w-9 place-items-center"
        onClick={onAdd}
        title="Shto"
        type="button"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
