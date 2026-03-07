import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/globals.css";
import { AtlasShell } from "@/components/atlas-shell";

export const metadata: Metadata = {
  title: "Lenia Atlas",
  description: "Museum-grade atlas scaffold for Lenia taxa, ecologies, and creature telemetry."
};

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <AtlasShell>{children}</AtlasShell>
      </body>
    </html>
  );
}
