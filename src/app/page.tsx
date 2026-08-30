import { Architecture } from "@/components/architecture";
import { Benefits } from "@/components/benefits";
import { Caveats } from "@/components/caveats";
import { DesktopGlue } from "@/components/desktop-glue";
import { Hero } from "@/components/hero";
import { Problem } from "@/components/problem";
import { ProtocolLoop } from "@/components/protocol-loop";
import { Security } from "@/components/security";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Problem />
        <Architecture />
        <ProtocolLoop />
        <DesktopGlue />
        <Security />
        <Benefits />
        <Caveats />
      </main>
      <SiteFooter />
    </>
  );
}
