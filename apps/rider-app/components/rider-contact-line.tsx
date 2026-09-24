import type { Bike } from "lucide-react";

export function RouteLine({
  icon: Icon,
  label,
  value,
  phone = false,
}: {
  icon: typeof Bike;
  label: string;
  value: string;
  phone?: boolean;
}) {
  return (
    <div className="rider-soft flex items-center gap-3 rounded-2xl border p-4">
      <Icon className="h-5 w-5 shrink-0 text-happy-orange" />
      <div className="min-w-0">
        <p className="type-badge uppercase text-white/42">{label}</p>
        {phone ? <a className="type-body break-words underline" href={`tel:${value.replace(/[^+\d]/g, "")}`}>{value}</a> : <p className="type-body break-words">{value}</p>}
      </div>
    </div>
  );
}
