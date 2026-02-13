import { redirect } from "next/navigation";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { SelfHostSection } from "@/components/landing/self-host-section";
import { Footer } from "@/components/landing/footer";

export default function LandingPage() {
  const mode = process.env.OPENFOLIO_MODE || process.env.NEXT_PUBLIC_OPENFOLIO_MODE;

  if (mode === "self-hosted") {
    redirect("/app");
  }

  return (
    <div className="min-h-screen">
      <Hero />
      <Features />
      <SelfHostSection />
      <Footer />
    </div>
  );
}
