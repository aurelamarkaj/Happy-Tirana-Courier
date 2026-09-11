import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "../../shared/forms.css";

export const metadata: Metadata = {
  title: "Happy Tirana Courier Admin",
  description: "Superadmin dashboard for Happy Tirana Courier"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sq">
      <body className="font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
