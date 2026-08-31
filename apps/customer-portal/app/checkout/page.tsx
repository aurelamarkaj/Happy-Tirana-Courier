"use client";

import { ChevronRight, MapPin, ShoppingBag, UserRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AddressAutocomplete } from "../../components/address-autocomplete";
import { CustomerHeader } from "../../components/customer-header";
import { ApiError, apiFetch, createOrderFromCart, getCart, getMe, type CartLine } from "../../lib/api";
import { type ApiBusiness, type BusinessCard, formatLek, mapBusinessFromApi } from "../../lib/catalog";
import { clearCustomerProfile, emptyCustomerProfile, getCustomerId, type CustomerProfile } from "../../lib/customer-session";

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutFallback />}>
      <CheckoutContent />
    </Suspense>
  );
}

function CheckoutFallback() {
  return (
    <main className="happy-page grid min-h-screen place-items-center">
      <div className="theme-panel rounded-2xl border p-6 text-center shadow-happy">
        <img alt="Happy Tirana Courier" className="mx-auto h-16 w-28 object-contain" src="/happy-logo.svg" />
        <p className="type-warning theme-muted mt-4">Duke hapur checkout...</p>
      </div>
    </main>
  );
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedBusinessId = searchParams.get("businessId");
  const [profile, setProfile] = useState<CustomerProfile>(emptyCustomerProfile);
  const [address, setAddress] = useState(emptyCustomerProfile.defaultAddress);
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [businessId, setBusinessId] = useState(requestedBusinessId ?? "");
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessCard | null>(null);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const productTotal = cartLines.reduce((sum, product) => sum + Number(product.price) * product.quantity, 0);
  const transportFee = cartLines.length > 0 ? selectedBusiness?.deliveryFee ?? 0 : 0;
  const total = productTotal + transportFee;
  const isRegistered = Boolean(profile.id && profile.phone);

  useEffect(() => {
    const customerId = getCustomerId();

    if (customerId) {
      getMe()
        .then((customer) => {
          setProfile(customer);
          setAddress(customer.defaultAddress);
        })
        .catch(() => {
          clearCustomerProfile();
          setProfile(emptyCustomerProfile);
          setStatus("Seanca e ruajtur nuk ekziston me ne databaze. Bej login ose signup per te konfirmuar porosine.");
        });
    } else {
      setStatus("Mund te shtosh artikuj pa login. Login/signup kerkohet vetem per te konfirmuar porosine.");
    }

    getCart()
      .then((cart) => {
        setBusinessId(cart.business_id ?? requestedBusinessId ?? "");
        setCartLines(cart.items);
      })
      .catch(() => setStatus("Nuk u lexua dot shporta nga databaza lokale."));
  }, [requestedBusinessId]);

  useEffect(() => {
    if (!businessId) {
      setSelectedBusiness(null);
      return;
    }

    apiFetch<ApiBusiness>(`/public/businesses/${businessId}`)
      .then((row) => setSelectedBusiness(mapBusinessFromApi(row)))
      .catch(() => setSelectedBusiness(null));
  }, [businessId]);

  async function confirmOrder() {
    const customerId = getCustomerId();
    if (!customerId || !profile.phone.trim()) {
      router.push("/signup");
      return;
    }
    if (!businessId) {
      setStatus("Zgjidh nje biznes dhe shto produkte para konfirmimit.");
      return;
    }
    if (!address.trim()) {
      setStatus("Vendos adresen e dorezimit para konfirmimit.");
      return;
    }

    setSubmitting(true);
    setStatus("");
    try {
      const order = await createOrderFromCart({
        businessId,
        customerName: profile.name,
        customerPhone: profile.phone,
        addressText: address,
        lat: profile.defaultLat,
        lng: profile.defaultLng
      });
      setCartLines([]);
      router.push(`/orders/track?orderCode=${order.code}`);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "CUSTOMER_SESSION_EXPIRED" || error.status === 401) {
          clearCustomerProfile();
          setProfile(emptyCustomerProfile);
          setStatus("Seanca skadoi ose nuk gjendet ne databaze. Bej login/signup dhe provo perseri.");
          return;
        }
        if (error.code === "CART_EMPTY") {
          setStatus("Shporta eshte bosh. Shto artikuj para konfirmimit.");
          return;
        }
        if (error.code === "CUSTOMER_DETAILS_REQUIRED") {
          setStatus("Ploteso emrin, telefonin dhe adresen para konfirmimit.");
          return;
        }
        if (error.code === "ZONE_NOT_FOUND") {
          setStatus("Adresa nuk eshte brenda zones aktive te dorezimit. Zgjidh nje adrese ne Tirane.");
          return;
        }
        if (error.code === "PRODUCT_NOT_AVAILABLE") {
          setStatus("Nje nga produktet nuk eshte me i disponueshem. Rifresko shporten dhe provo perseri.");
          return;
        }
        setStatus(`Porosia nuk u konfirmua dot: ${error.code}`);
        return;
      }
      setStatus("Porosia nuk u konfirmua dot. Kontrollo databazen lokale dhe shporten.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="happy-page min-h-screen">
      <CustomerHeader address={address} onAddressChange={setAddress} />

      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-6 md:px-6 lg:grid-cols-[1fr_380px]">
        <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
          <section className="theme-panel rounded-2xl border p-5 shadow-happy md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="type-badge uppercase tracking-wide text-happy-orange">Konfirmo pagesen</p>
                <h1 className="type-screen-title theme-text mt-1">Detajet</h1>
              </div>
              <div className="theme-soft-button grid h-12 w-12 place-items-center rounded-xl border text-happy-orange">
                <WalletCards className="h-6 w-6" />
              </div>
            </div>

            {!isRegistered ? (
              <div className="mt-5 rounded-2xl border border-happy-orange/25 bg-happy-orange/10 p-4">
                <strong className="type-product theme-text block">Login ose signup per te ruajtur porosine.</strong>
                <p className="type-body theme-muted mt-1">Emri, telefoni, adresa dhe historiku ruhen ne PostgreSQL lokal.</p>
                <div className="mt-3 flex gap-2">
                  <Link className="type-cta theme-soft-button rounded-xl border px-4 py-2" href="/login">
                    Login
                  </Link>
                  <Link className="type-cta rounded-xl bg-happy-orange px-4 py-2 text-white" href="/signup">
                    Signup
                  </Link>
                </div>
              </div>
            ) : (
              <div className="theme-soft-button mt-5 flex items-center gap-3 rounded-2xl border p-4">
                <UserRound className="h-5 w-5 text-happy-orange" />
                <div>
                  <strong className="type-product theme-text">{profile.name}</strong>
                  <p className="type-secondary theme-muted">{profile.phone}</p>
                </div>
              </div>
            )}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Emri" value={profile.name} onChange={(value) => setProfile((current) => ({ ...current, name: value }))} />
              <Field label="Telefoni" value={profile.phone} onChange={(value) => setProfile((current) => ({ ...current, phone: value }))} />
            </div>

            <label className="type-input theme-text mt-4 block">
              Adresa
              <div className="mt-2">
                <AddressAutocomplete
                  value={address}
                  onChange={setAddress}
                  onSelect={(suggestion) =>
                    setProfile((current) => ({
                      ...current,
                      defaultLat: suggestion.lat,
                      defaultLng: suggestion.lng
                    }))
                  }
                />
              </div>
            </label>

            <label className="type-input theme-text mt-4 block">
              Shenime per motoristin
              <textarea className="theme-input mt-2 min-h-28 w-full rounded-xl border px-3 py-3 outline-none focus:border-happy-orange" placeholder="Hyrja, kati, telefoni dyte..." />
            </label>
          </section>

          <section className="theme-panel grid gap-3 rounded-2xl border p-4 shadow-happy md:grid-cols-3">
            <Info label="Pagesa" value="Cash te motoristi" />
            <Info label="Transporti" value={formatLek(transportFee)} />
            <Info label="Totali" value={formatLek(total)} />
          </section>
        </form>

        <aside className="theme-panel rounded-2xl border p-5 shadow-happy">
          <div className="flex items-center justify-between">
            <h2 className="type-section-title theme-text">Porosia</h2>
            <ShoppingBag className="h-5 w-5 text-happy-orange" />
          </div>
          <p className="type-secondary theme-muted mt-2">{selectedBusiness?.name ?? "Biznesi"}</p>
          <div className="mt-4 space-y-3">
            {cartLines.length === 0 ? (
              <p className="type-warning theme-soft-button rounded-xl border p-4">Shporta eshte bosh.</p>
            ) : (
              cartLines.map((product) => (
                <div className="grid grid-cols-[56px_1fr] gap-3" key={product.productId}>
                  <img alt={product.name} className="h-14 w-14 rounded-[18px] object-cover" src={product.imageUrl ?? "/catalog/checkout-bag.webp"} />
                  <div className="type-body theme-text">
                    <div className="flex justify-between gap-3">
                      <span>
                        {product.quantity} x {product.name}
                      </span>
                      <strong className="type-price">{formatLek(Number(product.price) * product.quantity)}</strong>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="type-body mt-5 space-y-2 border-t border-white/10 pt-4">
            <Row label="Produktet" value={formatLek(productTotal)} />
            <Row label="Transporti" value={formatLek(transportFee)} />
            <Row label="Pagesa" value="Cash" />
          </div>
          <div className="theme-soft-button mt-5 rounded-xl border p-3">
            <p className="type-badge theme-subtle flex items-center uppercase tracking-wide">
              <MapPin className="mr-2 h-4 w-4 text-happy-orange" />
              Dorezim
            </p>
            <p className="type-body theme-text mt-1">{address}</p>
          </div>
          {status ? <p className="type-warning mt-4 rounded-xl border border-happy-orange/25 bg-happy-orange/10 p-3 text-happy-orange">{status}</p> : null}
          <button
            className="type-cta mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-happy-orange text-white happy-pill-shadow disabled:opacity-50"
            disabled={submitting || cartLines.length === 0 || !businessId}
            onClick={confirmOrder}
            type="button"
          >
            {submitting ? "Duke ruajtur..." : `Konfirmo · ${formatLek(total)}`}
            <ChevronRight className="ml-1 h-5 w-5" />
          </button>
        </aside>
      </section>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="type-input theme-text block">
      {label}
      <input className="theme-input mt-2 w-full rounded-xl border px-3 py-3 outline-none focus:border-happy-orange" onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="theme-soft-button rounded-xl border p-4">
      <p className="type-badge theme-subtle uppercase tracking-wide">{label}</p>
      <strong className="type-price theme-text mt-1 block">{value}</strong>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="theme-muted">{label}</span>
      <strong className="theme-text font-semibold">{value}</strong>
    </div>
  );
}
