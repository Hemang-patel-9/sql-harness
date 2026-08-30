import type { Metadata } from "next";
import { IngestClient } from "./ingest-client";

export const metadata: Metadata = { title: "Ingest" };

export default function IngestPage() {
  return <IngestClient />;
}
