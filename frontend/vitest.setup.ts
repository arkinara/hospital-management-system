import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// RTL does not auto-clean when Vitest globals are disabled.
afterEach(() => {
  cleanup();
});
