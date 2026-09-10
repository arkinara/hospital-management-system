"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Proof that a token utility class resolves to the DESIGN_SYSTEM.md
 * value. Reads the computed background of `bg-surface-1` and prints
 * it next to the expected RGB for the active palette.
 */
const EXPECTED = {
  light: "rgb(250, 251, 253)",
  dark: "rgb(21, 27, 37)",
} as const;

export default function TokenSwatch() {
  const ref = useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = useState<string>("");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const node = ref.current;
    const read = () =>
      setResolved(getComputedStyle(node).backgroundColor);
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const expected = dark ? EXPECTED.dark : EXPECTED.light;
  const matches = resolved === expected;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <div ref={ref} className="bg-surface-1 h-16 w-40 rounded-lg border border-outline" />
        <div className="text-sm">
          <p className="font-medium">
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-2xs">bg-surface-1</code>{" "}
            resolves to <span className="num">{resolved || "…"}</span>
          </p>
          <p className="mt-1 text-fg-muted">
            DESIGN_SYSTEM.md s1: <span className="num">{expected}</span>
          </p>
          <p className="mt-1">
            {matches ? (
              <span className="text-success">match — palette resolves correctly</span>
            ) : (
              <span className="text-danger">mismatch — check the seed block</span>
            )}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={toggleDark}
        className="w-fit rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90"
      >
        Switch to {dark ? "light" : "dark"} palette
      </button>
    </div>
  );
}