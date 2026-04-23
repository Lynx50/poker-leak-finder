import { RANGE_EDITOR_RANKS, RANGE_EDITOR_ACTION_STYLES } from "@/lib/poker/range-editor";
import { RangeComboActionMap, RangeEditorAction } from "@/lib/poker/types";
import { cn } from "@/lib/utils";

type RangeMatrixCell = {
  rowRank: string;
  columnRank: string;
  combo: string;
};

export function RangeMatrix({
  matrix,
  comboActions,
  activeAction,
  onPaintStart,
  onPaintEnter,
  onPaintEnd,
}: {
  matrix: { rank: string; cells: RangeMatrixCell[] }[];
  comboActions: RangeComboActionMap;
  activeAction: RangeEditorAction;
  onPaintStart: (combo: string) => void;
  onPaintEnter: (combo: string) => void;
  onPaintEnd: () => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px] select-none">
        <div className="grid grid-cols-[40px_repeat(13,minmax(0,1fr))] gap-2">
          <div />
          {RANGE_EDITOR_RANKS.map((rank) => (
            <div key={`column-${rank}`} className="flex h-9 items-center justify-center text-sm font-semibold text-muted-foreground">
              {rank}
            </div>
          ))}

          {matrix.map((row) => (
            <div key={row.rank} className="contents">
              <div className="flex h-[52px] items-center justify-center text-sm font-semibold text-muted-foreground">
                {row.rank}
              </div>
              {row.cells.map((cell) => {
                const action = comboActions[cell.combo] ?? "fold";
                const styles = RANGE_EDITOR_ACTION_STYLES[action];

                return (
                  <button
                    key={cell.combo}
                    type="button"
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      onPaintStart(cell.combo);
                    }}
                    onPointerEnter={() => onPaintEnter(cell.combo)}
                    onPointerUp={onPaintEnd}
                    className={cn(
                      "group flex h-[52px] items-center justify-center rounded-xl border text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      styles.fill,
                      styles.border,
                      styles.text,
                    )}
                    title={`${cell.combo} -> ${action} (${activeAction} tool selected)`}
                  >
                    <span className="opacity-95 transition group-hover:opacity-100">{cell.combo}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
