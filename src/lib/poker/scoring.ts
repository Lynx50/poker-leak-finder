import {
  buildDecisionTrace,
  classifyDecisionResult,
  determineBaselineSourceType,
  determineFacedAction,
  determinePreflopFamily,
  getConfidenceBundle,
  mapDecisionToPresentation,
} from "./preflop-engine";
import { resolveRangeDecision } from "./ranges";
import { DecisionSeed, RangeLibraryState, SupportedDecision } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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

  const preflopFamily = determinePreflopFamily(seed);
  const facedAction = determineFacedAction(seed, preflopFamily);
  const baselineSourceType = determineBaselineSourceType(seed, resolution);
  const confidenceBundle = getConfidenceBundle(seed, preflopFamily, baselineSourceType, resolution);
  const judged = classifyDecisionResult(
    seed,
    preflopFamily,
    baselineSourceType,
    confidenceBundle.confidence,
    resolution,
  );

  const scoredSeed: DecisionSeed = {
    ...seed,
    preferredAction: resolution.preferredAction,
  };

  const presentation = mapDecisionToPresentation(
    scoredSeed,
    preflopFamily,
    judged.result,
    confidenceBundle.confidence,
    resolution.preferredAction,
  );

  const severityScore = getSeverityScore(scoredSeed, presentation.mistakeType);
  const priorityScore = getPriorityScore(scoredSeed, presentation.mistakeType, severityScore, resolution.nodeSupport);
  const decisionTrace = buildDecisionTrace(
    scoredSeed,
    preflopFamily,
    facedAction,
    baselineSourceType,
    confidenceBundle.confidenceScore,
    confidenceBundle.confidence,
    judged.result,
    presentation.leakLabel,
    resolution.resolvedNodeKey,
    [...confidenceBundle.reasonCodes, ...judged.reasonCodes],
    judged.jamTrace,
  );

  return {
    ...scoredSeed,
    leakLabel: presentation.leakLabel,
    severity: getSeverityLabel(severityScore),
    severityScore,
    priority: getPriorityLabel(priorityScore),
    priorityScore,
    mistakeType: presentation.mistakeType,
    nodeSupport: resolution.nodeSupport,
    confidenceTier:
      confidenceBundle.confidence === "high"
        ? "clean"
        : "lower_confidence",
    stackBucket: seed.stackBucket,
    comparedNodeKey: resolution.resolvedNodeKey,
    comparedStackBucket: resolution.stackBucket,
    usesFallback: resolution.usesFallback,
    isMistake: presentation.isMistake,
    rangeSourceUsed: resolution.sourceUsed,
    rangeLabelUsed: resolution.sourceLabel,
    jamType: seed.jamType,
    facingPosition: seed.facingPosition,
    jamClassificationConfidence: judged.jamTrace?.confidence,
    jamTrace: judged.jamTrace,
    decisionTrace,
  };
}
