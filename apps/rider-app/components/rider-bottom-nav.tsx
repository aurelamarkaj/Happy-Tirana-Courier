"use client";

import { Bike, ClipboardList, Home, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/delivery", label: "Delivery", icon: ClipboardList },
  { href: "/earnings", label: "Fitime", icon: WalletCards }
];

export function RiderBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-3 left-1/2 z-40 grid w-[calc(100%-24px)] max-w-md -translate-x-1/2 grid-cols-3 rounded-2xl border border-white/10 bg-[#181818]/95 p-2 shadow-happy backdrop-blur">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link className={`type-bottom-nav flex flex-col items-center gap-1 rounded-xl px-2 py-2 ${isActive ? "bg-happy-orange text-white" : "text-white/58"}`} href={item.href} key={item.href}>
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
      <span className="pointer-events-none absolute -top-3 left-1/2 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full bg-happy-orange text-white shadow-happy">
        <Bike className="h-4 w-4" />
      </span>
    </nav>
  );
}
