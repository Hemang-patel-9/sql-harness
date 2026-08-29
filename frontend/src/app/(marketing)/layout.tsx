import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    absolute: "SQL Harness — ask your database a question",
  },
  description:
    "SQL Harness reads your schema, turns a plain-language question into SQL, and hands the query back for you to read before anything runs.",
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return children;
}
