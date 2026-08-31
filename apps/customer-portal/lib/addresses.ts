export interface AddressSuggestion {
  id: string;
  label: string;
  area: string;
  city: string;
  details: string;
  lat: number;
  lng: number;
}

export function formatAddress(suggestion: AddressSuggestion) {
  return [suggestion.label, suggestion.area, suggestion.city].filter(Boolean).join(", ");
}
