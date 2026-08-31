"use client";

import {
  LogOut,
  Moon,
  Search,
  ShoppingBag,
  Sun,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AddressAutocomplete } from "./address-autocomplete";
import { getMe } from "../lib/api";
import type { AddressSuggestion } from "../lib/addresses";
import {
  clearCustomerProfile,
  getCustomerId,
  getCustomerProfile,
  type CustomerProfile,
} from "../lib/customer-session";

const themeStorageKey = "happy-tirana-theme-v3";

export function CustomerHeader({
  address,
  onAddressChange,
  onAddressSelect,
  searchValue,
  onSearchChange,
  showAddress = true,
}: {
  address: string;
  onAddressChange?: (address: string) => void;
  onAddressSelect?: (suggestion: AddressSuggestion) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  showAddress?: boolean;
}) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    setProfile(getCustomerProfile());
    if (getCustomerId()) {
      getMe()
        .then(setProfile)
        .catch(() => {
          clearCustomerProfile();
          setProfile(null);
        });
    }
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(themeStorageKey);
    const nextDarkMode = saved !== "light";
    setDarkMode(nextDarkMode);
    document.documentElement.classList.toggle(
      "happy-light-mode",
      !nextDarkMode,
    );
  }, []);

  function logout() {
    clearCustomerProfile();
    setProfile(getCustomerProfile());
  }

  function toggleDarkMode() {
    setDarkMode((current) => {
      const next = !current;
      window.localStorage.setItem(themeStorageKey, next ? "dark" : "light");
      document.documentElement.classList.toggle("happy-light-mode", !next);
      return next;
    });
  }

  const isLoggedIn = Boolean(profile?.name && profile?.phone);
  const showBusinessSearch = typeof searchValue === "string" && onSearchChange;

  return (
    <header className="theme-header sticky top-0 z-30 border-b backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
        <div className="flex items-center gap-3 lg:gap-5">
          <Link className="shrink-0" href="/">
            <img
              alt="Happy Tirana Courier"
              className="h-10 w-[72px] object-contain"
              src="/happy-logo.svg"
            />
          </Link>
          <div className="hidden min-w-0 sm:block">
            <p className="type-header-brand uppercase text-happy-orange">
              Happy Tirana
            </p>
            <p className="type-secondary theme-text truncate">
              Koha juaj, prioriteti yne
            </p>
          </div>
          {showBusinessSearch ? (
            <label className="type-input theme-search hidden h-11 max-w-md flex-1 items-center rounded-xl border px-3 lg:flex">
              <Search className="mr-2 h-4 w-4 shrink-0 text-happy-orange" />
              <input
                aria-label="Kerko biznes"
                className="theme-search-input w-full bg-transparent outline-none"
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Kerko biznes, market, farmaci..."
                value={searchValue}
              />
            </label>
          ) : showAddress && onAddressChange ? (
            <div className="hidden max-w-md flex-1 lg:block">
              <AddressAutocomplete
                compact
                value={address}
                onChange={onAddressChange}
                onSelect={onAddressSelect}
              />
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {isLoggedIn ? (
            <Link
              className="type-cta theme-soft-button flex items-center gap-2 rounded-lg px-3 py-2"
              href="/profile"
            >
              <UserRound className="h-4 w-4 text-happy-orange" />
              <span className="hidden max-w-24 truncate sm:inline">
                {profile?.name}
              </span>
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                className="type-cta theme-soft-button rounded-lg px-3 py-2"
                href="/login"
              >
                Login
              </Link>
              <Link
                className="type-cta rounded-lg bg-happy-orange px-3 py-2 text-white happy-pill-shadow"
                href="/signup"
              >
                Signup
              </Link>
            </div>
          )}
          {isLoggedIn ? (
            <button
              className="theme-soft-button hidden h-10 w-10 place-items-center rounded-lg sm:grid"
              onClick={logout}
              title="Dil"
              type="button"
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : null}
          <button
            className="theme-soft-button grid h-10 w-10 place-items-center rounded-lg"
            onClick={toggleDarkMode}
            title="Dark mode on/off"
            type="button"
          >
            {darkMode ? (
              <Moon className="h-5 w-5 text-happy-orange" />
            ) : (
              <Sun className="h-5 w-5 text-happy-orange" />
            )}
          </button>
          <Link
            className="grid h-10 w-10 place-items-center rounded-lg bg-white text-happy-black shadow-sm"
            href="/checkout"
            title="Shporta"
          >
            <ShoppingBag className="h-5 w-5" />
          </Link>
        </div>
        {showBusinessSearch ? (
          <label className="type-input theme-search mt-3 flex h-11 items-center rounded-xl border px-3 lg:hidden">
            <Search className="mr-2 h-4 w-4 shrink-0 text-happy-orange" />
            <input
              aria-label="Kerko biznes"
              className="theme-search-input w-full bg-transparent outline-none"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Kerko biznes, market, farmaci..."
              value={searchValue}
            />
          </label>
        ) : showAddress && onAddressChange ? (
          <div className="mt-3 lg:hidden">
            <AddressAutocomplete
              compact
              value={address}
              onChange={onAddressChange}
              onSelect={onAddressSelect}
            />
          </div>
        ) : null}
      </div>
    </header>
  );
}
