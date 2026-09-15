import type { ReactNode } from "react";
import RoutineTabs from "./RoutineTabs";

export default function RoutinesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5">
      <RoutineTabs />
      {children}
    </div>
  );
}
