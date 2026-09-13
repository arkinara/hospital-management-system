"use client";

import React, { useMemo, useState } from "react";
import {
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  SkeletonRows,
  StateRegion,
  type Column,
  type DataState,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { api } from "@/lib/api/client";
import { useQuery, queryKeys } from "@/lib/api/queryCache";
import type { AuditLogEntry } from "@/lib/fixtures";

/**
 * Admin audit log viewer (ticket #53).
 *
 * Read-only by design: the backend log is append-only, so there is no edit or
 * delete affordance to build. Filtering is server-side via `/audit/log`.
 */
export default function AuditLogPage() {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");

  const query = useMemo(() => {
    const q: Record<string, string> = {};
    if (action.trim()) q.action = action.trim();
    if (entityType.trim()) q.target_type = entityType.trim();
    return q;
  }, [action, entityType]);

  const log = useQuery<{ entries: AuditLogEntry[] }>(queryKeys.auditLog(query), {
    fetcher: () => api.get<{ entries: AuditLogEntry[] }>("/audit/log", { query }),
  });

  const entries = log.data?.entries ?? [];

  const state: DataState = log.error
    ? "error"
    : log.loading && !log.data
      ? "loading"
      : entries.length === 0
        ? "empty"
        : "ready";

  const columns: Column<AuditLogEntry>[] = [
    {
      key: "createdAt",
      label: "When",
      mono: true,
      cell: (e) => <span className="num">{new Date(e.createdAt).toLocaleString()}</span>,
    },
    { key: "action", label: "Action", cell: (e) => e.action },
    { key: "entityType", label: "Entity", cell: (e) => e.entityType },
    {
      key: "entityId",
      label: "Entity ID",
      mono: true,
      cell: (e) => <span className="num">{e.entityId ?? "—"}</span>,
    },
    {
      key: "actorUserId",
      label: "Actor",
      align: "right",
      mono: true,
      // A system-generated entry has no actor; say so rather than render a blank cell.
      cell: (e) => <span className="num">{e.actorUserId ?? "system"}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Audit log</h1>
          <p className="text-muted text-sm">
            Append-only record of every privileged action. Entries cannot be edited or removed.
          </p>
        </div>
      </header>

      <div className="card flex flex-wrap gap-3">
        <Field
          id="audit-action"
          label="Action"
          value={action}
          placeholder="patient."
          help="Matches the start of the action, e.g. patient. or record.sign"
          onChange={setAction}
          optional
          data-testid="filter-action"
        />
        <Field
          id="audit-entity"
          label="Entity type"
          value={entityType}
          placeholder="visit_note"
          onChange={setEntityType}
          optional
          data-testid="filter-entity"
        />
      </div>

      <StateRegion
        state={state}
        loading={<SkeletonRows rows={6} columns={5} />}
        empty={
          <div className="card !p-0">
            <EmptyState
              icon="history"
              title="No audit entries"
              body={
                action || entityType
                  ? "No entries match these filters. Clear them to see the full log."
                  : "Privileged actions will appear here as staff use the system."
              }
              renderIcon={renderIcon}
            />
          </div>
        }
        error={
          <div className="card !p-0">
            <ErrorState
              title="Could not load the audit log"
              body={log.error?.message ?? "The audit service did not respond."}
              onRetry={log.refetch}
              renderIcon={renderIcon}
            />
          </div>
        }
        ready={
          <div className="card overflow-hidden !p-0">
            <DataTable
              rows={entries}
              columns={columns}
              rowKey={(e) => String(e.id)}
              label="Audit log"
              caption="Privileged actions, newest first"
              rowLabel={(e) => `${e.action} on ${e.entityType}`}
              renderIcon={renderIcon}
              mobileCard={(e) => (
                <div className="space-y-1">
                  <div className="font-medium">{e.action}</div>
                  <div className="text-muted text-sm">
                    {e.entityType} · {e.entityId ?? "—"}
                  </div>
                  <div className="num text-muted text-xs">
                    {new Date(e.createdAt).toLocaleString()}
                  </div>
                </div>
              )}
            />
          </div>
        }
      />
    </div>
  );
}
