import { AppShell, EmptyState } from "@kit";
import { NAV } from "../nav";

// Starter stub — a real build replaces this with brief.story content.
export default function Story() {
  return (
    <AppShell
      brandName="Umakes.cloud"
      brandUrl="https://umakes.cloud"
      brandEmail="umakescloud@gmail.com"
      personaName="Persona"
      personaRole="Role"
      nav={NAV}
    >
      <EmptyState title="Story screen" body="This archetype starter has no brief content applied yet." />
    </AppShell>
  );
}
