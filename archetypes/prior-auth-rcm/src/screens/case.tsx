import { AppShell, EmptyState } from "@kit";
import { NAV } from "../nav";

export default function Case() {
  return (
    <AppShell
      brandName="Umakes.cloud"
      brandUrl="https://umakes.cloud"
      brandEmail="umakescloud@gmail.com"
      personaName="Persona"
      personaRole="Role"
      nav={NAV}
    >
      <EmptyState title="Case screen" body="This archetype starter has no brief content applied yet." />
    </AppShell>
  );
}
