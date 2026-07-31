"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Field, Label } from "@/components/ui";

export default function SiteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="relative flex min-h-[80svh] items-center overflow-hidden pt-32 pb-24">
      <Field variant="aurora" />
      <div className="shell">
        <Label>error</Label>
        <h1 className="t-h1 balance mt-8 max-w-2xl text-ink">
          This page failed to load
        </h1>
        <p className="t-lead t-thai mt-8 max-w-lg text-ink-2">
          Something went wrong on our side, not yours. Try again — the rest of
          the site is unaffected.
        </p>
        {error.digest && (
          <p className="t-mono mt-6 text-[0.74rem] text-ink-4">
            reference {error.digest}
          </p>
        )}
        <div className="mt-11 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="btn btn-primary"
          >
            Try again
          </button>
          <Link href="/" className="btn btn-ghost">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
