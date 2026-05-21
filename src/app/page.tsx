import { AppShell } from "@/components/layout/AppShell";

// Always render at request-time (never statically prerender)
export const dynamic = "force-dynamic";

export default function Home() {
  return <AppShell />;
}
