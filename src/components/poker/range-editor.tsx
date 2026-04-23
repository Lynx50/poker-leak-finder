import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  buildComboActionsFromLegacyActions,
  getRangeEditorActionSummaries,
  getRangeEditorMatrix,
  getRangeEditorTextPreview,
  RANGE_EDITOR_ACTION_LABELS,
  RANGE_EDITOR_ACTION_STYLES,
} from "@/lib/poker/range-editor";
import { PreflopRangeNode, RangeComboActionMap, RangeEditorAction } from "@/lib/poker/types";
import { cn } from "@/lib/utils";

import { RangeActionToolbar } from "./range-action-toolbar";
import { RangeMatrix } from "./range-matrix";

export function RangeEditor({
  baselineName,
  node,
  value,
  onChange,
  onReset,
}: {
  baselineName: string;
  node?: PreflopRangeNode;
  value: RangeComboActionMap;
  onChange: (next: RangeComboActionMap) => void;
  onReset?: () => void;
}) {
  const [activeAction, setActiveAction] = useState<RangeEditorAction>("raise");
  const matrix = useMemo(() => getRangeEditorMatrix(), []);
  const valueRef = useRef(value);
  const paintRef = useRef<{ isPainting: boolean; painted: Set<string> }>({
    isPainting: false,
    painted: new Set(),
  });
  const summaries = useMemo(() => getRangeEditorActionSummaries(value), [value]);
  const legacySource = useMemo(
    () => (node?.comboActions ? null : node ? buildComboActionsFromLegacyActions(node.actions) : null),
    [node],
  );

  valueRef.current = value;

  useEffect(() => {
    const handlePointerUp = () => {
      paintRef.current.isPainting = false;
      paintRef.current.painted.clear();
    };

    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, []);

  const updateCombo = (combo: string, action: RangeEditorAction) => {
    if (valueRef.current[combo] === action) {
      return;
    }

    const next = {
      ...valueRef.current,
      [combo]: action,
    };

    valueRef.current = next;
    onChange(next);
  };

  const handlePaintStart = (combo: string) => {
    paintRef.current.isPainting = true;
    paintRef.current.painted = new Set([combo]);
    updateCombo(combo, activeAction);
  };

  const handlePaintEnter = (combo: string) => {
    if (!paintRef.current.isPainting || paintRef.current.painted.has(combo)) {
      return;
    }

    paintRef.current.painted.add(combo);
    updateCombo(combo, activeAction);
  };

  const handlePaintEnd = () => {
    paintRef.current.isPainting = false;
    paintRef.current.painted.clear();
  };

  return (
    <Card className="border-border bg-background/70">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-white">{baselineName}</CardTitle>
            <CardDescription>
              Edit this baseline visually by clicking or dragging across combos. Unspecified legacy combos are treated as fold.
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit border-primary/30 bg-primary/10 text-primary">
            Interactive baseline editor
          </Badge>
        </div>
        <RangeActionToolbar activeAction={activeAction} onActionChange={setActiveAction} />
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {summaries.map((summary) => {
            const styles = RANGE_EDITOR_ACTION_STYLES[summary.action];

            return (
              <div key={summary.action} className="rounded-2xl border border-border bg-card/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-3 w-3 rounded-full border", styles.border, styles.fill)} />
                    <p className="text-sm font-semibold text-white">{RANGE_EDITOR_ACTION_LABELS[summary.action]}</p>
                  </div>
                  <Badge variant="outline" className={styles.badge}>
                    {summary.handCount} hands
                  </Badge>
                </div>
                <p className={cn("mt-3 font-mono text-2xl font-semibold", styles.muted)}>
                  {(summary.percent * 100).toFixed(1)}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{summary.comboCount} weighted combos</p>
              </div>
            );
          })}
        </div>

        {legacySource && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            This node was loaded from legacy action tokens. The matrix migrated included combos into explicit action states and defaulted all other combos to fold.
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card/30 p-4">
          <RangeMatrix
            matrix={matrix}
            comboActions={value}
            activeAction={activeAction}
            onPaintStart={handlePaintStart}
            onPaintEnter={handlePaintEnter}
            onPaintEnd={handlePaintEnd}
          />
        </div>

        <div className="rounded-2xl border border-border bg-card/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Action legend</p>
              <p className="text-xs text-muted-foreground">
                Raise = green, Call = orange, Jam = purple, Fold = grey.
              </p>
            </div>
            {onReset && (
              <Button type="button" variant="outline" onClick={onReset}>
                Reset Editor
              </Button>
            )}
          </div>

          <Separator className="my-4" />

          <div className="grid gap-4 md:grid-cols-2">
            {(["raise", "call", "jam", "fold"] as const).map((action) => (
              <div key={action} className="rounded-xl border border-border bg-background/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">{RANGE_EDITOR_ACTION_LABELS[action]}</p>
                  <Badge variant="outline" className={RANGE_EDITOR_ACTION_STYLES[action].badge}>
                    {summaries.find((entry) => entry.action === action)?.handCount ?? 0}
                  </Badge>
                </div>
                <p className="mt-2 max-h-28 overflow-auto font-mono text-[11px] leading-5 text-muted-foreground">
                  {getRangeEditorTextPreview(value, action) || "No combos assigned."}
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
