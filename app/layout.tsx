import type { Metadata } from "next";
import { DM_Sans, Newsreader, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteTitle = "OpenFolio — AI-Native Personal CRM";
const siteDescription =
  "Open-source, AI-powered personal CRM. Sync contacts from email, social media, and calendar. Semantic search and relationship intelligence.";

export const metadata: Metadata = {
  metadataBase: new URL("https://openfolio.ai"),
  title: {
    default: siteTitle,
    template: "%s — OpenFolio",
  },
  description: siteDescription,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: siteTitle,
    description: siteDescription,
    siteName: "OpenFolio",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "OpenFolio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og.png"],
  },
  icons: {
    icon: [{ url: "/favicon.ico" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${newsreader.variable} ${geistMono.variable} font-sans`}
      >
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            className: "font-sans",
          }}
        />
        <Analytics />
      </body>
    </html>
  );
}
