import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function AdminSignupPage() {
  return (
    <main className="admin-page grid min-h-screen place-items-center px-4 text-white">
      <section className="admin-panel w-full max-w-[520px] rounded-3xl border p-6 shadow-happy md:p-8">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-happy-orange/15 text-happy-orange">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="type-screen-title mt-4">Akses superadmin</h1>
        <p className="type-body mt-2 text-white/58">
          Llogarite e superadminit hapen vetem nga konfigurimi lokal i
          platformes. Kjo mbron krijimin e bizneseve, motoristeve, zonave dhe
          financave.
        </p>
        <Link
          className="type-cta mt-6 flex h-12 items-center justify-center rounded-xl bg-happy-orange text-white happy-pill-shadow"
          href="/login"
        >
          <ArrowLeft className="mr-2 h-5 w-5" />
          Kthehu te login
        </Link>
      </section>
    </main>
  );
}
