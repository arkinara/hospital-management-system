import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in — Hospital MS",
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-2 px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-outline bg-surface-0 p-8 shadow-card">
        {children}
      </div>
    </main>
  );
}