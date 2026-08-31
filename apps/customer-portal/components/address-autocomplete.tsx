"use client";

import { LocateFixed, MapPin, Navigation } from "lucide-react";
import { useEffect, useState } from "react";
import { reverseAddress, searchAddresses } from "../lib/api";
import { formatAddress, type AddressSuggestion } from "../lib/addresses";

export function AddressAutocomplete({
  compact = false,
  value,
  onChange,
  onSelect
}: {
  compact?: boolean;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: AddressSuggestion) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [matches, setMatches] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const showDropdown = focused && matches.length > 0;

  useEffect(() => {
    if (!focused) return;

    const timer = window.setTimeout(() => {
      setLoading(true);
      searchAddresses(value)
        .then((data) => setMatches(data.suggestions))
        .catch(() => setMatches([]))
        .finally(() => setLoading(false));
    }, 220);

    return () => window.clearTimeout(timer);
  }, [focused, value]);

  function choose(suggestion: AddressSuggestion) {
    const nextAddress = formatAddress(suggestion);
    onChange(nextAddress);
    onSelect?.(suggestion);
    setFocused(false);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition((position) => {
      reverseAddress(position.coords.latitude, position.coords.longitude)
        .then((data) => {
          if (data.address) {
            onChange(formatAddress(data.address));
            onSelect?.(data.address);
            return;
          }
          onChange("Vendndodhja ime");
        })
        .catch(() => onChange("Vendndodhja ime"))
        .finally(() => setFocused(false));
    });
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div className={`type-input theme-search flex items-center rounded-xl border px-3 shadow-sm ${compact ? "py-2" : "py-3"}`}>
        <MapPin className="mr-2 h-4 w-4 shrink-0 text-happy-orange" />
        <input
          aria-label="Adresa e dorezimit"
          className="theme-search-input w-full bg-transparent outline-none"
          onBlur={() => window.setTimeout(() => setFocused(false), 140)}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Shkruaj rrugen..."
          value={value}
        />
        <button
          className="ml-2 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-happy-orange text-white"
          onMouseDown={(event) => event.preventDefault()}
          onClick={useCurrentLocation}
          title="Perdor GPS"
          type="button"
        >
          <LocateFixed className="h-4 w-4" />
        </button>
      </div>

      {showDropdown || loading ? (
        <div className="theme-panel absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border shadow-happy">
          {loading ? <div className="type-warning theme-subtle px-3 py-3">Duke kerkuar rruget...</div> : null}
          {matches.map((suggestion) => (
            <button
              className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-happy-orange/10"
              key={suggestion.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(suggestion)}
              type="button"
            >
              <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-happy-orange/15 text-happy-orange">
                <Navigation className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <strong className="type-product theme-text block">{suggestion.label}</strong>
                <span className="type-secondary theme-subtle mt-1 block">
                  {suggestion.area} · {suggestion.details}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
