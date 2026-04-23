import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LeakBucket, LeakHandRecord } from "@/lib/poker/types";
import { cn } from "@/lib/utils";

type LeakHandViewerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  bucket: LeakBucket | null;
};

const SUIT_STYLES: Record<string, { symbol: string; className: string }> = {
  h: { symbol: "♥", className: "text-rose-400" },
  d: { symbol: "♦", className: "text-sky-400" },
  c: { symbol: "♣", className: "text-emerald-400" },
  s: { symbol: "♠", className: "text-slate-100" },
};

function parseCards(heroCardsRaw?: string, heroCards?: string) {
  if (heroCardsRaw) {
    const parts = heroCardsRaw.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 2) {
      return parts.map((card) => ({
        rank: card[0] ?? "?",
        suit: card[1]?.toLowerCase() ?? null,
        fallback: card,
      }));
    }
  }

  if (!heroCards) {
    return [];
  }

  const ranks = heroCards.replace(/[^2-9TJQKA]/gi, "").split("");
  if (ranks.length < 2) {
    return [];
  }

  if (heroCards.length === 2) {
    return [
      { rank: ranks[0], suit: "s", fallback: `${ranks[0]}♠` },
      { rank: ranks[1], suit: "h", fallback: `${ranks[1]}♥` },
    ];
  }

  const suitedFlag = heroCards.slice(-1).toLowerCase();
  const suits = suitedFlag === "s" ? ["s", "s"] : ["h", "c"];
  return [
    { rank: ranks[0], suit: suits[0], fallback: `${ranks[0]}${SUIT_STYLES[suits[0]].symbol}` },
    { rank: ranks[1], suit: suits[1], fallback: `${ranks[1]}${SUIT_STYLES[suits[1]].symbol}` },
  ];
}

function formatActionLabel(record: LeakHandRecord) {
  const position = record.heroPosition ?? record.actorPosition;
  const key = `${record.branch}|${record.action}`;
  const branchLabels: Record<string, string> = {
    "sb_unopened|fold": "SB folded",
    "sb_unopened|limp": "SB limped",
    "sb_unopened|raise_non_all_in": "SB opened",
    "sb_unopened|jam": "SB jammed",
    "bb_vs_sb_limp|check": "BB checked vs SB limp",
    "bb_vs_sb_limp|raise_non_all_in": "BB iso-raised vs SB limp",
    "bb_vs_sb_limp|jam": "BB iso-jammed vs SB limp",
    "sb_vs_bb_iso|fold_vs_iso": "SB folded vs BB iso",
    "sb_vs_bb_iso|call_vs_iso": "SB called vs BB iso",
    "sb_vs_bb_iso|limp_jam": "SB limp-jammed",
    "sb_vs_bb_iso|limp_reraise_non_all_in": "SB limp-reraised",
    "bb_vs_sb_open|fold_vs_open": "BB folded vs SB open",
    "bb_vs_sb_open|call_vs_open": "BB called vs SB open",
    "bb_vs_sb_open|threebet_non_all_in": "BB 3-bet vs SB open",
    "bb_vs_sb_open|threebet_jam": "BB 3-bet jammed vs SB open",
    "sb_vs_bb_3bet|fold": "SB folded vs BB 3-bet",
    "sb_vs_bb_3bet|call": "SB called vs BB 3-bet",
    "sb_vs_bb_3bet|fourbet_jam": "SB 4-bet jammed",
  };

  if (branchLabels[key]) {
    return branchLabels[key];
  }

  const actionLabels: Record<string, string> = {
    Fold: "folded",
    Call: "called",
    Raise: record.displayContext?.includes("RFI") ? "opened" : "raised",
    Jam: "jammed",
    Check: "checked",
    Limp: "limped",
  };

  const actionLabel = actionLabels[record.action] ?? record.action.toLowerCase();
  return `${position} ${actionLabel}`;
}

function formatStack(value?: number | null) {
  return value && Number.isFinite(value) ? `${value.toFixed(1)}bb` : "N/A";
}

function HoleCards({ record }: { record: LeakHandRecord }) {
  const cards = parseCards(record.heroCardsRaw, record.heroCards);

  if (cards.length === 0) {
    return <p className="font-mono text-lg font-semibold text-white">{record.heroCards}</p>;
  }

  return (
    <div className="flex gap-2">
      {cards.map((card, index) => {
        const suitStyle = card.suit ? SUIT_STYLES[card.suit] : null;
        return (
          <div
            key={`${card.fallback}-${index}`}
            className="flex h-14 w-11 flex-col justify-between rounded-xl border border-border bg-gradient-to-b from-card to-background px-2 py-1 shadow-sm"
          >
            <span className={cn("text-sm font-bold", suitStyle?.className ?? "text-white")}>{card.rank}</span>
            <span className={cn("self-end text-lg leading-none", suitStyle?.className ?? "text-white")}>
              {suitStyle?.symbol ?? "?"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LeakHandCard({ hand }: { hand: LeakHandRecord }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <HoleCards record={hand} />
          <p className="mt-2 text-sm text-muted-foreground">{formatActionLabel(hand)}</p>
        </div>
        <Badge variant="outline" className="w-fit border-primary/30 bg-primary/10 text-primary">
          {hand.stackBucket}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-background px-3 py-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Actor Stack</p>
          <p className="mt-1 font-mono text-base text-white">{formatStack(hand.actorStackInBlinds)}</p>
        </div>
        <div className="rounded-xl border border-border bg-background px-3 py-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Effective Stack</p>
          <p className="mt-1 font-mono text-base text-white">{formatStack(hand.effectiveStackInBlinds)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-background px-3 py-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Action Summary</p>
        <p className="mt-1 text-sm leading-relaxed text-white">{hand.actionSummary}</p>
      </div>

      {hand.jamTrace && (
        <details className="mt-4 rounded-xl border border-border bg-background px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Jam classification trace</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              ["Jam family", hand.jamTrace.jamFamily],
              ["Hero position", hand.jamTrace.heroPos],
              ["Villain position", hand.jamTrace.villainPos ?? "N/A"],
              ["Effective stack", formatStack(hand.jamTrace.effectiveBb)],
              ["Bucket", hand.jamTrace.bucket],
              ["Baseline node", hand.jamTrace.baselineNode],
              ["Baseline source", hand.jamTrace.baselineSource],
              ["Confidence", hand.jamTrace.confidence],
              ["Result", hand.jamTrace.result],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-card px-3 py-2">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm text-white">{value}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      <details className="mt-4 rounded-xl border border-border bg-background px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Raw hand history</summary>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950/60 p-3 text-xs leading-relaxed text-slate-200">
          {hand.rawHand}
        </pre>
      </details>
    </div>
  );
}

export function LeakHandViewer({ open, onOpenChange, title, description, bucket }: LeakHandViewerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl border-border bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-white">
            {bucket ? `${bucket.label} - ${bucket.count.toLocaleString()} hands` : title}
          </DialogTitle>
          <DialogDescription>
            {description ?? "Inspect the real hands behind this leak counter."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[68vh] pr-4">
          <div className="space-y-4">
            {(bucket?.hands ?? []).map((hand, index) => (
              <LeakHandCard key={`${hand.handId}-${hand.branch}-${hand.action}-${index}`} hand={hand} />
            ))}
            {bucket && bucket.hands.length === 0 && (
              <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
                No backing hands are available for this leak bucket.
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
