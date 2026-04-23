import {
  BaselineSourceType,
  ClassificationResult,
  DecisionSeed,
  JamDecisionTrace,
  PreflopDecisionTrace,
  PreflopFamily,
  RangeResolution,
  ReasonCode,
  SupportedDecision,
} from "./types";

function hasKnownPosition(position: DecisionSeed["heroPosition"] | DecisionSeed["facingPosition"]) {
  return Boolean(position && position !== "UNKNOWN");
}

function hasTrustedStackBucket(seed: DecisionSeed, resolution: RangeResolution | null) {
  return Boolean(resolution?.stackBucket && resolution.stackBucket === seed.stackBucket);
}

export function determinePreflopFamily(seed: DecisionSeed): PreflopFamily {
  switch (seed.jamType) {
    case "openJam":
      return "open_jam";
    case "reshoveVsOpen":
      return "reshove_vs_open";
    case "jamVsLimp":
      return seed.heroPosition === "BB" && seed.facingPosition === "SB" ? "blind_vs_blind_vs_limp" : "jam_vs_limp";
    case "blindVsBlindJam":
      return seed.family === "unopened" ? "blind_vs_blind_unopened" : "blind_vs_blind_vs_open";
    case "jamVs3bet":
      return seed.family === "facing_4bet" ? "facing_4bet" : "facing_3bet";
  }

  if (seed.family === "unopened") {
    return seed.heroPosition === "SB" ? "blind_vs_blind_unopened" : "unopened_rfi";
  }

  if (seed.family === "blind_defense" && seed.facingPosition === "SB") {
    return "blind_vs_blind_vs_open";
  }

  if (seed.family === "facing_open" || seed.family === "squeeze" || seed.family === "blind_defense") {
    return "facing_open_call_or_3bet";
  }

  if (seed.family === "facing_3bet") {
    return "facing_3bet";
  }

  if (seed.family === "facing_4bet") {
    return "facing_4bet";
  }

  return "unsupported_preflop_spot";
}

export function determineFacedAction(seed: DecisionSeed, family: PreflopFamily) {
  switch (family) {
    case "unopened_rfi":
    case "blind_vs_blind_unopened":
    case "open_jam":
      return "unopened";
    case "jam_vs_limp":
    case "blind_vs_blind_vs_limp":
      return "limp";
    case "facing_open_call_or_3bet":
    case "reshove_vs_open":
    case "blind_vs_blind_vs_open":
      return "open";
    case "facing_3bet":
      return "3bet";
    case "facing_4bet":
      return "4bet";
    default:
      return seed.branchSummary;
  }
}

export function determineBaselineSourceType(seed: DecisionSeed, resolution: RangeResolution | null): BaselineSourceType {
  if (!resolution) return "unsupported";
  if (!hasTrustedStackBucket(seed, resolution)) return "weak_fallback";
  if (!resolution.usesFallback) return "exact";
  if (seed.jamType) return "weak_fallback";
  if (
    resolution.resolvedNodeKey === "unopened_default_decision" ||
    resolution.resolvedNodeKey === "facing_open_default_decision" ||
    resolution.resolvedNodeKey === "blind_defense_default_decision" ||
    resolution.resolvedNodeKey === "facing_3bet_default_decision" ||
    resolution.resolvedNodeKey === "facing_4bet_default_decision" ||
    resolution.resolvedNodeKey === "squeeze_default_decision"
  ) {
    return "near_fallback";
  }
  return "weak_fallback";
}

export function getConfidenceBundle(
  seed: DecisionSeed,
  family: PreflopFamily,
  baselineSourceType: BaselineSourceType,
  resolution: RangeResolution | null,
): {
  confidenceScore: number;
  confidence: "high" | "medium" | "low";
  reasonCodes: ReasonCode[];
  baselineSourceType: BaselineSourceType;
  resolution: RangeResolution | null;
} {
  const reasonCodes: ReasonCode[] = [];
  let confidenceScore = 0;

  if (family !== "unsupported_preflop_spot") {
    confidenceScore += 0.2;
    reasonCodes.push("family_confident");
  } else {
    reasonCodes.push("unsupported_spot");
  }

  if (hasKnownPosition(seed.heroPosition)) {
    confidenceScore += 0.2;
    reasonCodes.push("position_confident");
  }

  const villainRelevant =
    family === "facing_open_call_or_3bet" ||
    family === "reshove_vs_open" ||
    family === "blind_vs_blind_vs_limp" ||
    family === "blind_vs_blind_vs_open" ||
    family === "facing_3bet" ||
    family === "facing_4bet";
  if (!villainRelevant || hasKnownPosition(seed.facingPosition)) {
    confidenceScore += 0.15;
    if (villainRelevant) reasonCodes.push("villain_position_confident");
  }

  if (seed.effectiveStackInBlinds > 0) {
    confidenceScore += 0.2;
    reasonCodes.push("stack_confident");
  }

  if (!hasTrustedStackBucket(seed, resolution)) {
    reasonCodes.push("stack_bucket_mismatch");
  }

  switch (baselineSourceType) {
    case "exact":
      confidenceScore += 0.25;
      reasonCodes.push("exact_node_match");
      break;
    case "near_fallback":
      confidenceScore += 0.12;
      reasonCodes.push("near_stack_fallback");
      break;
    case "weak_fallback":
      reasonCodes.push("weak_fallback");
      break;
    case "unsupported":
      reasonCodes.push("unsupported_spot");
      break;
  }

  if (seed.jamType) {
    reasonCodes.push("jam_family_known");
    if (baselineSourceType === "weak_fallback" || baselineSourceType === "unsupported") {
      reasonCodes.push("no_trusted_jam_baseline");
    }
  }

  if (determineFacedAction(seed, family) !== seed.branchSummary) {
    reasonCodes.push("facing_action_known");
  }

  const confidence =
    confidenceScore >= 0.8 ? "high" : confidenceScore >= 0.55 ? "medium" : "low";

  return {
    confidenceScore: Number(confidenceScore.toFixed(2)),
    confidence,
    reasonCodes,
    baselineSourceType,
    resolution,
  };
}

function buildJamDecisionTrace(
  seed: DecisionSeed,
  baselineSourceType: BaselineSourceType,
  confidence: "high" | "medium" | "low",
  resolution: RangeResolution | null,
): JamDecisionTrace | undefined {
  if (!seed.jamType) return undefined;

  let result: JamDecisionTrace["result"] = "borderlineOrUnsupported";
  const premiumGuard =
    seed.jamType === "reshoveVsOpen" &&
    seed.effectiveStackInBlinds <= 10 &&
    ["AA", "KK", "QQ", "JJ", "AKs", "AKo"].includes(seed.heroCards);

  if (resolution && confidence === "high") {
    if (resolution.preferredAction === "Jam") {
      result = "clearJam";
    } else if (resolution.preferredAction === "Fold" || resolution.preferredAction === "Call" || resolution.preferredAction === "Continue") {
      result = premiumGuard && baselineSourceType !== "exact" ? "borderlineOrUnsupported" : "clearNonJam";
    }
  }

  return {
    jamFamily: seed.jamType,
    heroPos: seed.heroPosition,
    villainPos: seed.facingPosition,
    effectiveBb: seed.effectiveStackInBlinds,
    bucket: seed.stackBucket,
    baselineNode: resolution?.resolvedNodeKey ?? "unsupported",
    baselineSource: resolution?.sourceLabel ?? "unsupported",
    confidence,
    result,
  };
}

export function classifyDecisionResult(
  seed: DecisionSeed,
  family: PreflopFamily,
  baselineSourceType: BaselineSourceType,
  confidence: "high" | "medium" | "low",
  resolution: RangeResolution | null,
): { result: ClassificationResult; reasonCodes: ReasonCode[]; jamTrace?: JamDecisionTrace } {
  const reasonCodes: ReasonCode[] = [];
  const jamTrace = buildJamDecisionTrace(seed, baselineSourceType, confidence, resolution);

  if (family === "unsupported_preflop_spot" || baselineSourceType === "unsupported" || !resolution) {
    reasonCodes.push("unsupported_spot");
    return { result: "unsupported", reasonCodes, jamTrace };
  }

  if (jamTrace) {
    if (jamTrace.result === "clearJam" && seed.actualAction === "Jam") {
      return { result: "clear_good", reasonCodes, jamTrace };
    }

    if (jamTrace.result === "clearJam" && seed.actualAction !== "Jam") {
      return { result: confidence === "high" ? "clear_bad" : "mixed_or_borderline", reasonCodes, jamTrace };
    }

    if (jamTrace.result === "clearNonJam" && seed.actualAction === "Jam") {
      return { result: confidence === "high" ? "clear_bad" : "mixed_or_borderline", reasonCodes, jamTrace };
    }

    if (jamTrace.result === "borderlineOrUnsupported") {
      reasonCodes.push(seed.jamType === "reshoveVsOpen" ? "premium_sanity_guard" : "mixed_frequency_spot");
      return { result: "mixed_or_borderline", reasonCodes, jamTrace };
    }

    return { result: "clear_good", reasonCodes, jamTrace };
  }

  if (resolution.preferredAction === seed.actualAction) {
    return { result: "clear_good", reasonCodes };
  }

  if (resolution.preferredAction === "Raise" && seed.actualAction === "Jam") {
    reasonCodes.push("mixed_frequency_spot");
    return { result: "mixed_or_borderline", reasonCodes };
  }

  if (baselineSourceType === "weak_fallback" || confidence === "low") {
    reasonCodes.push("mixed_frequency_spot");
    return { result: "mixed_or_borderline", reasonCodes };
  }

  return { result: "clear_bad", reasonCodes };
}

export function mapDecisionToPresentation(
  seed: DecisionSeed,
  family: PreflopFamily,
  classificationResult: ClassificationResult,
  confidence: "high" | "medium" | "low",
  preferredAction: string,
): Pick<SupportedDecision, "mistakeType" | "leakLabel" | "isMistake"> {
  const isJamFamily =
    seed.jamType === "openJam" ||
    seed.jamType === "reshoveVsOpen" ||
    seed.jamType === "jamVsLimp" ||
    seed.jamType === "blindVsBlindJam" ||
    seed.jamType === "jamVs3bet";

  if (classificationResult !== "clear_bad" || confidence !== "high") {
    return {
      mistakeType: "on_plan",
      leakLabel:
        classificationResult === "unsupported"
          ? "Unsupported"
          : classificationResult === "mixed_or_borderline"
            ? "Borderline"
            : "On Plan",
      isMistake: false,
    };
  }

  if (isJamFamily) {
    if (seed.actualAction === "Jam") {
      return { mistakeType: "over_jam", leakLabel: "Jammed Too Wide", isMistake: true };
    }
    return { mistakeType: "under_jam", leakLabel: "Passed on Jam", isMistake: true };
  }

  if (family === "unopened_rfi" || family === "blind_vs_blind_unopened") {
    if (seed.actualAction === "Fold") {
      return { mistakeType: "overfold", leakLabel: "Folded Too Much", isMistake: true };
    }
    if (seed.actualAction === "Raise") {
      return { mistakeType: "spewy", leakLabel: "Opened Too Wide", isMistake: true };
    }
  }

  if (family === "facing_open_call_or_3bet" || family === "blind_vs_blind_vs_limp" || family === "blind_vs_blind_vs_open") {
    if (seed.actualAction === "Fold" && preferredAction === "Call") {
      return { mistakeType: "overfold", leakLabel: "Folded Too Much", isMistake: true };
    }
    if (seed.actualAction === "Call" && preferredAction === "Fold") {
      return { mistakeType: "overcall", leakLabel: "Called Too Wide", isMistake: true };
    }
    if ((seed.actualAction === "Call" || seed.actualAction === "Fold") && preferredAction === "Raise") {
      return { mistakeType: "under_3bet", leakLabel: "Passed on 3-Bet", isMistake: true };
    }
    if ((seed.actualAction === "Raise" || seed.actualAction === "Jam") && preferredAction === "Fold") {
      return { mistakeType: "spewy", leakLabel: "3-Bet Too Wide", isMistake: true };
    }
  }

  if (family === "facing_3bet") {
    if (seed.actualAction === "Fold" && (preferredAction === "Call" || preferredAction === "Continue")) {
      return { mistakeType: "overfold", leakLabel: "Folded Too Much", isMistake: true };
    }
    if (seed.actualAction === "Call" && preferredAction === "Fold") {
      return { mistakeType: "overcall", leakLabel: "Called Too Wide", isMistake: true };
    }
  }

  return { mistakeType: "line_mismatch", leakLabel: "Line Mismatch", isMistake: true };
}

export function buildDecisionTrace(
  seed: DecisionSeed,
  family: PreflopFamily,
  facedAction: string,
  baselineSourceType: BaselineSourceType,
  confidenceScore: number,
  confidence: "high" | "medium" | "low",
  classificationResult: ClassificationResult,
  userFacingLabel: string | undefined,
  baselineNodeId: string | undefined,
  reasonCodes: ReasonCode[],
  jamTrace?: JamDecisionTrace,
): PreflopDecisionTrace {
  return {
    handId: seed.handId,
    preflopFamily: family,
    heroPosition: seed.heroPosition,
    villainPosition: seed.facingPosition,
    facedAction,
    actorStackBb: seed.heroStackInBlinds,
    effectiveStackBb: seed.effectiveStackInBlinds,
    stackBucket: seed.stackBucket,
    baselineNodeId,
    baselineSourceType,
    confidenceScore,
    confidence,
    classificationResult,
    userFacingLabel,
    reasonCodes,
    jamTrace,
  };
}
