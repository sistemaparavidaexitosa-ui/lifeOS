"use client";

import { useTransition } from "react";
import { createNetWorthSnapshot } from "./actions";

export default function SnapshotButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="btn-ghost btn-sm"
      style={{ background: "rgba(255,255,255,.2)", color: "#fff" }}
      disabled={pending}
      onClick={() => startTransition(() => createNetWorthSnapshot())}
    >
      {pending ? "…" : "+ Snapshot"}
    </button>
  );
}
