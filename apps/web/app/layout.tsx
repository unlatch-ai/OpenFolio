import "./globals.css";
import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "OpenFolio",
  description: "Local-first relationship intelligence for macOS.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} font-[family-name:var(--font-space-grotesk)] bg-background text-foreground antialiased`}>
        {children}
      </body>
    </html>
  );
}
