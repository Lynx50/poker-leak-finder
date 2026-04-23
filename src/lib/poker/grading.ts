import {
  BaselineFrequencyAdjustment,
  DashboardGradeSummary,
  GradeCard,
  GradeLetter,
  GradingEligibility,
  GradingActionFamily,
  LeakBucket,
  LeakHandRecord,
  Position,
  PreflopOpportunity,
  SupportedDecision,
  TournamentFormatFilter,
  TournamentType,
} from "./types";
import { STACK_DEPTH_BUCKETS } from "./stack-depth";

export const POSITION_ORDER: Position[] = ["UTG", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
export const ACTION_FAMILY_ORDER: GradingActionFamily[] = ["RFI", "Call", "3-bet", "Fold", "Jam"];

export const TOURNAMENT_TYPE_OPTIONS: { value: TournamentType; label: string }[] = [
  { value: "standard_mtt", label: "Standard MTT" },
  { value: "pko", label: "PKO / Knockout" },
  { value: "mystery_bounty", label: "Mystery Bounty" },
];

export const TOURNAMENT_FORMAT_FILTER_OPTIONS: { value: TournamentFormatFilter; label: string }[] = [
  { value: "all_tournaments", label: "All Tournaments" },
  ...TOURNAMENT_TYPE_OPTIONS,
];

export const DEFAULT_ROLLING_WINDOW_CONFIG = {
  recentHandLimit: 800,
  minStableSample: 150,
  minProvisionalSample: 8,
};

type RollingWindowConfig = typeof DEFAULT_ROLLING_WINDOW_CONFIG;

type BaselineFrequencyAdjustments = Record<string, BaselineFrequencyAdjustment>;

export type EligibleDecision = SupportedDecision & {
  gradingEligibility: GradingEligibility;
};

export type GradingEligibilitySummary = {
  totalDecisions: number;
  scoredDecisions: number;
  visibleUnscoredDecisions: number;
  scored: SupportedDecision[];
  visibleUnscored: EligibleDecision[];
  reasonCounts: {
    reason: string;
    count: number;
  }[];
};

const BOUNTY_BASELINE_PENDING_MESSAGE =
  "Visible for volume and frequency tracking, but excluded from grade scoring because a format-specific bounty baseline is not available yet.";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getPositionLabel(position: string) {
  return position;
}

export function getActionFamilyLabel(action: GradingActionFamily) {
  return action;
}

export function getTournamentTypeLabel(type: TournamentFormatFilter) {
  return TOURNAMENT_FORMAT_FILTER_OPTIONS.find((option) => option.value === type)?.label ?? "All Tournaments";
}

function isBountyFormat(type: TournamentType) {
  return type === "pko" || type === "mystery_bounty";
}

export function getGradingEligibility(
  decision: SupportedDecision,
  tournamentType: TournamentType,
): GradingEligibility {
  if (!isBountyFormat(tournamentType)) {
    return { status: "scored" };
  }

  return {
    status: "visible_unscored",
    reason:
      tournamentType === "mystery_bounty"
        ? "mystery_bounty_active_stage"
        : decision.heroStackInBlinds > 0 && decision.heroStackInBlinds <= 25
          ? "bounty_short_stack_spot"
          : "bounty_all_in_spot",
    message: BOUNTY_BASELINE_PENDING_MESSAGE,
  };
}

export function classifyDecisionsForGrading(
  decisions: SupportedDecision[],
  tournamentFormatFilter: TournamentFormatFilter,
): GradingEligibilitySummary {
  const filteredDecisions =
    tournamentFormatFilter === "all_tournaments"
      ? decisions
      : decisions.filter((decision) => (decision.tournamentType ?? "standard_mtt") === tournamentFormatFilter);

  const visibleDecisions = filteredDecisions.map<EligibleDecision>((decision) => {
    const decisionTournamentType = decision.tournamentType ?? "standard_mtt";
    return {
      ...decision,
      gradingEligibility: getGradingEligibility(decision, decisionTournamentType),
    };
  });

  const scored = visibleDecisions
    .filter((decision) => decision.gradingEligibility.status === "scored")
    .map(({ gradingEligibility: _gradingEligibility, ...decision }) => decision);
  const visibleUnscored = visibleDecisions.filter(
    (decision) => decision.gradingEligibility.status === "visible_unscored",
  );
  const reasonCounts = Object.entries(
    visibleUnscored.reduce<Record<string, number>>((acc, decision) => {
      const reason = decision.gradingEligibility.reason ?? "unknown";
      acc[reason] = (acc[reason] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalDecisions: decisions.length,
    scoredDecisions: scored.length,
    visibleUnscoredDecisions: visibleUnscored.length,
    scored,
    visibleUnscored,
    reasonCounts,
  };
}

function toGrade(score: number): GradeLetter {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 60) return "D";
  if (score >= 50) return "E";
  return "F";
}

function capProvisionalGrade(grade: GradeLetter): GradeLetter {
  const order: GradeLetter[] = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "E", "F"];
  return order.indexOf(grade) < order.indexOf("B") ? "B" : grade;
}

type OpportunityLike = Pick<
  PreflopOpportunity,
  "actualAction" | "family" | "branchSummary" | "heroPosition" | "stackBucket" | "nodeKey" | "tournamentType"
> &
  Partial<Pick<SupportedDecision, "preferredAction" | "mistakeType">>;

export function getGradingActionFamily(decision: OpportunityLike): GradingActionFamily {
  if (decision.actualAction === "Jam" || decision.preferredAction === "Jam") return "Jam";
  if (decision.family === "unopened") return "RFI";
  if (decision.actualAction === "Raise" || decision.preferredAction === "Raise") return "3-bet";
  if (decision.actualAction === "Call" || decision.preferredAction === "Call") return "Call";
  return "Fold";
}

export function isActionOpportunity(decision: OpportunityLike, action: GradingActionFamily) {
  switch (action) {
    case "RFI":
      return decision.family === "unopened";
    case "Call":
      return decision.family !== "unopened";
    case "3-bet":
      return decision.family === "facing_open" || decision.family === "blind_defense" || decision.family === "squeeze";
    case "Jam":
      return (
        decision.actualAction === "Jam" ||
        decision.preferredAction === "Jam" ||
        decision.mistakeType === "under_jam" ||
        decision.mistakeType === "over_jam" ||
        decision.branchSummary.toLowerCase().includes("jam")
      );
    case "Fold":
      return true;
  }
}

export function getDecisionOpportunityActions(decisions: OpportunityLike[]) {
  return ACTION_FAMILY_ORDER.map((action) => ({
    action,
    count: decisions.filter((entry) => isActionOpportunity(entry, action)).length,
  }));
}

function actionMatchesFamily(action: string, family: GradingActionFamily) {
  if (family === "Fold") return action === "Fold";
  if (family === "RFI" || family === "3-bet") return action === "Raise" || action === "Jam";
  return action === family;
}

function getActionTakenLabel(action: GradingActionFamily) {
  switch (action) {
    case "RFI":
      return "Opened";
    case "Call":
      return "Called";
    case "3-bet":
      return "3-bet taken";
    case "Jam":
      return "Jammed";
    case "Fold":
      return "Folded";
  }
}

function getPrimaryPositionFrequencyFamily(position: Position): GradingActionFamily {
  return "RFI";
}

function getActionFrequency(
  opportunities: PreflopOpportunity[],
  scoredDecisions: SupportedDecision[],
  action?: GradingActionFamily,
  baselineAdjustment?: BaselineFrequencyAdjustment,
): GradeCard["actionFrequency"] {
  if (!action || opportunities.length === 0) return undefined;

  const takenCount = opportunities.filter((decision) => actionMatchesFamily(decision.actualAction, action)).length;
  const foldedCount = opportunities.filter((decision) => decision.actualAction === "Fold").length;
  const baselineCount =
    scoredDecisions.length > 0
      ? scoredDecisions.filter((decision) => actionMatchesFamily(decision.preferredAction, action)).length
      : null;
  const actualPercent = takenCount / opportunities.length;
  const baselinePercent =
    baselineAdjustment?.baselinePercent ?? (baselineCount !== null ? baselineCount / scoredDecisions.length : null);

  return {
    action,
    actionTakenLabel: getActionTakenLabel(action),
    actualPercent,
    baselinePercent,
    differencePercent: baselinePercent !== null ? actualPercent - baselinePercent : null,
    opportunities: opportunities.length,
    takenCount,
    foldedCount,
    otherCount: opportunities.length - takenCount - foldedCount,
    baselineCount,
  };
}

const DIRECTIONAL_LEAK_LABELS: Record<GradingActionFamily, { tightLabel: string; wideLabel: string }> = {
  RFI: { tightLabel: "Folded Too Tight", wideLabel: "Opened Too Wide" },
  Call: { tightLabel: "Folded Too Tight", wideLabel: "Called Too Wide" },
  "3-bet": { tightLabel: "Passed on 3-Bets", wideLabel: "3-Bet Too Wide" },
  Fold: { tightLabel: "Overfolded", wideLabel: "Defended Too Wide" },
  Jam: { tightLabel: "Passed on Jams", wideLabel: "Jammed Too Wide" },
};

function isHighConfidenceDirectionalDecision(decision: SupportedDecision) {
  return (
    decision.confidenceTier === "clean" &&
    decision.nodeSupport === "strong" &&
    !decision.usesFallback
  );
}

function isRaiseLike(action: string) {
  return action === "Raise" || action === "Jam";
}

function isDefendLike(action: string) {
  return action !== "Fold";
}

function toLeakHandRecord(decision: SupportedDecision, actionFamily: GradingActionFamily): LeakHandRecord {
  return {
    handId: decision.handId,
    heroCards: decision.heroCards,
    heroCardsRaw: decision.heroCardsRaw,
    displayContext: `${decision.heroPosition} ${actionFamily}`,
    branch: decision.nodeKey,
    action: decision.actualAction,
    actorPosition: decision.heroPosition,
    stackBucket: decision.stackBucket,
    effectiveStackInBlinds: decision.effectiveStackInBlinds,
    actorStackInBlinds: decision.heroStackInBlinds,
    actionSummary: decision.branchSummary,
    rawHand: decision.handText,
    heroPosition: decision.heroPosition,
    preferredAction: decision.preferredAction,
    leakLabel: decision.leakLabel,
  };
}

function makeLeakBucket(
  key: string,
  label: string,
  decisions: SupportedDecision[],
  predicate: (decision: SupportedDecision) => boolean,
  actionFamily: GradingActionFamily,
): LeakBucket {
  const matched = decisions.filter(predicate);
  return {
    key,
    label,
    supported: true,
    count: matched.length,
    hands: matched.map((decision) => toLeakHandRecord(decision, actionFamily)),
  };
}

function getDirectionalLeakBuckets(action: GradingActionFamily, decisions: SupportedDecision[]) {
  switch (action) {
    case "RFI":
      return {
        tightBucket: makeLeakBucket(
          "folded_too_tight",
          "Folded Too Tight",
          decisions,
          (decision) => decision.family === "unopened" && decision.actualAction === "Fold" && isRaiseLike(decision.preferredAction),
          action,
        ),
        wideBucket: makeLeakBucket(
          "opened_too_wide",
          "Opened Too Wide",
          decisions,
          (decision) => decision.family === "unopened" && isRaiseLike(decision.actualAction) && decision.preferredAction === "Fold",
          action,
        ),
      };
    case "Call":
      return {
        tightBucket: makeLeakBucket(
          "folded_too_tight",
          "Folded Too Tight",
          decisions,
          (decision) => decision.actualAction === "Fold" && decision.preferredAction === "Call",
          action,
        ),
        wideBucket: makeLeakBucket(
          "called_too_wide",
          "Called Too Wide",
          decisions,
          (decision) => decision.actualAction === "Call" && decision.preferredAction === "Fold",
          action,
        ),
      };
    case "3-bet":
      return {
        tightBucket: makeLeakBucket(
          "passed_on_3bets",
          "Passed on 3-Bets",
          decisions,
          (decision) => !isRaiseLike(decision.actualAction) && isRaiseLike(decision.preferredAction),
          action,
        ),
        wideBucket: makeLeakBucket(
          "three_bet_too_wide",
          "3-Bet Too Wide",
          decisions,
          (decision) => isRaiseLike(decision.actualAction) && !isRaiseLike(decision.preferredAction),
          action,
        ),
      };
    case "Fold":
      return {
        tightBucket: makeLeakBucket(
          "overfolded",
          "Overfolded",
          decisions,
          (decision) => decision.actualAction === "Fold" && isDefendLike(decision.preferredAction),
          action,
        ),
        wideBucket: makeLeakBucket(
          "defended_too_wide",
          "Defended Too Wide",
          decisions,
          (decision) => isDefendLike(decision.actualAction) && decision.preferredAction === "Fold",
          action,
        ),
      };
    case "Jam":
      return {
        tightBucket: makeLeakBucket(
          "passed_on_jams",
          "Passed on Jams",
          decisions,
          (decision) => decision.actualAction !== "Jam" && decision.preferredAction === "Jam",
          action,
        ),
        wideBucket: makeLeakBucket(
          "jammed_too_wide",
          "Jammed Too Wide",
          decisions,
          (decision) => decision.actualAction === "Jam" && decision.preferredAction !== "Jam",
          action,
        ),
      };
  }
}

function getDirectionalLeakSummary(
  action: GradingActionFamily | undefined,
  scoredDecisions: SupportedDecision[],
): GradeCard["directionalLeakSummary"] {
  if (!action) return undefined;

  const labels = DIRECTIONAL_LEAK_LABELS[action];
  const highConfidenceDecisions = scoredDecisions.filter(isHighConfidenceDirectionalDecision);
  const { tightBucket, wideBucket } = getDirectionalLeakBuckets(action, highConfidenceDecisions);
  const tightCount = tightBucket.count;
  const wideCount = wideBucket.count;

  return {
    ...labels,
    tightCount,
    wideCount,
    tightBucket,
    wideBucket,
    tendency:
      tightCount > wideCount
        ? "Too Tight"
        : wideCount > tightCount
          ? "Too Loose"
          : "Balanced",
  };
}

function formatFrequencyPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function buildStudyHint(
  label: string,
  decisions: SupportedDecision[],
  opportunities: PreflopOpportunity[],
  score: number | null,
  actionFrequency?: GradeCard["actionFrequency"],
) {
  if (opportunities.length === 0) return "No recent opportunities yet.";
  if (decisions.length === 0) return `${label}: ${opportunities.length} opportunities found, but none are scoreable by the current baseline model yet.`;

  if (actionFrequency?.differencePercent !== null && actionFrequency?.differencePercent !== undefined) {
    const direction = actionFrequency.differencePercent < 0 ? "under-taking" : "over-taking";
    const delta = formatFrequencyPercent(Math.abs(actionFrequency.differencePercent));
    return `${label}: ${direction} ${actionFrequency.action} by ${delta} versus baseline (${formatFrequencyPercent(actionFrequency.actualPercent)} vs ${formatFrequencyPercent(actionFrequency.baselinePercent ?? 0)}).`;
  }

  const leaks = decisions.reduce<Record<string, { count: number; severity: number }>>((acc, decision) => {
    if (!decision.isMistake) return acc;
    const entry = acc[decision.leakLabel] ?? { count: 0, severity: 0 };
    entry.count += 1;
    entry.severity += decision.severityScore;
    acc[decision.leakLabel] = entry;
    return acc;
  }, {});

  const topLeak = Object.entries(leaks).sort(
    (a, b) => b[1].severity - a[1].severity || b[1].count - a[1].count,
  )[0];

  if (!topLeak) return `${label} is clean in the recent sample. Keep monitoring as volume grows.`;
  if (score !== null && score >= 85) return `${label}: mostly solid, but review ${topLeak[0]} spots next.`;
  return `${label}: study ${topLeak[0]} first. It is the largest recent drag on this grade.`;
}

function gradeDecisions(
  label: string,
  key: string,
  scoredDecisions: SupportedDecision[],
  opportunities: PreflopOpportunity[],
  config: RollingWindowConfig,
  actionFrequencyFamily?: GradingActionFamily,
  baselineAdjustment?: BaselineFrequencyAdjustment,
  actionFrequencyOpportunities: PreflopOpportunity[] = opportunities,
  actionFrequencyScoredDecisions: SupportedDecision[] = scoredDecisions,
): GradeCard {
  const scoredCount = scoredDecisions.length;
  const opportunityCount = opportunities.length;
  const sampleSize = scoredCount;
  const mistakeCount = scoredDecisions.filter((decision) => decision.isMistake).length;
  const weightedSeverity = scoredDecisions.reduce((total, decision) => total + decision.severityScore, 0);
  const mistakeRate = scoredCount > 0 ? mistakeCount / scoredCount : 0;
  const severityRate = scoredCount > 0 ? weightedSeverity / (scoredCount * 3) : 0;
  const confidence = clamp(scoredCount / config.minStableSample, 0, 1);
  const actionFrequency = getActionFrequency(
    actionFrequencyOpportunities,
    actionFrequencyScoredDecisions,
    actionFrequencyFamily,
    baselineAdjustment,
  );
  const directionalLeakSummary = getDirectionalLeakSummary(actionFrequencyFamily, scoredDecisions);

  if (scoredCount < config.minProvisionalSample) {
    return {
      key,
      label,
      grade: "N/A",
      status: "not_enough_data",
      score: null,
      opportunityCount,
      scoredCount,
      sampleSize,
      mistakeCount,
      mistakeRate,
      weightedSeverity,
      confidence,
      studyHint: buildStudyHint(label, scoredDecisions, opportunities, null, actionFrequency),
      actionFrequency,
      directionalLeakSummary,
    };
  }

  const frequencyPenalty =
    actionFrequency?.baselinePercent !== null && actionFrequency?.baselinePercent !== undefined
      ? Math.min(Math.abs(actionFrequency.actualPercent - actionFrequency.baselinePercent) * 120, 20)
      : 0;
  const rawScore = clamp(100 - mistakeRate * 45 - severityRate * 55 - frequencyPenalty, 0, 100);
  const status = scoredCount >= config.minStableSample ? "stable" : "provisional";
  const grade = status === "provisional" ? capProvisionalGrade(toGrade(rawScore)) : toGrade(rawScore);

  return {
    key,
    label,
    grade,
    status,
    score: Math.round(rawScore),
    opportunityCount,
    scoredCount,
    sampleSize,
    mistakeCount,
    mistakeRate,
    weightedSeverity,
    confidence,
    studyHint: buildStudyHint(label, scoredDecisions, opportunities, rawScore, actionFrequency),
    actionFrequency,
    directionalLeakSummary,
  };
}

function groupGrade(
  scoredDecisions: SupportedDecision[],
  opportunities: PreflopOpportunity[],
  entries: {
    key: string;
    label: string;
    predicate: (decision: OpportunityLike) => boolean;
    actionFrequencyFamily?: GradingActionFamily;
    actionFrequencyPredicate?: (decision: OpportunityLike) => boolean;
  }[],
  config: RollingWindowConfig,
  baselineAdjustments: BaselineFrequencyAdjustments = {},
) {
  return entries.map((entry) => {
    const scoredForGrade = scoredDecisions.filter(entry.predicate);
    const opportunitiesForGrade = opportunities.filter(entry.predicate);
    const frequencyPredicate = entry.actionFrequencyPredicate ?? entry.predicate;

    return gradeDecisions(
      entry.label,
      entry.key,
      scoredForGrade,
      opportunitiesForGrade,
      config,
      entry.actionFrequencyFamily,
      baselineAdjustments[entry.key],
      opportunities.filter(frequencyPredicate),
      scoredDecisions.filter(frequencyPredicate),
    );
  });
}

function getBiggestLeaks(decisions: SupportedDecision[]) {
  return Object.entries(
    decisions.reduce<Record<string, { count: number; weightedSeverity: number }>>((acc, decision) => {
      if (!decision.isMistake) return acc;
      const label = `${getPositionLabel(decision.heroPosition)} ${getGradingActionFamily(decision)} ${decision.stackBucket}: ${decision.leakLabel}`;
      const entry = acc[label] ?? { count: 0, weightedSeverity: 0 };
      entry.count += 1;
      entry.weightedSeverity += decision.severityScore;
      acc[label] = entry;
      return acc;
    }, {}),
  )
    .map(([label, value]) => ({ label, ...value }))
    .sort((a, b) => b.weightedSeverity - a.weightedSeverity || b.count - a.count)
    .slice(0, 5);
}

function getBestAreas(cards: GradeCard[]) {
  return cards
    .filter((card) => card.status !== "not_enough_data" && card.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.scoredCount - a.scoredCount)
    .slice(0, 3);
}

function getStudyRecommendation(cards: GradeCard[]): DashboardGradeSummary["studyRecommendation"] {
  const candidates = cards
    .filter((card) => card.status !== "not_enough_data" && card.score !== null)
    .sort((a, b) => {
      const aPriority = (100 - (a.score ?? 100)) + a.weightedSeverity * 4 + a.confidence * 8;
      const bPriority = (100 - (b.score ?? 100)) + b.weightedSeverity * 4 + b.confidence * 8;
      return bPriority - aPriority;
    });

  const grade = candidates[0];
  if (!grade) return null;
  const frequencyReason = grade.actionFrequency
    ? `${grade.actionFrequency.action} frequency is ${formatFrequencyPercent(grade.actionFrequency.actualPercent)} vs ${formatFrequencyPercent(grade.actionFrequency.baselinePercent ?? 0)} baseline. `
    : "";

  return {
    label: `Study ${grade.label} first`,
    reason: `${grade.grade} over ${grade.scoredCount} scored spots from ${grade.opportunityCount} opportunities with ${grade.mistakeCount} mistakes. ${frequencyReason}${grade.studyHint}`,
    grade,
  };
}

export function buildDashboardGradeSummary(
  decisions: SupportedDecision[],
  opportunities: PreflopOpportunity[],
  tournamentFormatFilter: TournamentFormatFilter,
  config: RollingWindowConfig = DEFAULT_ROLLING_WINDOW_CONFIG,
  baselineAdjustments: BaselineFrequencyAdjustments = {},
): DashboardGradeSummary {
  const filteredDecisions =
    tournamentFormatFilter === "all_tournaments"
      ? decisions
      : decisions.filter((decision) => (decision.tournamentType ?? "standard_mtt") === tournamentFormatFilter);
  const activeDecisions = filteredDecisions.slice(-config.recentHandLimit);
  const filteredOpportunities =
    tournamentFormatFilter === "all_tournaments"
      ? opportunities
      : opportunities.filter((opportunity) => (opportunity.tournamentType ?? "standard_mtt") === tournamentFormatFilter);

  const positions = groupGrade(
    activeDecisions,
    filteredOpportunities,
    POSITION_ORDER.map((position) => ({
      key: position,
      label: getPositionLabel(position),
      predicate: (decision) => decision.heroPosition === position && isActionOpportunity(decision, "RFI"),
      actionFrequencyFamily: getPrimaryPositionFrequencyFamily(position),
      actionFrequencyPredicate: (decision) =>
        decision.heroPosition === position && isActionOpportunity(decision, getPrimaryPositionFrequencyFamily(position)),
    })),
    config,
    baselineAdjustments,
  );

  const actionFamilies = groupGrade(
    activeDecisions,
    filteredOpportunities,
    ACTION_FAMILY_ORDER.map((family) => ({
      key: family,
      label: getActionFamilyLabel(family),
      predicate: (decision) => isActionOpportunity(decision, family),
      actionFrequencyFamily: family,
    })),
    config,
    baselineAdjustments,
  );

  const byPositionAction = POSITION_ORDER.reduce<Record<string, GradeCard[]>>((acc, position) => {
    acc[position] = groupGrade(
      activeDecisions.filter((decision) => decision.heroPosition === position),
      filteredOpportunities.filter((decision) => decision.heroPosition === position),
      ACTION_FAMILY_ORDER.map((family) => ({
        key: `${position}:${family}`,
        label: `${getPositionLabel(position)} ${family}`,
        predicate: (decision) => isActionOpportunity(decision, family),
        actionFrequencyFamily: family,
      })),
      config,
      baselineAdjustments,
    );
    return acc;
  }, {});

  const byPositionActionStack = POSITION_ORDER.reduce<Record<string, Record<string, GradeCard[]>>>((acc, position) => {
    const positionDecisions = activeDecisions.filter((decision) => decision.heroPosition === position);
    const positionOpportunities = filteredOpportunities.filter((decision) => decision.heroPosition === position);
    acc[position] = STACK_DEPTH_BUCKETS.reduce<Record<string, GradeCard[]>>((stackAcc, stackBucket) => {
      const decisionsInBucket = positionDecisions.filter((decision) => decision.stackBucket === stackBucket);
      const opportunitiesInBucket = positionOpportunities.filter((decision) => decision.stackBucket === stackBucket);
      if (decisionsInBucket.length === 0 && opportunitiesInBucket.length === 0) return stackAcc;

      stackAcc[stackBucket] = groupGrade(
        decisionsInBucket,
        opportunitiesInBucket,
        ACTION_FAMILY_ORDER.map((family) => ({
          key: `${position}:${stackBucket}:${family}`,
          label: `${getPositionLabel(position)} ${family} ${stackBucket}`,
          predicate: (decision) => isActionOpportunity(decision, family),
          actionFrequencyFamily: family,
        })),
        config,
        baselineAdjustments,
      );
      return stackAcc;
    }, {});

    return acc;
  }, {});

  const allActionCards = Object.values(byPositionAction).flat();
  const allStackCards = Object.values(byPositionActionStack)
    .flatMap((stackMap) => Object.values(stackMap))
    .flat();
  const recommendationPool = allStackCards.length > 0 ? allStackCards : allActionCards;

  return {
    overall: gradeDecisions("Overall Preflop", "overall", activeDecisions, filteredOpportunities, config),
    positions,
    actionFamilies,
    byPositionAction,
    byPositionActionStack,
    biggestLeaks: getBiggestLeaks(activeDecisions),
    bestAreas: getBestAreas([...positions, ...actionFamilies, ...allActionCards]),
    studyRecommendation: getStudyRecommendation(recommendationPool),
    rollingWindow: {
      activeDecisionCount: activeDecisions.length,
      totalDecisionCount: filteredDecisions.length,
      recentHandLimit: config.recentHandLimit,
      minStableSample: config.minStableSample,
      minProvisionalSample: config.minProvisionalSample,
    },
    tournament: {
      type: tournamentFormatFilter,
      label: getTournamentTypeLabel(tournamentFormatFilter),
      baselineLabel:
        tournamentFormatFilter === "all_tournaments"
          ? "Combined results, scored with standard baseline fallback"
          : tournamentFormatFilter === "standard_mtt"
            ? "Using standard chip EV baseline"
            : tournamentFormatFilter === "pko"
              ? "No PKO baseline yet"
              : "No Mystery Bounty baseline yet",
      usesFallbackBaseline: tournamentFormatFilter !== "standard_mtt",
    },
  };
}
