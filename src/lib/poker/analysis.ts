import { classifyPreflopOpportunity, scorePreflopOpportunity } from "./classifier";
import { getDecisionOpportunityActions } from "./grading";
import { parseHand, splitHandHistories } from "./parser";
import { AnalysisReport, ExcludedDecision, PreflopOpportunity, RangeLibraryState, SkippedHandLog, SkipReason, SupportedDecision } from "./types";

const SKIP_REASON_ORDER: SkipReason[] = [
  "NOT_SRP",
  "MULTIWAY",
  "THREE_BET_POT",
  "LIMPED_POT",
  "HERO_NOT_INVOLVED",
  "WALK",
  "PARSER_ERROR",
];

function getSkipReason(decision: ExcludedDecision): SkipReason {
  if (decision.reason === "bad_parse" || decision.reason === "unknown_position") return "PARSER_ERROR";
  if (decision.reason === "no_hero_action") {
    return /walk|collected|doesn't show hand|does not show hand/i.test(decision.handText) ? "WALK" : "HERO_NOT_INVOLVED";
  }
  if (decision.reason === "unsupported_multiway_branch") return "MULTIWAY";
  if (decision.reason === "too_many_raises" || decision.reason === "unsupported_jam_branch") return "THREE_BET_POT";

  const nodeKey = decision.nodeKey ?? "";
  const message = decision.message;
  if (/limper|limp/i.test(nodeKey) || /limper|limp/i.test(message)) return "LIMPED_POT";
  if (/multi_call|open_call|caller|multiway/i.test(nodeKey) || /caller|multiway/i.test(message)) return "MULTIWAY";
  if (/3bet|4bet|3-bet|4-bet|three-bet|four-bet/i.test(nodeKey) || /3-bet|4-bet|three-bet|four-bet/i.test(message)) {
    return "THREE_BET_POT";
  }

  return "NOT_SRP";
}

function toSkippedHandLog(decision: ExcludedDecision): SkippedHandLog {
  return {
    handId: decision.handId,
    reason: getSkipReason(decision),
    message: decision.message,
    nodeKey: decision.nodeKey,
  };
}

export function analyzeHandHistories(
  input: string,
  libraryState: RangeLibraryState,
  invalidRangeMessage: string | null = null,
): AnalysisReport {
  const rawHands = splitHandHistories(input);
  const opportunities: PreflopOpportunity[] = [];
  const supported: SupportedDecision[] = [];
  const excluded: ExcludedDecision[] = [];
  const skippedHands: SkippedHandLog[] = [];
  let parsedHands = 0;

  for (const rawHand of rawHands) {
    const parsed = parseHand(rawHand);
    if (!parsed) {
      const excludedDecision: ExcludedDecision = {
        handId: "unknown",
        reason: "bad_parse",
        message: "Could not parse hero cards or table metadata.",
        handText: rawHand,
      };
      excluded.push(excludedDecision);
      skippedHands.push(toSkippedHandLog(excludedDecision));
      continue;
    }

    parsedHands += 1;
    const opportunity = classifyPreflopOpportunity(parsed);

    if ("reason" in opportunity) {
      excluded.push(opportunity);
      skippedHands.push(toSkippedHandLog(opportunity));
      continue;
    }

    opportunities.push(opportunity);
    const scoredResult = scorePreflopOpportunity(opportunity, libraryState);

    if ("reason" in scoredResult) {
      excluded.push(scoredResult);
      skippedHands.push(toSkippedHandLog(scoredResult));
    } else {
      supported.push(scoredResult);
    }
  }

  const classifiedHands = opportunities.length;
  const scoredHands = supported.length;
  const eligiblePreflopSpots = opportunities.length;
  const unsupportedSpots = Math.max(eligiblePreflopSpots - scoredHands, 0);
  const modelCoveragePercent = eligiblePreflopSpots > 0 ? (scoredHands / eligiblePreflopSpots) * 100 : 0;
  const coveragePercent = modelCoveragePercent;
  const exclusionCounts = excluded.reduce<Record<string, number>>((acc, decision) => {
    acc[decision.reason] = (acc[decision.reason] ?? 0) + 1;
    return acc;
  }, {});
  const skipCounts = skippedHands.reduce<Record<SkipReason, number>>((acc, hand) => {
    acc[hand.reason] = (acc[hand.reason] ?? 0) + 1;
    return acc;
  }, {} as Record<SkipReason, number>);
  const leakWeightedSeverity = supported.reduce<Record<string, { weightedSeverity: number; count: number }>>(
    (acc, decision) => {
      const entry = acc[decision.leakLabel] ?? { weightedSeverity: 0, count: 0 };
      entry.weightedSeverity += decision.severityScore;
      entry.count += 1;
      acc[decision.leakLabel] = entry;
      return acc;
    },
    {},
  );
  const nodeWeightedSeverity = supported.reduce<
    Record<string, { weightedSeverity: number; count: number; nodeSupport: "strong" | "medium" | "weak" }>
  >((acc, decision) => {
    const entry = acc[decision.nodeKey] ?? {
      weightedSeverity: 0,
      count: 0,
      nodeSupport: decision.nodeSupport,
    };
    entry.weightedSeverity += decision.severityScore;
    entry.count += 1;
    acc[decision.nodeKey] = entry;
    return acc;
  }, {});
  const positionWeightedSeverity = supported.reduce<Record<string, { weightedSeverity: number; count: number }>>(
    (acc, decision) => {
      const entry = acc[decision.heroPosition] ?? { weightedSeverity: 0, count: 0 };
      entry.weightedSeverity += decision.severityScore;
      entry.count += 1;
      acc[decision.heroPosition] = entry;
      return acc;
    },
    {},
  );
  const mistakeTypeSeverity = supported.reduce<Record<string, { weightedSeverity: number; count: number }>>(
    (acc, decision) => {
      const entry = acc[decision.mistakeType] ?? { weightedSeverity: 0, count: 0 };
      entry.weightedSeverity += decision.severityScore;
      entry.count += 1;
      acc[decision.mistakeType] = entry;
      return acc;
    },
    {},
  );
  const weakSupportNodes = supported.reduce<Record<string, number>>((acc, decision) => {
    if (decision.nodeSupport === "weak") {
      acc[decision.nodeKey] = (acc[decision.nodeKey] ?? 0) + 1;
    }
    return acc;
  }, {});
  const fallbackNodes = supported.reduce<Record<string, number>>((acc, decision) => {
    if (decision.usesFallback) {
      acc[decision.nodeKey] = (acc[decision.nodeKey] ?? 0) + 1;
    }
    return acc;
  }, {});
  const overriddenNodes = supported.reduce<Record<string, number>>((acc, decision) => {
    if (decision.rangeSourceUsed !== "built_in") {
      acc[decision.nodeKey] = (acc[decision.nodeKey] ?? 0) + 1;
    }
    return acc;
  }, {});
  const missingRangeNodes = excluded.reduce<Record<string, number>>((acc, decision) => {
    if (decision.reason === "unsupported_node" && decision.nodeKey) {
      acc[decision.nodeKey] = (acc[decision.nodeKey] ?? 0) + 1;
    }
    return acc;
  }, {});

  return {
    opportunities,
    supported,
    excluded,
    skippedHands,
    totalHands: rawHands.length,
    parsedHands,
    eligiblePreflopSpots,
    unsupportedSpots,
    classifiedHands,
    scoredHands,
    coveragePercent,
    modelCoveragePercent,
    topExclusionCategories: Object.entries(exclusionCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({
        reason: reason as ExcludedDecision["reason"],
        count,
        percentage: excluded.length > 0 ? (count / excluded.length) * 100 : 0,
      }))
      .slice(0, 5),
    skipReasonBreakdown: SKIP_REASON_ORDER.map((reason) => ({
      reason,
      count: skipCounts[reason] ?? 0,
    })),
    decisionOpportunitiesByAction: getDecisionOpportunityActions(opportunities),
    topLeaksByWeightedSeverity: Object.entries(leakWeightedSeverity)
      .sort((a, b) => b[1].weightedSeverity - a[1].weightedSeverity || b[1].count - a[1].count)
      .map(([label, value]) => ({
        label,
        weightedSeverity: value.weightedSeverity,
        count: value.count,
      }))
      .slice(0, 5),
    topLeaksByFrequency: Object.entries(leakWeightedSeverity)
      .sort((a, b) => b[1].count - a[1].count || b[1].weightedSeverity - a[1].weightedSeverity)
      .map(([label, value]) => ({
        label,
        count: value.count,
      }))
      .slice(0, 5),
    topMistakeTypes: Object.entries(mistakeTypeSeverity)
      .sort((a, b) => b[1].weightedSeverity - a[1].weightedSeverity || b[1].count - a[1].count)
      .map(([type, value]) => ({
        type: type as AnalysisReport["topMistakeTypes"][number]["type"],
        weightedSeverity: value.weightedSeverity,
        count: value.count,
      }))
      .slice(0, 5),
    topNodesByWeightedSeverity: Object.entries(nodeWeightedSeverity)
      .sort((a, b) => b[1].weightedSeverity - a[1].weightedSeverity || b[1].count - a[1].count)
      .map(([nodeKey, value]) => ({
        nodeKey,
        weightedSeverity: value.weightedSeverity,
        count: value.count,
        nodeSupport: value.nodeSupport,
      }))
      .slice(0, 5),
    topPositionsByWeightedSeverity: Object.entries(positionWeightedSeverity)
      .sort((a, b) => b[1].weightedSeverity - a[1].weightedSeverity || b[1].count - a[1].count)
      .map(([position, value]) => ({
        position: position as AnalysisReport["topPositionsByWeightedSeverity"][number]["position"],
        weightedSeverity: value.weightedSeverity,
        count: value.count,
      }))
      .slice(0, 5),
    weakSupportNodes: Object.entries(weakSupportNodes)
      .sort((a, b) => b[1] - a[1])
      .map(([nodeKey, count]) => ({ nodeKey, count }))
      .slice(0, 5),
    fallbackNodes: Object.entries(fallbackNodes)
      .sort((a, b) => b[1] - a[1])
      .map(([nodeKey, count]) => ({ nodeKey, count }))
      .slice(0, 5),
    activeRangeSource: libraryState.activeSource,
    activeRangeLabel:
      libraryState.activeSource === "built_in"
        ? "Tournament Baseline"
        : libraryState.customLabel ?? "Custom Ranges",
    overriddenNodes: Object.entries(overriddenNodes)
      .sort((a, b) => b[1] - a[1])
      .map(([nodeKey, count]) => ({ nodeKey, count }))
      .slice(0, 5),
    missingRangeNodes: Object.entries(missingRangeNodes)
      .sort((a, b) => b[1] - a[1])
      .map(([nodeKey, count]) => ({ nodeKey, count }))
      .slice(0, 5),
    invalidRangeMessage,
  };
}
