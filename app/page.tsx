import { redirect } from "next/navigation";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { SelfHostSection } from "@/components/landing/self-host-section";
import { Footer } from "@/components/landing/footer";
import { getRuntimeMode } from "@/lib/runtime-mode";

export default function LandingPage() {
  const mode = getRuntimeMode();

  if (mode.deploymentMode === "self-hosted") {
    redirect("/app");
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <Hero />
      <div id="features">
        <Features />
      </div>
      <SelfHostSection />
      <Footer />
    </div>
  );
}
