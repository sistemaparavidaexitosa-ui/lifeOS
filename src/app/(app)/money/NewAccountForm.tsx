"use client";

import { useRef, useTransition } from "react";
import { createAccount } from "./actions";

export default function NewAccountForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={ref}
      action={(fd) => startTransition(async () => { await createAccount(fd); ref.current?.reset(); })}
      className="grid grid-cols-4 gap-2 mt-2"
    >
      <input name="name" placeholder="Nueva cuenta" required className="col-span-2" />
      <select name="type" defaultValue="bank">
        <option value="bank">bank</option>
        <option value="cash">cash</option>
        <option value="savings">savings</option>
      </select>
      <input name="opening" type="number" step="0.01" placeholder="Saldo" defaultValue={0} />
      <input type="hidden" name="currency" value="MXN" />
      <button className="btn-primary col-span-4" disabled={pending} type="submit">
        {pending ? "…" : "+ Cuenta"}
      </button>
    </form>
  );
}
