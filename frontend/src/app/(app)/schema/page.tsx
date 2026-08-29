import type { Metadata } from "next";
import { SchemaClient } from "./schema-client";

export const metadata: Metadata = { title: "Schema" };

export default function SchemaPage() {
  return <SchemaClient />;
}
