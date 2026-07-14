import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://openfolio.ai"),
  title: {
    default: "OpenFolio — Remember who told you what",
    template: "%s | OpenFolio",
  },
  description: "Private, evidence-first search across your iMessage history on your Mac.",
  openGraph: {
    title: "OpenFolio remembers who told you what.",
    description: "Search your iMessage history privately on your Mac, then verify every result in the original conversation.",
    type: "website",
    siteName: "OpenFolio",
  },
  twitter: {
    card: "summary",
    title: "OpenFolio remembers who told you what.",
    description: "Private, evidence-first iMessage recall for macOS.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
