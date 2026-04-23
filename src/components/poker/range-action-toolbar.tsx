import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RANGE_EDITOR_ACTION_LABELS,
  RANGE_EDITOR_ACTION_STYLES,
} from "@/lib/poker/range-editor";
import { RangeEditorAction } from "@/lib/poker/types";
import { cn } from "@/lib/utils";

export function RangeActionToolbar({
  activeAction,
  onActionChange,
}: {
  activeAction: RangeEditorAction;
  onActionChange: (action: RangeEditorAction) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {(["raise", "call", "jam", "fold"] as const).map((action) => {
        const styles = RANGE_EDITOR_ACTION_STYLES[action];
        const isActive = action === activeAction;

        return (
          <Button
            key={action}
            type="button"
            variant={isActive ? "default" : "outline"}
            onClick={() => onActionChange(action)}
            className={cn(
              "gap-2 border text-sm font-semibold capitalize transition",
              isActive
                ? `${styles.fill} ${styles.border} ${styles.text} hover:opacity-95`
                : `border-border bg-background text-foreground hover:${styles.badge}`,
            )}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full border", styles.border, styles.fill)} />
            {RANGE_EDITOR_ACTION_LABELS[action]}
            {isActive && (
              <Badge variant="outline" className="border-white/20 bg-white/10 text-current">
                Paint
              </Badge>
            )}
          </Button>
        );
      })}
    </div>
  );
}
