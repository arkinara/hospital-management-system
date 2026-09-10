import React from "react";
import type { PermissionMatrixData } from "@/components/ui";

/** Injected icon renderer stub — no icon library in tests. */
export const renderIcon = (name: string, className?: string) => (
  <svg data-testid={`icon-${name}`} className={className} aria-hidden />
);

/** A full 4-role × 6-module matrix for AppShell/PermissionMatrix tests. */
export const permissions: PermissionMatrixData = {
  Admin: {
    Patients: "vced",
    Appointments: "vced",
    Records: "vced",
    Billing: "vced",
    Admin: "vced",
    Reports: "vced",
  },
  Doctor: {
    Patients: "vced",
    Appointments: "vce",
    Records: "vced",
    Billing: "v",
    Admin: "",
    Reports: "v",
  },
  Nurse: {
    Patients: "vce",
    Appointments: "vc",
    Records: "vce",
    Billing: "v",
    Admin: "",
    Reports: "v",
  },
  Receptionist: {
    Patients: "vc",
    Appointments: "vced",
    Records: "v",
    Billing: "vced",
    Admin: "",
    Reports: "v",
  },
};
