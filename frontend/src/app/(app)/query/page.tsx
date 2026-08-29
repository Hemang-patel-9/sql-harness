import { QueryConsole } from "../../../components/query-console";
import { PageShell } from "../../../components/ui/page-shell";

export default function QueryPage() {
  return (
    <PageShell
      eyebrow="Connected to analytics-prod"
      title="Query"
      description="Describe what you want to know. You get SQL back — read it before you run it."
    >
      <QueryConsole />
    </PageShell>
  );
}
