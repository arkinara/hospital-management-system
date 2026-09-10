import TokenSwatch from "@/components/TokenSwatch";

const TOKENS = [
  { name: "bg-surface-0", className: "bg-surface-0" },
  { name: "bg-surface-1", className: "bg-surface-1" },
  { name: "bg-surface-2", className: "bg-surface-2" },
  { name: "bg-surface-3", className: "bg-surface-3" },
  { name: "bg-surface-4", className: "bg-surface-4" },
  { name: "bg-primary", className: "bg-primary" },
  { name: "bg-primary-container", className: "bg-primary-container" },
  { name: "bg-accent", className: "bg-accent" },
  { name: "bg-success-container", className: "bg-success-container" },
  { name: "bg-warning-container", className: "bg-warning-container" },
  { name: "bg-danger-container", className: "bg-danger-container" },
  { name: "bg-info-container", className: "bg-info-container" },
] as const;

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-3 py-10 sm:px-4 lg:px-6">
      <header className="mb-10">
        <h1 className="text-3xl font-bold">Hospital MS — foundation scaffold</h1>
        <p className="mt-2 text-base text-fg-muted">
          Design tokens compiled from the project config, seeded once in{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-2xs">
            src/app/globals.css
          </code>
          , per promax-prototype/DESIGN_SYSTEM.md.
        </p>
      </header>

      <section className="mb-10 grid gap-3">
        {TOKENS.map((token) => (
          <div
            key={token.name}
            className="flex items-center gap-4 rounded-lg border border-outline bg-surface-0 p-3"
          >
            <div className={`${token.className} h-10 w-24 rounded-md border border-outline`} />
            <code className="text-sm text-fg-muted">{token.name}</code>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-outline bg-surface-0 p-6">
        <h2 className="text-xl font-semibold">Palette resolution check</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Dark palette is a separate design (not an inversion). Toggling it must
          change the resolved value, not hide the token.
        </p>
        <div className="mt-6">
          <TokenSwatch />
        </div>
      </section>
    </main>
  );
}