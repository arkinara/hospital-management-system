/**
 * Permission matrix bridge (ticket #1).
 *
 * The design-system shell (`AppShell`) filters navigation with the compact
 * grant-string model — `Record<Role, Record<ModuleName, "vced">>` in
 * `src/components/ui/tokens.ts` — while the shared fixtures store the same
 * authorisation as lowercase `PermissionMatrixEntry` rows with an `allowed`
 * flag. This module is the single translation point between the two, so the
 * shell always derives its menu from the fixture matrix and can never fall
 * back to granting everything.
 *
 * A role or module with no matrix entry resolves to an empty grant string,
 * which `can(_, "view")` reads as `false`: the item simply never renders,
 * greyed or otherwise. That is the intended no-full-access fallback.
 */

import { permissionMatrix } from "@/lib/fixtures";
import type { ModuleName, PermissionMatrixData, Role } from "@/components/ui/tokens";

const ROLES: Array<{ fixture: string; display: Role }> = [
  { fixture: "admin", display: "Admin" },
  { fixture: "doctor", display: "Doctor" },
  { fixture: "nurse", display: "Nurse" },
  { fixture: "receptionist", display: "Receptionist" },
];

/** Fixture module keys the nav can gate on, mapped to the shell's token names. */
const MODULES: Array<{ fixture: string; display: ModuleName }> = [
  { fixture: "patients", display: "Patients" },
  { fixture: "appointments", display: "Appointments" },
  { fixture: "records", display: "Records" },
  { fixture: "billing", display: "Billing" },
  { fixture: "admin", display: "Admin" },
];

function grantFor(fixtureRole: string, fixtureModule: string): string {
  const entry = permissionMatrix.find(
    (p) => p.role === fixtureRole && p.module === fixtureModule,
  );
  if (!entry?.allowed) return "";
  let grant = "";
  if (entry.canView) grant += "v";
  if (entry.canCreate) grant += "c";
  if (entry.canEdit) grant += "e";
  if (entry.canDelete) grant += "d";
  return grant;
}

/**
 * The full 4-role × 5-module matrix, built once from the fixture
 * `permissionMatrix` and consumed directly by `AppShell`.
 */
export const PERMISSION_MATRIX: PermissionMatrixData = ROLES.reduce<PermissionMatrixData>(
  (out, { fixture, display }) => {
    out[display] = MODULES.reduce<Record<ModuleName, string>>((row, { fixture: f, display: d }) => {
      row[d] = grantFor(fixture, f);
      return row;
    }, {} as Record<ModuleName, string>);
    return out;
  },
  {} as PermissionMatrixData,
);