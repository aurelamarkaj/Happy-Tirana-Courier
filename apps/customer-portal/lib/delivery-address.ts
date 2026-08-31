import { formatAddress, type AddressSuggestion } from "./addresses";

const deliveryAddressKey = "happy-tirana-delivery-address-v1";

export interface DeliveryAddressState {
  address: string;
  lat: number;
  lng: number;
}

export const defaultDeliveryAddress: DeliveryAddressState = {
  address: "Rruga Abdyl Frasheri, Tirane",
  lat: 41.3198,
  lng: 19.8172,
};

export function deliveryAddressFromSuggestion(
  suggestion: AddressSuggestion,
): DeliveryAddressState {
  return {
    address: formatAddress(suggestion),
    lat: suggestion.lat,
    lng: suggestion.lng,
  };
}

export function loadDeliveryAddress(): DeliveryAddressState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(deliveryAddressKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<DeliveryAddressState>;
    if (
      typeof parsed.address === "string" &&
      typeof parsed.lat === "number" &&
      typeof parsed.lng === "number"
    ) {
      return parsed as DeliveryAddressState;
    }
  } catch {
    return null;
  }

  return null;
}

export function saveDeliveryAddress(address: DeliveryAddressState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(deliveryAddressKey, JSON.stringify(address));
}
