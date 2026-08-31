"use client";

import Link from "next/link";

const footerGroups = [
  {
    title: "Happy Tirana",
    links: ["Rreth nesh", "Si funksionon", "Kariera"]
  },
  {
    title: "Ndihme",
    links: ["Llogaria", "Historiku i porosive", "FAQ"]
  },
  {
    title: "Biznesi",
    links: ["Listo biznesin", "Per motoristet", "Kontakt"]
  }
];

export function CustomerFooter() {
  return (
    <footer className="theme-footer border-t px-4 py-10 md:px-6">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1.3fr_2fr]">
        <div>
          <img alt="Happy Tirana Courier" className="h-12 w-24 object-contain" src="/happy-logo.svg" />
          <p className="type-body theme-muted mt-4 max-w-sm">
            Sherbim lokal per porosi online, transport dhe dorezim ne Tirane.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h3 className="type-product theme-text">{group.title}</h3>
              <div className="mt-3 grid gap-2">
                {group.links.map((label) => (
                  <Link className="type-secondary theme-muted hover:text-happy-orange" href="/" key={label}>
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="type-secondary theme-subtle mx-auto mt-8 max-w-6xl">© 2026 Happy Tirana Courier.</div>
    </footer>
  );
}
