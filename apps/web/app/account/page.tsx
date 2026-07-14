import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "No account required",
  description: "OpenFolio runs locally on your Mac without an account.",
};

export default function AccountPage() {
  return (
    <div className="site-shell">
      <Navbar />
      <main>
        <section className="section-frame account-page">
          <p className="eyebrow"><span>Local app</span><span>No sign-in</span></p>
          <h1>There is no OpenFolio account to manage.</h1>
          <p>
            OpenFolio’s current Mac app runs locally and does not require an
            account. Download the app, allow read-only Messages access, and build
            your private archive on your Mac.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="https://github.com/unlatch-ai/OpenFolio/releases/latest">Download for macOS</a>
            <Link className="button button-quiet" href="/docs/getting-started">Installation guide</Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
