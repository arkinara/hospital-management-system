import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — Hospital MS",
};

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen bg-surface-2">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-outline bg-surface-0 lg:flex">
        <div className="flex h-14 items-center border-b border-outline px-4">
          <span className="font-display text-base font-semibold">Hospital MS</span>
        </div>
        <nav className="grid gap-1 p-3" aria-label="Main">
          <span className="rounded-md bg-surface-1 px-3 py-2 text-sm font-medium text-fg">
            Dashboard
          </span>
          <span className="rounded-md px-3 py-2 text-sm text-fg-muted">Patients</span>
          <span className="rounded-md px-3 py-2 text-sm text-fg-muted">Appointments</span>
          <span className="rounded-md px-3 py-2 text-sm text-fg-muted">Records</span>
          <span className="rounded-md px-3 py-2 text-sm text-fg-muted">Billing</span>
          <span className="rounded-md px-3 py-2 text-sm text-fg-muted">Admin</span>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-sticky flex h-14 items-center border-b border-outline bg-surface-0 px-4">
          <h1 className="text-base font-semibold">Authenticated shell</h1>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}