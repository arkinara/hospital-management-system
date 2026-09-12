"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState } from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";

export default function NotAuthorizedPage() {
  const router = useRouter();

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center p-4 lg:p-6">
      <h1 className="sr-only">Not authorized</h1>
      <EmptyState
        icon="shield-x"
        title="You don't have access to this module"
        body="Your role does not include a view grant for this destination. If you believe this is wrong, ask an administrator to review the permission matrix."
        action={
          <Button
            variant="primary"
            icon={renderIcon("layout-dashboard", "h-4 w-4")}
            onClick={() => router.push("/dashboard")}
          >
            Back to dashboard
          </Button>
        }
        renderIcon={renderIcon}
      />
    </div>
  );
}
