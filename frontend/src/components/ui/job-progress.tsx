import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { JobProgress } from "../../lib/api";
import { cn } from "../../lib/utils";

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function formatTokenCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

export function JobStats({
  progress,
  running,
  frozenElapsedMs,
  className,
}: {
  progress: JobProgress;
  running: boolean;
  frozenElapsedMs?: number;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const elapsedMs = running
    ? now - new Date(progress.createdAt).getTime()
    : (frozenElapsedMs ?? now - new Date(progress.createdAt).getTime());
  const totalTokens = progress.tokensInput + progress.tokensOutput;

  return (
    <span className={cn("font-mono text-[11px] text-muted", className)}>
      {formatDuration(elapsedMs)}
      {totalTokens > 0 &&
        ` · ${formatTokenCount(totalTokens)} tokens (${formatTokenCount(progress.tokensInput)} in / ${formatTokenCount(progress.tokensOutput)} out)`}
    </span>
  );
}

export function JobTrace({ progress, className }: { progress: JobProgress; className?: string }) {
  if (progress.log.length === 0) return null;
  const running = progress.current < progress.total;
  const lastIndex = progress.log.length - 1;

  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {progress.log.map((line, index) => {
        const active = running && index === lastIndex;
        return (
          <li key={index} className="flex items-start gap-2 font-mono text-[12px] leading-relaxed">
            {active ? (
              <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-muted" aria-hidden />
            ) : (
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden />
            )}
            <span className={active ? "text-ink" : "text-ink-2"}>{line}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function JobProgressBar({
  progress,
  className,
}: {
  progress: JobProgress;
  className?: string;
}) {
  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-marker transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="truncate font-mono text-[11px] text-muted">
        {progress.total > 1 ? `${progress.current}/${progress.total} · ` : ""}
        {progress.message}
      </span>
    </div>
  );
}
