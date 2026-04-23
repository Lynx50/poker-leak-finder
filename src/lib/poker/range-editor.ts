import { matchesRangeToken, getRangeActionForHand } from "./ranges";
import { PreflopRangeNode, RangeAction, RangeComboActionMap, RangeEditorAction } from "./types";

export const RANGE_EDITOR_ACTIONS: RangeEditorAction[] = ["raise", "call", "jam", "fold"];
export const RANGE_EDITOR_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;

export const RANGE_EDITOR_ACTION_LABELS: Record<RangeEditorAction, string> = {
  raise: "Raise",
  call: "Call",
  jam: "Jam",
  fold: "Fold",
};

export const RANGE_EDITOR_ACTION_STYLES: Record<
  RangeEditorAction,
  {
    fill: string;
    border: string;
    text: string;
    badge: string;
    muted: string;
  }
> = {
  raise: {
    fill: "bg-emerald-600/85",
    border: "border-emerald-400/60",
    text: "text-emerald-50",
    badge: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
    muted: "text-emerald-200",
  },
  call: {
    fill: "bg-orange-500/85",
    border: "border-orange-300/60",
    text: "text-orange-50",
    badge: "border-orange-400/40 bg-orange-500/15 text-orange-300",
    muted: "text-orange-200",
  },
  jam: {
    fill: "bg-fuchsia-600/85",
    border: "border-fuchsia-300/60",
    text: "text-fuchsia-50",
    badge: "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-300",
    muted: "text-fuchsia-200",
  },
  fold: {
    fill: "bg-slate-600/70",
    border: "border-slate-400/50",
    text: "text-slate-100",
    badge: "border-slate-400/40 bg-slate-500/10 text-slate-300",
    muted: "text-slate-300",
  },
};

const RANGE_EDITOR_ACTION_ORDER: RangeAction[] = ["Jam", "Raise", "Call", "Fold"];
const TOTAL_COMBOS = 1326;

function toComboLabel(rowIndex: number, columnIndex: number) {
  const rowRank = RANGE_EDITOR_RANKS[rowIndex];
  const columnRank = RANGE_EDITOR_RANKS[columnIndex];

  if (rowIndex === columnIndex) {
    return `${rowRank}${columnRank}`;
  }

  if (rowIndex < columnIndex) {
    return `${rowRank}${columnRank}s`;
  }

  return `${columnRank}${rowRank}o`;
}

function rangeActionToEditorAction(action: RangeAction | null): RangeEditorAction {
  switch (action) {
    case "Raise":
      return "raise";
    case "Call":
    case "Continue":
      return "call";
    case "Jam":
      return "jam";
    default:
      return "fold";
  }
}

function editorActionToRangeAction(action: RangeEditorAction): RangeAction {
  switch (action) {
    case "raise":
      return "Raise";
    case "call":
      return "Call";
    case "jam":
      return "Jam";
    case "fold":
      return "Fold";
  }
}

export function getAllRangeEditorCombos() {
  return RANGE_EDITOR_RANKS.flatMap((_, rowIndex) =>
    RANGE_EDITOR_RANKS.map((__, columnIndex) => toComboLabel(rowIndex, columnIndex)),
  );
}

export function createEmptyRangeComboActionMap(defaultAction: RangeEditorAction = "fold"): RangeComboActionMap {
  return getAllRangeEditorCombos().reduce<RangeComboActionMap>((acc, combo) => {
    acc[combo] = defaultAction;
    return acc;
  }, {});
}

export function getRangeEditorMatrix() {
  return RANGE_EDITOR_RANKS.map((rowRank, rowIndex) => ({
    rank: rowRank,
    cells: RANGE_EDITOR_RANKS.map((columnRank, columnIndex) => ({
      rowRank,
      columnRank,
      combo: toComboLabel(rowIndex, columnIndex),
    })),
  }));
}

export function getComboWeight(combo: string) {
  if (combo.length === 2) return 6;
  if (combo.endsWith("s")) return 4;
  return 12;
}

export function buildRangeComboActionMap(node?: PreflopRangeNode): RangeComboActionMap {
  const baseMap = createEmptyRangeComboActionMap();

  if (!node) {
    return baseMap;
  }

  if (node.comboActions) {
    return {
      ...baseMap,
      ...node.comboActions,
    };
  }

  return getAllRangeEditorCombos().reduce<RangeComboActionMap>((acc, combo) => {
    const assignedAction = getRangeActionForHand(node, combo);
    acc[combo] = rangeActionToEditorAction(assignedAction);
    return acc;
  }, baseMap);
}

export function getRangeEditorActionSummaries(comboActions: RangeComboActionMap) {
  return RANGE_EDITOR_ACTIONS.map((action) => {
    const hands = Object.entries(comboActions).filter(([, assignedAction]) => assignedAction === action);
    const comboCount = hands.reduce((total, [combo]) => total + getComboWeight(combo), 0);

    return {
      action,
      handCount: hands.length,
      comboCount,
      percent: comboCount / TOTAL_COMBOS,
    };
  });
}

export function comboActionsToNodeActions(comboActions: RangeComboActionMap) {
  const actionBuckets = RANGE_EDITOR_ACTION_ORDER.reduce<Partial<Record<RangeAction, string[]>>>((acc, action) => {
    acc[action] = [];
    return acc;
  }, {});

  for (const combo of getAllRangeEditorCombos()) {
    const editorAction = comboActions[combo] ?? "fold";
    const rangeAction = editorActionToRangeAction(editorAction);

    if (rangeAction === "Fold") {
      continue;
    }

    actionBuckets[rangeAction]?.push(combo);
  }

  return {
    Raise: actionBuckets.Raise?.length ? actionBuckets.Raise : undefined,
    Call: actionBuckets.Call?.length ? actionBuckets.Call : undefined,
    Jam: actionBuckets.Jam?.length ? actionBuckets.Jam : undefined,
    Fold: ["*"],
  } satisfies Partial<Record<RangeAction, string[]>>;
}

export function serializeRangeEditorNode(
  nodeKey: string,
  label: string,
  stackBucket: string,
  sourceLabel: string,
  comboActions: RangeComboActionMap,
  existingActions?: Partial<Record<RangeAction, string[]>>,
): PreflopRangeNode {
  const nextActions = comboActionsToNodeActions(comboActions);

  return {
    nodeKey,
    label,
    stackBucket,
    sourceLabel,
    actions: {
      ...existingActions,
      ...nextActions,
      Check: existingActions?.Check,
      Continue: existingActions?.Continue,
    },
    comboActions,
  };
}

export function getRangeEditorTextPreview(comboActions: RangeComboActionMap, action: RangeEditorAction) {
  return getAllRangeEditorCombos()
    .filter((combo) => comboActions[combo] === action)
    .join(", ");
}

export function normalizeImportedComboActions(raw: unknown): RangeComboActionMap | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const entries = Object.entries(raw as Record<string, unknown>).filter(
    ([combo, action]) =>
      getAllRangeEditorCombos().includes(combo) &&
      typeof action === "string" &&
      RANGE_EDITOR_ACTIONS.includes(action as RangeEditorAction),
  ) as [string, RangeEditorAction][];

  if (entries.length === 0) {
    return undefined;
  }

  const baseMap = createEmptyRangeComboActionMap();
  for (const [combo, action] of entries) {
    baseMap[combo] = action;
  }

  return baseMap;
}

export function buildComboActionsFromLegacyActions(actions: Partial<Record<RangeAction, string[]>>) {
  const comboActions = createEmptyRangeComboActionMap();

  for (const combo of getAllRangeEditorCombos()) {
    let assignedAction: RangeEditorAction = "fold";

    for (const action of RANGE_EDITOR_ACTION_ORDER) {
      const tokens = actions[action];
      if (tokens?.some((token) => matchesRangeToken(combo, token))) {
        assignedAction = rangeActionToEditorAction(action);
        break;
      }
    }

    comboActions[combo] = assignedAction;
  }

  return comboActions;
}
