import { Architecture } from "@/components/architecture";
import { Benefits } from "@/components/benefits";
import { Caveats } from "@/components/caveats";
import { Hero } from "@/components/hero";
import { Problem } from "@/components/problem";
import { ProtocolLoop } from "@/components/protocol-loop";
import { Security } from "@/components/security";
import { SetupAndSkill } from "@/components/setup-and-skill";
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
        <SetupAndSkill />
        <Security />
        <Benefits />
        <Caveats />
      </main>
      <SiteFooter />
    </>
  );
}
