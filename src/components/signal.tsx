import type { Decision, Signal } from "@/lib/types";
import { SIGNAL_LABELS } from "@/lib/labels";
import { Badge, type Tone } from "./ui";

export const SIGNAL_TONE: Record<Signal, Tone> = {
  stop: "stop",
  watch: "watch",
  keep: "keep",
  scale: "scale",
  learning: "neutral",
  no_data: "neutral",
  inactive: "neutral",
};

export function SignalBadge({ signal }: { signal: Signal | Decision }) {
  return <Badge tone={SIGNAL_TONE[signal]}>{SIGNAL_LABELS[signal]}</Badge>;
}
