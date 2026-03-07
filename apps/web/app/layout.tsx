import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OpenFolio",
  description: "Local-first relationship intelligence for macOS.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
