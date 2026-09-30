"use client";

export function DeleteAccountConfirmation({
  kind,
  name,
  busy,
  onCancel,
  onConfirm,
}: {
  kind: "biznesin" | "motoristin";
  name: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <section
      aria-labelledby="delete-account-title"
      className="admin-panel rounded-2xl border border-red-300 bg-red-50 p-5"
      role="alertdialog"
    >
      <h2 className="type-section-title text-red-800" id="delete-account-title">
        Fshi {kind} “{name}”?
      </h2>
      <p className="type-secondary mt-2 text-red-800">
        Llogaria do të çaktivizohet. Porositë dhe financat e mëparshme do të ruhen.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded-xl bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          {busy ? "Duke fshirë..." : "Konfirmo fshirjen"}
        </button>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          Anulo
        </button>
      </div>
    </section>
  );
}
