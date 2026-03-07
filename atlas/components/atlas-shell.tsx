import type { ReactNode } from "react";
import { SiteNav } from "@/components/site-nav";

type AtlasShellProps = {
  children: ReactNode;
};

export async function AtlasShell({ children }: AtlasShellProps) {
  return (
    <div className="atlas-page-shell">
      <div className="atlas-ambient atlas-ambient-a" aria-hidden="true" />
      <div className="atlas-ambient atlas-ambient-b" aria-hidden="true" />
      <SiteNav />
      <main className="atlas-main">{children}</main>
    </div>
  );
}
