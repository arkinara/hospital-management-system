export default function DashboardPage() {
  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-outline bg-surface-0 p-6">
        <h2 className="text-lg font-semibold">Dashboard</h2>
        <p className="mt-1 text-sm text-fg-muted">
          App route group — placeholder for the role-aware shell. Widgets land in later tickets.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-outline bg-surface-0 p-5">
          <p className="text-xs text-fg-muted">Metric</p>
          <p className="num mt-1 text-3xl font-bold">—</p>
        </div>
        <div className="rounded-lg border border-outline bg-surface-0 p-5">
          <p className="text-xs text-fg-muted">Metric</p>
          <p className="num mt-1 text-3xl font-bold">—</p>
        </div>
        <div className="rounded-lg border border-outline bg-surface-0 p-5">
          <p className="text-xs text-fg-muted">Metric</p>
          <p className="num mt-1 text-3xl font-bold">—</p>
        </div>
      </div>
    </div>
  );
}