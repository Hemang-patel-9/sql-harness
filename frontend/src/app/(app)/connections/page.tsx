import type { Metadata } from "next";
import { ConnectionsClient } from "./connections-client";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsPage() {
  return <ConnectionsClient />;
}
