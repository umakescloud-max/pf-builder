import { AppShell, EmptyState } from "@kit";
import { NAV } from "../nav";

export default function Denials() {
  return (
    <AppShell
      brandName="Umakes.cloud"
      brandUrl="https://umakes.cloud"
      brandEmail="umakescloud@gmail.com"
      personaName="Persona"
      personaRole="Role"
      nav={NAV}
    >
      <EmptyState title="Denials screen" body="This archetype starter has no brief content applied yet." />
    </AppShell>
  );
}
