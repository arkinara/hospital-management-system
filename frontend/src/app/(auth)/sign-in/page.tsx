export default function SignInPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Auth route group — placeholder. Real authentication lands in ticket #18.
      </p>
      <form className="mt-8 grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="email">
          Email
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="min-h-11 rounded-md border border-outline-strong bg-surface-0 px-3 text-base text-fg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="password">
          Password
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className="min-h-11 rounded-md border border-outline-strong bg-surface-0 px-3 text-base text-fg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90"
        >
          Sign in
        </button>
      </form>
    </>
  );
}