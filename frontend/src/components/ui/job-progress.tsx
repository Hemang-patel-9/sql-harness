import { animate } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

function useAnimatedNumber(target: number): number {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = target;
    if (from === target) return;
    const controls = animate(from, target, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (value) => setDisplay(Math.round(value)),
    });
    return () => controls.stop();
  }, [target]);

  return display;
}

export function TokenUsagePanel({
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
  const animatedInput = useAnimatedNumber(progress.tokensInput);
  const animatedOutput = useAnimatedNumber(progress.tokensOutput);

  if (progress.usageLog.length === 0 && progress.tokensInput === 0) {
    return (
      <div className={cn("rounded-lg border border-line bg-surface-2/40 px-3 py-2", className)}>
        <span className="font-mono text-[11px] text-muted">{formatDuration(elapsedMs)}</span>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border border-line bg-surface-2/40", className)}>
      {progress.usageLog.length > 0 && (
        <ul className="flex flex-col gap-1 px-3 py-2">
          {progress.usageLog.map((event, index) => (
            <li
              key={index}
              className="flex items-center justify-between gap-3 font-mono text-[11px] leading-relaxed"
            >
              <span className="truncate text-ink-2">{event.phase}</span>
              <span className="shrink-0 tabular-nums text-muted">
                {formatTokenCount(event.inputTokens)} in · {formatTokenCount(event.outputTokens)} out
              </span>
            </li>
          ))}
        </ul>
      )}
      <div
        className={cn(
          "flex items-center justify-between gap-3 px-3 py-2 font-mono text-[11px]",
          progress.usageLog.length > 0 && "border-t border-line",
        )}
      >
        <span className="text-ink">{formatDuration(elapsedMs)}</span>
        <span className="tabular-nums text-ink">
          {formatTokenCount(animatedInput)} in / {formatTokenCount(animatedOutput)} out
        </span>
      </div>
    </div>
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
