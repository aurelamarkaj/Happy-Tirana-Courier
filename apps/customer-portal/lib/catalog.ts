export type Category = string;

export interface BusinessCard {
  id: string;
  name: string;
  category: Category;
  area: string;
  rating: number;
  eta: string;
  deliveryFee: number;
  open: boolean;
  coverImage: string;
  heroImage: string;
  description: string;
  products: Product[];
}

export interface Product {
  id: string;
  businessId: string;
  section: string;
  name: string;
  description: string;
  price: number;
  badge: string;
  image: string;
}

export interface ApiProduct {
  id: string;
  businessId: string;
  section?: string;
  name: string;
  description?: string | null;
  price: string | number;
  imageUrl?: string | null;
}

export interface ApiBusiness {
  id: string;
  name: string;
  category: string;
  address_text?: string | null;
  rating?: string | number | null;
  eta_minutes?: string | number | null;
  cover_image_url?: string | null;
  description?: string | null;
  delivery_fee?: string | number | null;
  products?: ApiProduct[];
}

export function mapCategory(category: string): Category {
  if (category === "FOOD") return "Ushqim";
  if (category === "MARKET") return "Market";
  if (category === "PHARMACY") return "Farmaci";
  if (category === "DOCUMENTS") return "Dokumente";
  if (category === "OTHER") return "Te tjera";
  return category || "Te tjera";
}

export function mapBusinessFromApi(row: ApiBusiness): BusinessCard {
  const eta = Math.max(10, Number(row.eta_minutes ?? 30));
  const image = row.cover_image_url ?? "/catalog/checkout-bag.webp";

  return {
    id: row.id,
    name: row.name,
    category: mapCategory(row.category),
    area: row.address_text ?? "Shqiperi",
    rating: Number(row.rating ?? 4.7),
    eta: `${eta} min`,
    deliveryFee: Number(row.delivery_fee ?? 250),
    open: true,
    coverImage: image,
    heroImage: image,
    description: row.description ?? "Porosit online me dorezim Happy Tirana.",
    products:
      row.products?.map((product, index) =>
        mapProductFromApi(product, index),
      ) ?? [],
  };
}

export function mapProductFromApi(product: ApiProduct, index: number): Product {
  return {
    id: product.id,
    businessId: product.businessId,
    section: product.section ?? "Menu",
    name: product.name,
    description: product.description ?? "",
    price: Number(product.price),
    badge: index === 0 ? "Popullore" : "Shpejt",
    image: product.imageUrl ?? "/catalog/checkout-bag.webp",
  };
}

export function formatLek(value: number) {
  return `${value.toLocaleString("sq-AL")} ALL`;
}
