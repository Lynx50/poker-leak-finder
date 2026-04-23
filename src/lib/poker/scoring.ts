import { resolveRangeDecision } from "./ranges";
import { DecisionSeed, JamDecisionTrace, RangeLibraryState, SupportedDecision } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function matchesPreferredAction(actualAction: string, preferredAction: string) {
  if (actualAction === preferredAction) return true;
  if (preferredAction === "Continue") {
    return ["Call", "Raise", "Jam"].includes(actualAction);
  }
  if (preferredAction === "Raise" && actualAction === "Jam") {
    return true;
  }
  return false;
}

function isJamDecision(seed: Pick<DecisionSeed, "actualAction" | "preferredAction">) {
  return seed.actualAction === "Jam" || seed.preferredAction === "Jam";
}

function getJamClassificationConfidence(
  seed: Pick<DecisionSeed, "jamType" | "heroPosition" | "facingPosition" | "effectiveStackInBlinds">,
  resolution: {
    usesFallback: boolean;
    resolvedNodeKey: string;
    nodeSupport: SupportedDecision["nodeSupport"];
  },
): NonNullable<SupportedDecision["jamClassificationConfidence"]> {
  const hasReliableStack = seed.effectiveStackInBlinds > 0;
  const hasHeroPosition = seed.heroPosition !== "UNKNOWN";
  const hasJamType = Boolean(seed.jamType);
  const hasFacingPosition =
    seed.jamType === "openJam" || seed.jamType === "jamVsLimp"
      ? true
      : Boolean(seed.facingPosition && seed.facingPosition !== "UNKNOWN");

  if (!hasReliableStack || !hasHeroPosition || !hasJamType || !hasFacingPosition) {
    return "low";
  }

  if (!resolution.usesFallback && resolution.nodeSupport !== "weak") {
    return "high";
  }

  if (
    resolution.usesFallback &&
    resolution.resolvedNodeKey === "facing_open_default_decision" &&
    seed.jamType === "reshoveVsOpen" &&
    seed.effectiveStackInBlinds <= 10
  ) {
    return "medium";
  }

  return "low";
}

function buildJamDecisionTrace(
  seed: Pick<DecisionSeed, "jamType" | "heroPosition" | "facingPosition" | "effectiveStackInBlinds" | "stackBucket" | "heroCards">,
  resolution: {
    usesFallback: boolean;
    resolvedNodeKey: string;
    nodeSupport: SupportedDecision["nodeSupport"];
    sourceLabel: string;
  },
  preferredAction: string,
): JamDecisionTrace | undefined {
  if (!seed.jamType) return undefined;

  const confidence = getJamClassificationConfidence(seed, resolution);
  let result: JamDecisionTrace["result"] = "borderlineOrUnsupported";

  const premiumShortStackReshoveGuard =
    seed.jamType === "reshoveVsOpen" &&
    seed.effectiveStackInBlinds <= 10 &&
    ["AA", "KK", "QQ"].includes(seed.heroCards);

  if (confidence === "high") {
    if (preferredAction === "Jam") {
      result = "clearJam";
    } else if (preferredAction === "Fold" || preferredAction === "Call" || preferredAction === "Continue") {
      result = premiumShortStackReshoveGuard && resolution.usesFallback
        ? "borderlineOrUnsupported"
        : "clearNonJam";
    } else {
      result = "borderlineOrUnsupported";
    }
  }

  return {
    jamFamily: seed.jamType,
    heroPos: seed.heroPosition,
    villainPos: seed.facingPosition,
    effectiveBb: seed.effectiveStackInBlinds,
    bucket: seed.stackBucket,
    baselineNode: resolution.resolvedNodeKey,
    baselineSource: resolution.sourceLabel,
    confidence,
    result,
  };
}

function getMistakeType(seed: DecisionSeed & { jamTrace?: JamDecisionTrace }): SupportedDecision["mistakeType"] {
  if (seed.jamTrace) {
    if (seed.jamTrace.result === "clearJam") {
      return seed.actualAction === "Jam" ? "on_plan" : "under_jam";
    }

    if (seed.jamTrace.result === "clearNonJam") {
      return seed.actualAction === "Jam" ? "over_jam" : "on_plan";
    }

    if (seed.actualAction === "Jam" || seed.preferredAction === "Jam") {
      return "on_plan";
    }
  }

  if (matchesPreferredAction(seed.actualAction, seed.preferredAction)) {
    return "on_plan";
  }

  if (seed.preferredAction === "Jam" && seed.actualAction !== "Jam") {
    return "under_jam";
  }

  if (seed.actualAction === "Jam" && !["Jam", "Raise", "Continue"].includes(seed.preferredAction)) {
    return "over_jam";
  }

  if (seed.actualAction === "Fold" && ["Call", "Raise", "Continue"].includes(seed.preferredAction)) {
    return "overfold";
  }

  if (seed.actualAction === "Call" && seed.preferredAction === "Fold") {
    return "overcall";
  }

  if (seed.actualAction === "Call" && seed.preferredAction === "Raise") {
    return "under_3bet";
  }

  if (seed.actualAction === "Call" && seed.preferredAction === "Jam") {
    return "under_jam";
  }

  if (["Raise", "Jam"].includes(seed.actualAction) && seed.preferredAction === "Fold") {
    return "spewy";
  }

  if (seed.actualAction === "Raise" && seed.preferredAction === "Call") {
    return "passive";
  }

  return "line_mismatch";
}

function getLeakLabel(seed: DecisionSeed, mistakeType: SupportedDecision["mistakeType"]) {
  switch (mistakeType) {
    case "on_plan":
      return "On Plan";
    case "overfold":
      return "Overfold";
    case "overcall":
      return "Overcall";
    case "under_3bet":
      return "Under-3Bet";
    case "over_jam":
      return "Over-Jam";
    case "under_jam":
      return "Under-Jam";
    case "passive":
      return "Passive";
    case "spewy":
      return "Spewy";
    default:
      return `Line Mismatch: ${seed.actualAction} vs ${seed.preferredAction}`;
  }
}

function getSeverityScore(seed: DecisionSeed, mistakeType: SupportedDecision["mistakeType"]) {
  switch (mistakeType) {
    case "on_plan":
      return 0;
    case "under_jam":
    case "over_jam":
      return 3;
    case "overfold":
      if (seed.handTier === "premium" || seed.preferredAction === "Jam") return 3;
      if (seed.family === "blind_defense") return 2;
      return 2;
    case "overcall":
      return seed.family === "facing_3bet" || seed.family === "facing_4bet" ? 3 : 2;
    case "under_3bet":
      return seed.handTier === "premium" || seed.handTier === "strong" ? 2 : 1;
    case "spewy":
      return seed.actualAction === "Jam" ? 3 : 2;
    case "passive":
    case "line_mismatch":
      return 1;
  }
}

function getSeverityLabel(score: number): SupportedDecision["severity"] {
  if (score >= 3) return "High";
  if (score === 2) return "Medium";
  return "Low";
}

function getPriorityScore(
  seed: DecisionSeed,
  mistakeType: SupportedDecision["mistakeType"],
  severityScore: number,
  nodeSupport: SupportedDecision["nodeSupport"],
) {
  if (mistakeType === "on_plan") {
    return 0;
  }

  let score = severityScore;

  if (mistakeType === "under_jam" || mistakeType === "over_jam") {
    score += 1;
  }

  if (mistakeType === "overfold" && seed.family === "blind_defense") {
    score += 1;
  }

  if (mistakeType === "overcall" && (seed.family === "facing_3bet" || seed.family === "facing_4bet")) {
    score += 1;
  }

  if (seed.handTier === "premium" && ["overfold", "under_jam"].includes(mistakeType)) {
    score += 1;
  }

  if (nodeSupport === "weak") {
    score -= 1;
  }

  return clamp(score, 0, 3);
}

function getPriorityLabel(score: number): SupportedDecision["priority"] {
  if (score >= 3) return "High";
  if (score === 2) return "Medium";
  return "Low";
}

export function scoreDecision(seed: DecisionSeed, libraryState: RangeLibraryState): SupportedDecision | null {
  const resolution = resolveRangeDecision(seed, libraryState);
  if (!resolution) {
    return null;
  }

  const preferredAction = resolution.preferredAction;
  const nodeSupport = resolution.nodeSupport;
  const usesFallback = resolution.usesFallback;
  const jamClassificationConfidence = isJamDecision(seed)
    ? getJamClassificationConfidence(seed, resolution)
    : undefined;
  const jamTrace = isJamDecision(seed)
    ? buildJamDecisionTrace(seed, resolution, preferredAction)
    : undefined;
  const scoredSeed = {
    ...seed,
    preferredAction,
    jamTrace,
  };
  const mistakeType = getMistakeType(scoredSeed);
  const severityScore = getSeverityScore(scoredSeed, mistakeType);
  const priorityScore = getPriorityScore(scoredSeed, mistakeType, severityScore, nodeSupport);

  return {
    ...scoredSeed,
    leakLabel: getLeakLabel(scoredSeed, mistakeType),
    severity: getSeverityLabel(severityScore),
    severityScore,
    priority: getPriorityLabel(priorityScore),
    priorityScore,
    mistakeType,
    nodeSupport,
    confidenceTier: nodeSupport === "weak" || usesFallback ? "lower_confidence" : "clean",
    stackBucket: seed.stackBucket,
    comparedNodeKey: resolution.resolvedNodeKey,
    comparedStackBucket: resolution.stackBucket,
    usesFallback,
    isMistake: mistakeType !== "on_plan",
    rangeSourceUsed: resolution.sourceUsed,
    rangeLabelUsed: resolution.sourceLabel,
    jamType: seed.jamType,
    facingPosition: seed.facingPosition,
    jamClassificationConfidence,
    jamTrace,
  };
}
