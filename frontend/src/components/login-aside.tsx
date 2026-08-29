"use client";

import { TranscriptCycle } from "./transcript";

/**
 * The panel beside the sign-in form. It makes the product's whole claim
 * without a word of marketing copy: a question types itself out, and the
 * query it becomes appears underneath.
 */
export function LoginAside() {
  return (
    <div className="dot-field flex h-full flex-col justify-center gap-6 p-10 xl:p-14">
      <p className="eyebrow eyebrow-tick">What this does</p>
      <TranscriptCycle />
    </div>
  );
}
