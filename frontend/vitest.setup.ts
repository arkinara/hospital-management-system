import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Node >= 24 exposes a global `localStorage` that reads as undefined unless
// --localstorage-file is passed, and it shadows the one jsdom installs. Without
// this shim every test that touches storage throws in setup, RTL never cleans
// up, and the next test sees a duplicated DOM.
if (typeof window !== "undefined" && !window.localStorage) {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
  };
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
}

// RTL does not auto-clean when Vitest globals are disabled.
afterEach(() => {
  cleanup();
});
