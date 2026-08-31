import { QueryConsole } from "../../../components/query-console";
import { PageShell } from "../../../components/ui/page-shell";

export default function QueryPage() {
  return (
    <PageShell
      eyebrow="Understands and retrieves — SQL generation is not wired up yet"
      title="Query"
      description="Pick the database first, then ask. You get back what the question actually said, and which of your tables could answer it — searched two ways and reranked — before any SQL is written."
    >
      <QueryConsole />
    </PageShell>
  );
}
