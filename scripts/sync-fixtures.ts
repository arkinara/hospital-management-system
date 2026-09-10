/**
 * Regenerates `frontend/src/lib/fixtures/data.json` from the typed fixture
 * module (ticket #38). The backend seed reads the JSON, so frontend and
 * backend always agree on the dataset. Idempotent: same input, same output.
 *
 *   npm run sync:fixtures   (from frontend/)
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixtures } from "../frontend/src/lib/fixtures/data";

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(here, "../frontend/src/lib/fixtures/data.json");

writeFileSync(outPath, `${JSON.stringify(fixtures, null, 2)}\n`, "utf-8");
console.log(`sync:fixtures: regenerated ${outPath}`);