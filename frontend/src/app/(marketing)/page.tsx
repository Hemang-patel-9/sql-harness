import { Hero } from "../../components/marketing/hero";
import { MarketingNav } from "../../components/marketing/marketing-nav";
import {
  Capabilities,
  ClosingCta,
  DemoSection,
  HowItWorks,
  MarketingFooter,
  SchemaSection,
} from "../../components/marketing/sections";

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <MarketingNav />

      <main className="flex-1">
        <Hero />
        <DemoSection />
        <HowItWorks />
        <Capabilities />
        <SchemaSection />
        <ClosingCta />
      </main>

      <MarketingFooter />
    </div>
  );
}
