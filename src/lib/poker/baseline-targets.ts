import { matchesRangeToken } from "./ranges";
import { GradingActionFamily, Position, PreflopRangeNode, RangeAction } from "./types";

type HandClass = {
  key: string;
  combos: number;
};

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const ACTION_PRIORITY: RangeAction[] = ["Jam", "Raise", "Call", "Check", "Continue", "Fold"];
const ACTION_FAMILIES: GradingActionFamily[] = ["RFI", "Call", "3-bet", "Fold", "Jam"];
const POSITIONS: Position[] = ["UTG", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
const FALLBACK_NODE_KEYS = new Set([
  "unopened_default_decision",
  "facing_open_default_decision",
  "squeeze_default_decision",
  "facing_3bet_default_decision",
  "facing_4bet_default_decision",
  "blind_defense_default_decision",
]);

const HAND_CLASSES: HandClass[] = RANKS.flatMap((first, firstIndex) =>
  RANKS.slice(firstIndex).flatMap((second, offset) => {
    const secondIndex = firstIndex + offset;

    if (firstIndex === secondIndex) {
      return [{ key: `${first}${second}`, combos: 6 }];
    }

    return [
      { key: `${first}${second}s`, combos: 4 },
      { key: `${first}${second}o`, combos: 12 },
    ];
  }),
);

function assignedActionForHand(node: PreflopRangeNode, hand: string) {
  for (const action of ACTION_PRIORITY) {
    const tokens = node.actions[action];
    if (tokens?.some((token) => matchesRangeToken(hand, token))) {
      return action;
    }
  }

  return null;
}

function actionBelongsToFamily(action: RangeAction, family: GradingActionFamily) {
  if (family === "RFI" || family === "3-bet") return action === "Raise" || action === "Jam";
  if (family === "Jam") return action === "Jam";
  if (family === "Call") return action === "Call";
  return action === "Fold";
}

function nodeActionFrequency(node: PreflopRangeNode, family: GradingActionFamily) {
  let totalCombos = 0;
  let actionCombos = 0;

  for (const handClass of HAND_CLASSES) {
    const assignedAction = assignedActionForHand(node, handClass.key);
    if (!assignedAction) continue;

    totalCombos += handClass.combos;
    if (actionBelongsToFamily(assignedAction, family)) {
      actionCombos += handClass.combos;
    }
  }

  return totalCombos > 0 ? actionCombos / totalCombos : null;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function baselineFromNodes(
  nodes: Record<string, PreflopRangeNode>,
  nodeKeys: string[],
  family: GradingActionFamily,
) {
  const getValues = (keys: string[]) =>
    keys
    .map((nodeKey) => nodes[nodeKey])
    .filter((node): node is PreflopRangeNode => Boolean(node))
    .map((node) => nodeActionFrequency(node, family))
    .filter((value): value is number => value !== null);

  const primaryKeys = nodeKeys.filter((nodeKey) => !FALLBACK_NODE_KEYS.has(nodeKey));
  const primaryValues = getValues(primaryKeys);
  if (primaryValues.length > 0) return average(primaryValues);

  return average(getValues(nodeKeys));
}

function unopenedNodeKeys(position: Position) {
  if (position === "BB") {
    return ["SB_open_BB_decision", "BTN_open_BB_decision", "blind_defense_default_decision"];
  }

  return [`${position}_unopened_decision`, "unopened_default_decision"];
}

function facingOpenNodeKeys(position?: Position) {
  if (position === "BB") {
    return [
      "SB_open_BB_decision",
      "BTN_open_BB_decision",
      "CO_open_BB_decision",
      "HJ_open_BB_decision",
      "blind_defense_default_decision",
    ];
  }

  if (position === "SB") {
    return ["BTN_open_SB_decision", "CO_open_call_SB_decision", "blind_defense_default_decision"];
  }

  return ["facing_open_default_decision"];
}

function nodeKeysForPositionAction(position: Position, family: GradingActionFamily) {
  if (family === "RFI") return unopenedNodeKeys(position);
  if (family === "Call" || family === "3-bet" || family === "Fold") return facingOpenNodeKeys(position);
  return ["facing_4bet_default_decision"];
}

function nodeKeysForActionFamily(family: GradingActionFamily) {
  if (family === "RFI") return ["unopened_default_decision"];
  if (family === "Call") return ["facing_open_default_decision", "blind_defense_default_decision", "squeeze_default_decision"];
  if (family === "3-bet") return ["facing_open_default_decision", "blind_defense_default_decision", "squeeze_default_decision"];
  if (family === "Fold") {
    return ["facing_open_default_decision", "blind_defense_default_decision", "squeeze_default_decision", "facing_3bet_default_decision", "facing_4bet_default_decision"];
  }

  return ["facing_4bet_default_decision"];
}

function primaryPositionFamily(position: Position): GradingActionFamily {
  return position === "BB" ? "Call" : "RFI";
}

function parseCardKey(cardKey: string): { position?: Position; family?: GradingActionFamily } {
  const parts = cardKey.split(":");
  const firstPart = parts[0] as Position | GradingActionFamily;
  const lastPart = parts[parts.length - 1] as GradingActionFamily;

  if (POSITIONS.includes(firstPart as Position)) {
    const position = firstPart as Position;
    return {
      position,
      family: ACTION_FAMILIES.includes(lastPart) ? lastPart : primaryPositionFamily(position),
    };
  }

  if (ACTION_FAMILIES.includes(firstPart as GradingActionFamily)) {
    return { family: firstPart as GradingActionFamily };
  }

  return {};
}

export function getBaselineTargetPercent(cardKey: string, nodes: Record<string, PreflopRangeNode>) {
  const { position, family } = parseCardKey(cardKey);
  if (!family) return null;

  if (position) {
    return baselineFromNodes(nodes, nodeKeysForPositionAction(position, family), family);
  }

  return baselineFromNodes(nodes, nodeKeysForActionFamily(family), family);
}
