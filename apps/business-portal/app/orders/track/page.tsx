"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getBusinessSession } from "../../../lib/business-session";

export default function TrackOrderPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getBusinessSession() ? "/" : "/login");
  }, [router]);

  return (
    <main className="business-page grid min-h-screen place-items-center px-4 text-white">
      <section className="business-panel rounded-3xl border p-6 shadow-happy">
        <p className="type-body text-white/58">Po hapet paneli i biznesit...</p>
      </section>
    </main>
  );
}
