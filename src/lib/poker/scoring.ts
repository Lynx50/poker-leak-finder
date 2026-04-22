import { resolveRangeDecision } from "./ranges";
import { DecisionSeed, RangeLibraryState, SupportedDecision } from "./types";

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

function getMistakeType(seed: DecisionSeed): SupportedDecision["mistakeType"] {
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
  const scoredSeed = {
    ...seed,
    preferredAction,
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
    usesFallback,
    isMistake: mistakeType !== "on_plan",
    rangeSourceUsed: resolution.sourceUsed,
    rangeLabelUsed: resolution.sourceLabel,
  };
}
