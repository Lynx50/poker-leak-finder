import { getHandTier } from "./cards";
import { buildPositionMap } from "./parser";
import { scoreDecision } from "./scoring";
import { getStackDepthBucket } from "./stack-depth";
import {
  DebugReason,
  DecisionSeed,
  ExcludedDecision,
  HandTier,
  ParsedAction,
  ParsedHand,
  Position,
  PreflopOpportunity,
  RangeLibraryState,
  SupportedDecision,
} from "./types";

const SHORT_STACK_RESHOVE_BB = 25;
const STACK_COMMIT_RATIO = 0.8;

type RaiseEvent = {
  player: string;
  position: Position;
  toAmount: number;
  isJam: boolean;
  isShortStackJam: boolean;
  stack: number;
  stackInBlinds: number;
};

type ClassificationContext = {
  heroAction: ParsedAction;
  heroActionIndex: number;
  priorRaises: RaiseEvent[];
  priorCallers: ParsedAction[];
  priorLimpers: ParsedAction[];
  heroStack: number;
  heroStackInBlinds: number;
  relevantOpponentStackChips: number[];
  effectiveStackChips: number;
  effectiveStackInBlinds: number;
  heroTier: HandTier;
  facingAmount: number;
  openRaise?: RaiseEvent;
  threeBet?: RaiseEvent;
  fourBet?: RaiseEvent;
};

function normalizeAction(action: ParsedAction, facingAmount: number) {
  if (action.type === "raise") {
    return action.isAllIn ? "Jam" : "Raise";
  }

  if (action.type === "call") {
    return facingAmount > 0 ? "Call" : "Limp";
  }

  if (action.type === "fold") {
    return "Fold";
  }

  if (action.type === "check") {
    return "Check";
  }

  return action.type;
}

function toNodeLabel(position: Position) {
  return position === "UNKNOWN" ? "UNK" : position;
}

function findHeroAction(hand: ParsedHand) {
  return hand.preflopActions.findIndex(
    (action) =>
      action.player === hand.heroName &&
      !["post_sb", "post_bb", "post_ante"].includes(action.type),
  );
}

function getPlayerStack(hand: ParsedHand, player: string) {
  return hand.seats.find((seat) => seat.name === player)?.stack ?? 0;
}

function toBlindCount(amount: number, bigBlindAmount: number | null) {
  const bb = bigBlindAmount ?? 0;
  if (!bb) return 0;
  return amount / bb;
}

function getEffectiveStackDetails(hand: ParsedHand, heroStack: number, priorActions: ParsedAction[]) {
  const priorPlayers = new Set(
    priorActions
      .filter((action) => action.player !== hand.heroName && !["post_sb", "post_bb", "post_ante"].includes(action.type))
      .map((action) => action.player),
  );
  const candidateStacks = hand.seats
    .filter((seat) => seat.name !== hand.heroName && (priorPlayers.size === 0 || priorPlayers.has(seat.name)))
    .map((seat) => seat.stack)
    .filter((stack) => stack > 0);
  const relevantOpponentStacks =
    candidateStacks.length > 0
      ? candidateStacks
      : hand.seats
          .filter((seat) => seat.name !== hand.heroName)
          .map((seat) => seat.stack)
          .filter((stack) => stack > 0);

  if (relevantOpponentStacks.length === 0) {
    return {
      relevantOpponentStackChips: [],
      effectiveStackChips: heroStack,
      effectiveStackInBlinds: toBlindCount(heroStack, hand.bigBlindAmount),
    };
  }

  const effectiveStackChips = Math.min(heroStack, Math.max(...relevantOpponentStacks));
  return {
    relevantOpponentStackChips: relevantOpponentStacks,
    effectiveStackChips,
    effectiveStackInBlinds: toBlindCount(effectiveStackChips, hand.bigBlindAmount),
  };
}

function buildRaiseEvent(hand: ParsedHand, action: ParsedAction, position: Position): RaiseEvent | null {
  if (!action.toAmount) {
    return null;
  }

  const stack = getPlayerStack(hand, action.player);
  const stackInBlinds = toBlindCount(stack, hand.bigBlindAmount);
  const impliedJam = stack > 0 && action.toAmount >= stack * STACK_COMMIT_RATIO;
  const isJam = Boolean(action.isAllIn || impliedJam);

  return {
    player: action.player,
    position,
    toAmount: action.toAmount,
    isJam,
    isShortStackJam: isJam && stackInBlinds > 0 && stackInBlinds <= SHORT_STACK_RESHOVE_BB,
    stack,
    stackInBlinds,
  };
}

function buildClassificationContext(hand: ParsedHand) {
  const heroActionIndex = findHeroAction(hand);
  if (heroActionIndex === -1) {
    return null;
  }

  const heroAction = hand.preflopActions[heroActionIndex];
  const priorActions = hand.preflopActions.slice(0, heroActionIndex);
  const positionMap = buildPositionMap(hand.seats, hand.buttonSeat);
  let currentBet = hand.bigBlindAmount ?? 0;

  const priorRaises: RaiseEvent[] = [];
  const priorCallers: ParsedAction[] = [];
  const priorLimpers: ParsedAction[] = [];

  for (const action of priorActions) {
    if (action.type === "raise") {
      const raiseEvent = buildRaiseEvent(hand, action, positionMap.get(action.player) ?? "UNKNOWN");
      if (raiseEvent) {
        currentBet = raiseEvent.toAmount;
        priorRaises.push(raiseEvent);
      }
      continue;
    }

    if (action.type === "call") {
      if (currentBet <= (hand.bigBlindAmount ?? 0)) {
        priorLimpers.push(action);
      } else {
        priorCallers.push(action);
      }
    }
  }

  const heroStack = getPlayerStack(hand, hand.heroName);
  const heroStackInBlinds = toBlindCount(heroStack, hand.bigBlindAmount);
  const effectiveStack = getEffectiveStackDetails(hand, heroStack, priorActions);

  return {
    heroAction,
    heroActionIndex,
    priorRaises,
    priorCallers,
    priorLimpers,
    heroStack,
    heroStackInBlinds,
    relevantOpponentStackChips: effectiveStack.relevantOpponentStackChips,
    effectiveStackChips: effectiveStack.effectiveStackChips,
    effectiveStackInBlinds: effectiveStack.effectiveStackInBlinds,
    heroTier: getHandTier(hand.heroCards),
    facingAmount: currentBet,
    openRaise: priorRaises[0],
    threeBet: priorRaises[1],
    fourBet: priorRaises[2],
  } satisfies ClassificationContext;
}

function buildOpportunity(
  hand: ParsedHand,
  context: ClassificationContext,
  nodeKey: string,
  fallbackNodeKeys: string[],
  branchSummary: string,
  family: PreflopOpportunity["family"],
  extraFallbackNodeKeys: string[] = [],
): PreflopOpportunity {
  const actualAction = normalizeAction(context.heroAction, context.facingAmount);
  return {
    handId: hand.id,
    nodeKey,
    fallbackNodeKeys: [...fallbackNodeKeys, ...extraFallbackNodeKeys],
    tournamentType: undefined,
    family,
    heroCards: hand.heroCards.shorthand,
    heroPosition: hand.heroPosition,
    handTier: context.heroTier,
    heroStackChips: context.heroStack,
    heroStackInBlinds: context.heroStackInBlinds,
    relevantOpponentStackChips: context.relevantOpponentStackChips,
    effectiveStackChips: context.effectiveStackChips,
    bigBlindAmount: hand.bigBlindAmount,
    effectiveStackInBlinds: context.effectiveStackInBlinds,
    stackBucket: getStackDepthBucket(context.effectiveStackInBlinds),
    actualAction,
    handText: hand.raw,
    contextSummary: `${hand.heroPosition} holding ${hand.heroCards.shorthand}`,
    branchSummary,
  };
}

export function scorePreflopOpportunity(
  opportunity: PreflopOpportunity,
  libraryState: RangeLibraryState,
): SupportedDecision | ExcludedDecision {
  const seed: DecisionSeed = {
    handId: opportunity.handId,
    nodeKey: opportunity.nodeKey,
    fallbackNodeKeys: opportunity.fallbackNodeKeys,
    family: opportunity.family,
    heroCards: opportunity.heroCards,
    heroPosition: opportunity.heroPosition,
    handTier: opportunity.handTier,
    heroStackInBlinds: opportunity.heroStackInBlinds,
    effectiveStackInBlinds: opportunity.effectiveStackInBlinds,
    stackBucket: opportunity.stackBucket,
    actualAction: opportunity.actualAction,
    preferredAction: "Fold",
    handText: opportunity.handText,
    contextSummary: opportunity.contextSummary,
    branchSummary: opportunity.branchSummary,
  };
  const scoredDecision = scoreDecision(seed, libraryState);
  if (!scoredDecision) {
    return {
      handId: opportunity.handId,
      reason: "unsupported_node",
      message: `No valid explicit range found for ${opportunity.nodeKey}.`,
      handText: opportunity.handText,
      nodeKey: opportunity.nodeKey,
    };
  }
  return {
    ...scoredDecision,
    tournamentType: opportunity.tournamentType,
  };
}

function exclude(hand: ParsedHand, reason: DebugReason, message: string, nodeKey?: string): ExcludedDecision {
  return {
    handId: hand.id,
    reason,
    message,
    handText: hand.raw,
    nodeKey,
  };
}

export function classifyPreflopOpportunity(hand: ParsedHand): PreflopOpportunity | ExcludedDecision {
  const context = buildClassificationContext(hand);
  if (!context) {
    return exclude(hand, "no_hero_action", "No hero preflop action detected.");
  }

  if (hand.heroPosition === "UNKNOWN") {
    return exclude(hand, "unknown_position", "Could not resolve hero position.");
  }

  if (context.priorRaises.length > 3) {
    return exclude(hand, "too_many_raises", "More than four betting levels before hero.");
  }

  const opener = context.openRaise;
  const threeBet = context.threeBet;
  const fourBet = context.fourBet;

  if (context.priorRaises.length === 0) {
    if (context.priorLimpers.length > 0) {
      const nodeKey = `${context.priorLimpers.length}_limper_${toNodeLabel(hand.heroPosition)}_decision`;
      const fallbackNodeKeys = ["unopened_default_decision"];
      return buildOpportunity(
        hand,
        context,
        nodeKey,
        fallbackNodeKeys,
        `Unopened pot with ${context.priorLimpers.length} limper${context.priorLimpers.length === 1 ? "" : "s"}`,
        "unopened",
      );
    }

    const nodeKey = `${toNodeLabel(hand.heroPosition)}_unopened_decision`;
    return buildOpportunity(
      hand,
      context,
      nodeKey,
      ["unopened_default_decision"],
      "Unopened spot",
      "unopened",
    );
  }

  if (context.priorRaises.length === 1) {
    if (!opener) {
      return exclude(hand, "unsupported_node", "Could not resolve the opening raise.");
    }

    if (context.priorCallers.length > 0) {
      const callerLabel =
        context.priorCallers.length === 1 ? "call" : `multi_call_${context.priorCallers.length}`;
      const nodeKey = `${toNodeLabel(opener.position)}_open_${callerLabel}_${toNodeLabel(hand.heroPosition)}_decision`;
      const family =
        hand.heroPosition === "SB" || hand.heroPosition === "BB" ? "blind_defense" : "squeeze";
      return buildOpportunity(
        hand,
        context,
        nodeKey,
        family === "blind_defense" ? ["blind_defense_default_decision", "squeeze_default_decision"] : ["squeeze_default_decision"],
        `Facing ${toNodeLabel(opener.position)} open plus ${context.priorCallers.length} caller${context.priorCallers.length === 1 ? "" : "s"}`,
        family,
      );
    }

    const nodeKey = `${toNodeLabel(opener.position)}_open_${toNodeLabel(hand.heroPosition)}_decision`;
    const family = hand.heroPosition === "SB" || hand.heroPosition === "BB" ? "blind_defense" : "facing_open";
    const branchSummary =
      opener.isJam || opener.isShortStackJam
        ? `Facing ${toNodeLabel(opener.position)} short-stack jam`
        : `Facing ${toNodeLabel(opener.position)} open`;

    return buildOpportunity(
      hand,
      context,
      nodeKey,
      family === "blind_defense" ? ["blind_defense_default_decision", "facing_open_default_decision"] : ["facing_open_default_decision"],
      branchSummary,
      family,
    );
  }

  if (context.priorRaises.length === 2) {
    if (!opener || !threeBet) {
      return exclude(hand, "unsupported_node", "Could not resolve the 3-bet branch.");
    }

    if (context.priorCallers.length > 0) {
      const callerLabel =
        context.priorCallers.length === 1 ? "call" : `multi_call_${context.priorCallers.length}`;
      const nodeKey = `${toNodeLabel(opener.position)}_open_${callerLabel}_${toNodeLabel(threeBet.position)}_3bet_${toNodeLabel(hand.heroPosition)}_decision`;
      const branchSummary = threeBet.isJam || threeBet.isShortStackJam
        ? `Facing a 3-bet jam with ${context.priorCallers.length} caller${context.priorCallers.length === 1 ? "" : "s"}`
        : `Facing a 3-bet with ${context.priorCallers.length} caller${context.priorCallers.length === 1 ? "" : "s"}`;

      return buildOpportunity(
        hand,
        context,
        nodeKey,
        ["facing_3bet_default_decision"],
        branchSummary,
        "facing_3bet",
      );
    }

    const nodeKey = `${toNodeLabel(opener.position)}_open_${toNodeLabel(threeBet.position)}_3bet_${toNodeLabel(hand.heroPosition)}_decision`;
    const branchSummary =
      threeBet.isJam || threeBet.isShortStackJam ? "Facing a 3-bet jam" : "Facing a 3-bet";

    return buildOpportunity(
      hand,
      context,
      nodeKey,
      ["facing_3bet_default_decision"],
      branchSummary,
      "facing_3bet",
    );
  }

  if (context.priorRaises.length === 3) {
    if (!opener || !threeBet || !fourBet) {
      return exclude(hand, "unsupported_node", "Could not resolve the 4-bet branch.");
    }

    if (context.priorCallers.length > 0) {
      const callerLabel =
        context.priorCallers.length === 1 ? "call" : `multi_call_${context.priorCallers.length}`;
      const nodeKey = `${toNodeLabel(opener.position)}_open_${callerLabel}_${toNodeLabel(threeBet.position)}_4bet_${toNodeLabel(hand.heroPosition)}_decision`;
      const branchSummary = fourBet.isJam || fourBet.isShortStackJam
        ? `Facing a 4-bet jam with ${context.priorCallers.length} caller${context.priorCallers.length === 1 ? "" : "s"}`
        : `Facing a 4-bet with ${context.priorCallers.length} caller${context.priorCallers.length === 1 ? "" : "s"}`;

      return buildOpportunity(
        hand,
        context,
        nodeKey,
        ["facing_4bet_default_decision"],
        branchSummary,
        "facing_4bet",
      );
    }

    const nodeKey = `${toNodeLabel(opener.position)}_open_${toNodeLabel(threeBet.position)}_4bet_${toNodeLabel(hand.heroPosition)}_decision`;
    const branchSummary =
      fourBet.isJam || fourBet.isShortStackJam ? "Facing a 4-bet jam" : "Facing a 4-bet";

    return buildOpportunity(
      hand,
      context,
      nodeKey,
      ["facing_4bet_default_decision"],
      branchSummary,
      "facing_4bet",
    );
  }

  return exclude(hand, "unsupported_node", "Preflop branch is not yet covered by the classifier.");
}

export function classifyPreflopDecision(hand: ParsedHand, libraryState: RangeLibraryState): SupportedDecision | ExcludedDecision {
  const opportunity = classifyPreflopOpportunity(hand);
  if ("reason" in opportunity) {
    return opportunity;
  }

  return scorePreflopOpportunity(opportunity, libraryState);
}
