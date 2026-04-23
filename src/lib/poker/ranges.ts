import { DecisionSeed, PreflopRangeNode, RangeAction, RangeEditorAction, RangeLibraryState, RangePack, RangeResolution, RangeSourceKind, RangeValidationResult } from "./types";

const ACTION_PRIORITY: RangeAction[] = ["Jam", "Raise", "Call", "Check", "Continue", "Fold"];
const ACTION_SET = new Set<RangeAction>(ACTION_PRIORITY);
const RANKS = "23456789TJQKA";
const DEFAULT_VERSION = "1.0.0";
const DEFAULT_LABEL = "Tournament Baseline";

function node(
  nodeKey: string,
  label: string,
  actions: Partial<Record<RangeAction, string[]>>,
  stackBucket = "10–15bb",
): PreflopRangeNode {
  return {
    nodeKey,
    label,
    stackBucket,
    sourceLabel: DEFAULT_LABEL,
    actions,
  };
}

export const BUILT_IN_RANGE_PACK: RangePack = {
  version: DEFAULT_VERSION,
  sourceLabel: DEFAULT_LABEL,
  nodes: {
    UTG_unopened_decision: node("UTG_unopened_decision", "UTG RFI", {
      Raise: ["66+", "AJo+", "ATs+", "KQs", "KJs+", "QJs", "JTs", "T9s"],
      Fold: ["*"],
    }),
    LJ_unopened_decision: node("LJ_unopened_decision", "LJ RFI", {
      Raise: ["55+", "ATo+", "A8s+", "KQo", "KTs+", "QTs+", "JTs", "T9s", "98s"],
      Fold: ["*"],
    }),
    HJ_unopened_decision: node("HJ_unopened_decision", "HJ RFI", {
      Raise: ["44+", "ATo+", "A5s+", "KQo", "KTs+", "QTs+", "JTs", "T9s", "98s", "87s"],
      Fold: ["*"],
    }),
    CO_unopened_decision: node("CO_unopened_decision", "CO RFI", {
      Raise: ["22+", "A8o+", "A2s+", "KTo+", "K8s+", "QTo+", "Q8s+", "J9s+", "T8s+", "97s+", "86s+", "76s", "65s"],
      Fold: ["*"],
    }),
    BTN_unopened_decision: node("BTN_unopened_decision", "BTN RFI", {
      Raise: ["22+", "A2o+", "A2s+", "K7o+", "K2s+", "Q8o+", "Q5s+", "J8o+", "J7s+", "T8o+", "T6s+", "96s+", "86s+", "75s+", "64s+", "54s"],
      Fold: ["*"],
    }),
    SB_unopened_decision: node("SB_unopened_decision", "SB Open", {
      Raise: ["22+", "A2o+", "A2s+", "K5o+", "K2s+", "Q8o+", "Q5s+", "J8o+", "J6s+", "T8o+", "T6s+", "96s+", "86s+", "75s+", "64s+", "54s"],
      Fold: ["*"],
    }),

    HJ_open_CO_decision: node("HJ_open_CO_decision", "CO vs HJ Open", {
      Raise: ["99+", "AQs+", "AKo", "A5s-A4s", "KQs"],
      Call: ["22-88", "AJs-A2s", "KJs+", "QJs", "JTs", "T9s", "98s", "87s", "AQo", "KQo"],
      Fold: ["*"],
    }),
    HJ_open_BTN_decision: node("HJ_open_BTN_decision", "BTN vs HJ Open", {
      Raise: ["88+", "AJs+", "AQo+", "A5s-A2s", "KQs"],
      Call: ["22-77", "ATs-A2s", "KTs+", "QTs+", "JTs", "T9s", "98s", "87s", "76s", "AJo", "KQo"],
      Fold: ["*"],
    }),
    CO_open_BTN_decision: node("CO_open_BTN_decision", "BTN vs CO Open", {
      Raise: ["77+", "ATs+", "AQo+", "A5s-A2s", "KJs+", "QJs"],
      Call: ["22-66", "A9s-A2s", "KTs-K8s", "QTs-Q8s", "J9s+", "T8s+", "97s+", "87s", "76s", "65s", "AJo-ATo", "KQo", "QJo"],
      Fold: ["*"],
    }),
    BTN_open_SB_decision: node("BTN_open_SB_decision", "SB vs BTN Open", {
      Raise: ["77+", "ATs+", "AQo+", "A5s-A2s", "KJs+", "QJs"],
      Call: ["22-66", "A9s-A2s", "KTs-K8s", "QTs-Q9s", "JTs-J8s", "T9s-T7s", "98s-86s", "76s", "65s", "AJo-ATo", "KQo"],
      Fold: ["*"],
    }),
    HJ_open_BB_decision: node("HJ_open_BB_decision", "BB vs HJ Open", {
      Raise: ["TT+", "AQs+", "AKo", "A5s-A4s"],
      Call: ["22-99", "AJs-A2s", "KQs-KTs", "QJs-QTs", "JTs", "T9s", "98s", "87s", "AQo-AJo", "KQo"],
      Fold: ["*"],
    }),
    CO_open_BB_decision: node("CO_open_BB_decision", "BB vs CO Open", {
      Raise: ["88+", "ATs+", "AQo+", "A5s-A2s", "KQs"],
      Call: ["22-77", "A9s-A2s", "KJs-K7s", "QTs-Q8s", "JTs-J8s", "T9s-T7s", "97s+", "86s+", "75s+", "65s", "AJo-ATo", "KQo", "QJo"],
      Fold: ["*"],
    }),
    BTN_open_BB_decision: node("BTN_open_BB_decision", "BB vs BTN Open", {
      Raise: ["77+", "ATs+", "AQo+", "A5s-A2s", "KJs+", "QJs"],
      Call: ["22-66", "A8s-A2s", "KTs-K4s", "Q9s-Q6s", "J9s-J7s", "T8s-T6s", "97s-85s", "76s-64s", "54s", "ATo-A8o", "KQo-KJo", "QJo"],
      Fold: ["*"],
    }),
    SB_open_BB_decision: node("SB_open_BB_decision", "BB vs SB Open", {
      Raise: ["66+", "A9s+", "AJo+", "A5s-A2s", "KTs+", "QTs+", "JTs"],
      Call: ["22-55", "A8s-A2s", "K9s-K4s", "Q9s-Q6s", "J9s-J7s", "T8s-T6s", "97s-85s", "76s-64s", "54s", "ATo-A7o", "KQo-KTo", "QJo-JTo"],
      Fold: ["*"],
    }),

    CO_open_call_BB_decision: node("CO_open_call_BB_decision", "BB vs CO Open + BTN Flat", {
      Raise: ["TT+", "AQs+", "AKo", "A5s-A4s"],
      Call: ["55-99", "AJs-A2s", "KQs-KTs", "QJs-QTs", "JTs", "T9s", "98s", "87s", "76s", "AQo", "KQo"],
      Fold: ["*"],
    }),
    BTN_open_call_BB_decision: node("BTN_open_call_BB_decision", "BB vs BTN Open + SB Flat", {
      Raise: ["99+", "AJs+", "AQo+", "A5s-A4s", "KQs"],
      Call: ["44-88", "ATs-A2s", "KJs-K8s", "QTs-Q8s", "JTs-J8s", "T9s-T7s", "97s+", "86s+", "75s+", "65s", "AJo-ATo", "KQo", "QJo"],
      Fold: ["*"],
    }),
    HJ_open_call_BTN_decision: node("HJ_open_call_BTN_decision", "BTN vs HJ Open + Caller", {
      Raise: ["TT+", "AQs+", "AKo", "A5s-A4s"],
      Call: ["55-99", "AJs-A2s", "KQs-KTs", "QJs-QTs", "JTs", "T9s", "98s", "87s", "76s", "AQo", "KQo"],
      Fold: ["*"],
    }),
    CO_open_call_SB_decision: node("CO_open_call_SB_decision", "SB vs CO Open + Caller", {
      Raise: ["TT+", "AQs+", "AKo", "A5s-A4s"],
      Call: ["66-99", "AJs-A5s", "KQs-KJs", "QJs-QTs", "JTs", "T9s", "98s", "AQo", "KQo"],
      Fold: ["*"],
    }),
    CO_open_multi_call_2_BB_decision: node("CO_open_multi_call_2_BB_decision", "BB vs CO Open + Multiple Callers", {
      Raise: ["JJ+", "AQs+", "AKo", "A5s-A4s"],
      Call: ["44-TT", "AJs-A2s", "KQs-KTs", "QJs-QTs", "JTs", "T9s", "98s", "87s", "76s", "AQo", "KQo"],
      Fold: ["*"],
    }),
    BTN_open_multi_call_2_BB_decision: node("BTN_open_multi_call_2_BB_decision", "BB vs BTN Open + Multiple Callers", {
      Raise: ["TT+", "AQs+", "AKo", "A5s-A4s"],
      Call: ["33-99", "ATs-A2s", "KJs-K7s", "QTs-Q8s", "JTs-J8s", "T9s-T7s", "97s+", "86s+", "75s+", "65s", "AQo-AJo", "KQo"],
      Fold: ["*"],
    }),

    HJ_open_CO_3bet_HJ_decision: node("HJ_open_CO_3bet_HJ_decision", "HJ Facing CO 3-Bet", {
      Raise: ["QQ+", "AKs", "AKo"],
      Call: ["99-JJ", "AQs", "AJs", "KQs"],
      Fold: ["*"],
    }),
    HJ_open_BTN_3bet_HJ_decision: node("HJ_open_BTN_3bet_HJ_decision", "HJ Facing BTN 3-Bet", {
      Raise: ["QQ+", "AKs", "AKo"],
      Call: ["TT-JJ", "AQs", "AJs", "KQs"],
      Fold: ["*"],
    }),
    HJ_open_BB_3bet_HJ_decision: node("HJ_open_BB_3bet_HJ_decision", "HJ Facing BB 3-Bet", {
      Raise: ["QQ+", "AKs", "AKo"],
      Call: ["TT-JJ", "AQs", "AJs", "KQs"],
      Fold: ["*"],
    }),
    CO_open_BTN_3bet_CO_decision: node("CO_open_BTN_3bet_CO_decision", "CO Facing BTN 3-Bet", {
      Raise: ["QQ+", "AKs", "AKo", "A5s"],
      Call: ["99-JJ", "AQs-AJs", "KQs"],
      Fold: ["*"],
    }),
    CO_open_SB_3bet_CO_decision: node("CO_open_SB_3bet_CO_decision", "CO Facing SB 3-Bet", {
      Raise: ["QQ+", "AKs", "AKo"],
      Call: ["99-JJ", "AQs", "AJs", "KQs"],
      Fold: ["*"],
    }),
    CO_open_BB_3bet_CO_decision: node("CO_open_BB_3bet_CO_decision", "CO Facing BB 3-Bet", {
      Raise: ["QQ+", "AKs", "AKo"],
      Call: ["99-JJ", "AQs-AJs", "KQs"],
      Fold: ["*"],
    }),
    BTN_open_SB_3bet_BTN_decision: node("BTN_open_SB_3bet_BTN_decision", "BTN Facing SB 3-Bet", {
      Raise: ["QQ+", "AKs", "AKo", "A5s-A4s"],
      Call: ["88-JJ", "AQs-A9s", "KQs-KJs", "QJs", "JTs"],
      Fold: ["*"],
    }),
    BTN_open_BB_3bet_BTN_decision: node("BTN_open_BB_3bet_BTN_decision", "BTN Facing BB 3-Bet", {
      Raise: ["QQ+", "AKs", "AKo", "A5s-A4s"],
      Call: ["88-JJ", "AQs-A9s", "KQs-KJs", "QJs", "JTs", "T9s"],
      Fold: ["*"],
    }),
    SB_open_BB_3bet_SB_decision: node("SB_open_BB_3bet_SB_decision", "SB Facing BB 3-Bet", {
      Raise: ["QQ+", "AKs", "AKo", "A5s-A4s"],
      Call: ["99-JJ", "AQs-AJs", "KQs", "QJs"],
      Fold: ["*"],
    }),

    HJ_open_CO_4bet_HJ_decision: node("HJ_open_CO_4bet_HJ_decision", "HJ Facing CO 4-Bet", {
      Jam: ["KK+", "AKs", "AKo"],
      Call: ["QQ"],
      Fold: ["*"],
    }),
    HJ_open_BTN_4bet_HJ_decision: node("HJ_open_BTN_4bet_HJ_decision", "HJ Facing BTN 4-Bet", {
      Jam: ["KK+", "AKs", "AKo"],
      Call: ["QQ"],
      Fold: ["*"],
    }),
    CO_open_BTN_4bet_CO_decision: node("CO_open_BTN_4bet_CO_decision", "CO Facing BTN 4-Bet", {
      Jam: ["KK+", "AKs", "AKo"],
      Call: ["QQ"],
      Fold: ["*"],
    }),
    BTN_open_BB_4bet_BTN_decision: node("BTN_open_BB_4bet_BTN_decision", "BTN Facing BB 4-Bet", {
      Jam: ["KK+", "AKs", "AKo"],
      Call: ["QQ"],
      Fold: ["*"],
    }),
    SB_open_BB_4bet_SB_decision: node("SB_open_BB_4bet_SB_decision", "SB Facing BB 4-Bet", {
      Jam: ["KK+", "AKs", "AKo"],
      Call: ["QQ"],
      Fold: ["*"],
    }),

    unopened_default_decision: node("unopened_default_decision", "Generic Unopened Baseline", {
      Raise: ["55+", "ATo+", "A8s+", "KQo", "KTs+", "QTs+", "JTs", "T9s", "98s"],
      Fold: ["*"],
    }),
    facing_open_default_decision: node("facing_open_default_decision", "Generic Facing Open Baseline", {
      Raise: ["99+", "AQs+", "AKo", "A5s-A4s"],
      Call: ["22-88", "AJs-A2s", "KQs-KTs", "QJs-QTs", "JTs", "T9s", "98s", "87s", "AQo-AJo", "KQo"],
      Fold: ["*"],
    }),
    squeeze_default_decision: node("squeeze_default_decision", "Generic Squeeze Baseline", {
      Raise: ["TT+", "AQs+", "AKo", "A5s-A4s"],
      Call: ["66-99", "AJs-A5s", "KQs-KJs", "QJs-QTs", "JTs", "T9s", "98s"],
      Fold: ["*"],
    }),
    facing_3bet_default_decision: node("facing_3bet_default_decision", "Generic Facing 3-Bet Baseline", {
      Raise: ["QQ+", "AKs", "AKo"],
      Call: ["99-JJ", "AQs-AJs", "KQs"],
      Fold: ["*"],
    }),
    facing_4bet_default_decision: node("facing_4bet_default_decision", "Generic Facing 4-Bet Baseline", {
      Jam: ["KK+", "AKs", "AKo"],
      Call: ["QQ"],
      Fold: ["*"],
    }),
    blind_defense_default_decision: node("blind_defense_default_decision", "Generic Blind Defense Baseline", {
      Raise: ["88+", "ATs+", "AQo+", "A5s-A2s", "KQs"],
      Call: ["22-77", "A9s-A2s", "KJs-K7s", "QTs-Q8s", "JTs-J8s", "T9s-T7s", "97s+", "86s+", "75s+", "65s", "AJo-ATo", "KQo"],
      Fold: ["*"],
    }),
  },
};

function rankValue(rank: string) {
  return RANKS.indexOf(rank);
}

function splitHand(hand: string) {
  const pair = hand.length === 2;
  return {
    first: hand[0],
    second: hand[1],
    suffix: pair ? "" : hand[2],
    pair,
  };
}

function matchesExact(hand: string, token: string) {
  return hand === token;
}

function matchesPairPlus(hand: string, token: string) {
  if (!token.endsWith("+") || token.length !== 3) return false;
  const base = token.slice(0, 2);
  if (base[0] !== base[1]) return false;
  const target = rankValue(base[0]);
  const current = splitHand(hand);
  return current.pair && rankValue(current.first) >= target;
}

function matchesNonPairPlus(hand: string, token: string) {
  if (!token.endsWith("+")) return false;
  const base = token.slice(0, -1);
  if (base.length !== 3 || base[0] === base[1]) return false;
  const current = splitHand(hand);
  if (current.pair) return false;
  if (current.first !== base[0] || current.suffix !== base[2]) return false;
  return rankValue(current.second) >= rankValue(base[1]) && rankValue(current.second) < rankValue(current.first);
}

function matchesRange(hand: string, token: string) {
  const parts = token.split("-");
  if (parts.length !== 2) return false;
  const [start, end] = parts;
  const current = splitHand(hand);
  const first = splitHand(start);
  const last = splitHand(end);

  if (current.pair && first.pair && last.pair) {
    const currentRank = rankValue(current.first);
    const startRank = rankValue(first.first);
    const endRank = rankValue(last.first);
    return currentRank <= Math.max(startRank, endRank) && currentRank >= Math.min(startRank, endRank);
  }

  if (!current.pair && !first.pair && !last.pair) {
    if (current.first !== first.first || current.first !== last.first) return false;
    if (current.suffix !== first.suffix || current.suffix !== last.suffix) return false;
    const currentRank = rankValue(current.second);
    const startRank = rankValue(first.second);
    const endRank = rankValue(last.second);
    return currentRank <= Math.max(startRank, endRank) && currentRank >= Math.min(startRank, endRank);
  }

  return false;
}

export function matchesRangeToken(hand: string, token: string) {
  const normalized = token.trim();
  if (!normalized) return false;
  if (normalized === "*") return true;
  return (
    matchesExact(hand, normalized) ||
    matchesPairPlus(hand, normalized) ||
    matchesNonPairPlus(hand, normalized) ||
    matchesRange(hand, normalized)
  );
}

export function parseRangeText(value: string) {
  return value
    .split(/[\n,]/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function formatRangeTokens(tokens: string[] | undefined) {
  return (tokens ?? []).join(", ");
}

function isValidRangeToken(token: string) {
  return (
    token === "*" ||
    /^[2-9TJQKA]{2}$/.test(token) ||
    /^[2-9TJQKA]{2}[so]$/.test(token) ||
    /^[2-9TJQKA]{2}\+$/.test(token) ||
    /^[2-9TJQKA]{2}[so]\+$/.test(token) ||
    /^[2-9TJQKA]{2}(-[2-9TJQKA]{2})$/.test(token) ||
    /^[2-9TJQKA]{2}[so]-[2-9TJQKA]{2}[so]$/.test(token)
  );
}

function isValidComboKey(token: string) {
  if (!/^[2-9TJQKA]{2}[so]?$/.test(token)) return false;
  const first = token[0];
  const second = token[1];

  if (first === second) {
    return token.length === 2;
  }

  return token.length === 3 && (token.endsWith("s") || token.endsWith("o"));
}

function isRangeEditorAction(value: unknown): value is RangeEditorAction {
  return value === "raise" || value === "call" || value === "jam" || value === "fold";
}

function normalizeNode(nodeKey: string, input: unknown, sourceLabel: string): PreflopRangeNode | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<PreflopRangeNode> & { actions?: unknown; comboActions?: unknown };
  const rawActions = candidate.actions && typeof candidate.actions === "object" ? candidate.actions : input;
  const actions: Partial<Record<RangeAction, string[]>> = {};
  let comboActions: PreflopRangeNode["comboActions"] | undefined;

  for (const [actionKey, tokens] of Object.entries(rawActions as Record<string, unknown>)) {
    if (!ACTION_SET.has(actionKey as RangeAction)) {
      return null;
    }
    if (!Array.isArray(tokens) || !tokens.every((token) => typeof token === "string" && isValidRangeToken(token))) {
      return null;
    }
    actions[actionKey as RangeAction] = tokens;
  }

  if (Object.keys(actions).length === 0) {
    return null;
  }

  if (candidate.comboActions && typeof candidate.comboActions === "object") {
    const entries = Object.entries(candidate.comboActions as Record<string, unknown>);
    const isValid = entries.every(([combo, action]) => isValidComboKey(combo) && isRangeEditorAction(action));
    if (!isValid) {
      return null;
    }

    comboActions = entries.reduce<NonNullable<PreflopRangeNode["comboActions"]>>((acc, [combo, action]) => {
      acc[combo] = action as RangeEditorAction;
      return acc;
    }, {});
  }

  return {
    nodeKey,
    label: candidate.label ?? nodeKey,
    stackBucket: candidate.stackBucket ?? "10–15bb",
    sourceLabel: candidate.sourceLabel ?? sourceLabel,
    actions,
    comboActions,
  };
}

export function validateRangePack(input: unknown): RangeValidationResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Range file must be a JSON object." };
  }

  const candidate = input as { version?: unknown; sourceLabel?: unknown; nodes?: unknown };
  const rawNodes =
    candidate.nodes && typeof candidate.nodes === "object"
      ? (candidate.nodes as Record<string, unknown>)
      : (input as Record<string, unknown>);

  const sourceLabel =
    typeof candidate.sourceLabel === "string" && candidate.sourceLabel.trim()
      ? candidate.sourceLabel.trim()
      : "Imported Custom Ranges";

  const nodes: Record<string, PreflopRangeNode> = {};
  for (const [nodeKey, rawNode] of Object.entries(rawNodes)) {
    const normalized = normalizeNode(nodeKey, rawNode, sourceLabel);
    if (!normalized) {
      return { ok: false, error: `Invalid range node: ${nodeKey}` };
    }
    nodes[nodeKey] = normalized;
  }

  if (Object.keys(nodes).length === 0) {
    return { ok: false, error: "Range file did not contain any valid nodes." };
  }

  return {
    ok: true,
    pack: {
      version: typeof candidate.version === "string" ? candidate.version : DEFAULT_VERSION,
      sourceLabel,
      nodes,
    },
  };
}

function getNodeSupport(nodeKey: string, usesFallback: boolean): RangeResolution["nodeSupport"] {
  if (usesFallback || nodeKey.includes("multi_call") || nodeKey.includes("limper")) {
    return "weak";
  }
  if (nodeKey.includes("_3bet_") || nodeKey.includes("_4bet_") || nodeKey.includes("jam")) {
    return "medium";
  }
  return "strong";
}

export function getRangeActionForHand(node: PreflopRangeNode, heroCards: string) {
  for (const action of ACTION_PRIORITY) {
    const tokens = node.actions[action];
    if (tokens?.some((token) => matchesRangeToken(heroCards, token))) {
      return action;
    }
  }
  return null;
}

export function getFallbackNodeKeys(seed: DecisionSeed) {
  return seed.fallbackNodeKeys;
}

export function resolveRangeDecision(seed: DecisionSeed, libraryState: RangeLibraryState): RangeResolution | null {
  const lookupKeys = [seed.nodeKey, ...getFallbackNodeKeys(seed)];

  for (const nodeKey of lookupKeys) {
    const customNode = libraryState.activeSource === "built_in" ? null : libraryState.nodes[nodeKey];
    if (customNode) {
      const preferredAction = getRangeActionForHand(customNode, seed.heroCards);
      if (preferredAction) {
        return {
          preferredAction,
          sourceUsed: libraryState.activeSource,
          sourceLabel: libraryState.customLabel ?? customNode.sourceLabel,
          resolvedNodeKey: nodeKey,
          nodeSupport: getNodeSupport(nodeKey, nodeKey !== seed.nodeKey),
          stackBucket: customNode.stackBucket ?? "10–15bb",
          usesFallback: nodeKey !== seed.nodeKey,
        };
      }
      return null;
    }

    const builtInNode = BUILT_IN_RANGE_PACK.nodes[nodeKey];
    if (builtInNode) {
      const preferredAction = getRangeActionForHand(builtInNode, seed.heroCards);
      if (preferredAction) {
        return {
          preferredAction,
          sourceUsed: "built_in",
          sourceLabel: BUILT_IN_RANGE_PACK.sourceLabel,
          resolvedNodeKey: nodeKey,
          nodeSupport: getNodeSupport(nodeKey, nodeKey !== seed.nodeKey),
          stackBucket: builtInNode.stackBucket ?? "10–15bb",
          usesFallback: nodeKey !== seed.nodeKey,
        };
      }
    }
  }

  return null;
}

export function getEffectiveRangeNodes(libraryState: RangeLibraryState) {
  return {
    ...BUILT_IN_RANGE_PACK.nodes,
    ...(libraryState.activeSource === "built_in" ? {} : libraryState.nodes),
  };
}

export function exportRangePack(libraryState: RangeLibraryState): RangePack {
  return {
    version: DEFAULT_VERSION,
    sourceLabel:
      libraryState.activeSource === "built_in"
        ? BUILT_IN_RANGE_PACK.sourceLabel
        : libraryState.customLabel ?? "Custom Ranges",
    nodes: getEffectiveRangeNodes(libraryState),
  };
}
