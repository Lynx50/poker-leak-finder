export type Position =
  | "UTG"
  | "MP"
  | "LJ"
  | "HJ"
  | "CO"
  | "BTN"
  | "SB"
  | "BB"
  | "UNKNOWN";

export type PlayerSeat = {
  seat: number;
  name: string;
  stack: number;
};

export type HeroCards = {
  raw: string;
  first: string;
  second: string;
  shorthand: string;
};

export type HandTier =
  | "premium"
  | "strong"
  | "medium"
  | "speculative"
  | "trash";

export type RangeAction = "Raise" | "Call" | "Fold" | "Jam" | "Continue" | "Check";

export type RangeSourceKind = "built_in" | "custom_import" | "custom_manual";

export type TournamentType = "standard_mtt" | "pko" | "mystery_bounty";

export type TournamentFormatFilter = "all_tournaments" | TournamentType;

export type StackDepthBucket =
  | "10–15bb"
  | "15–20bb"
  | "20–30bb"
  | "30–40bb"
  | "40–50bb"
  | "50–60bb"
  | "60–80bb"
  | "80–100bb"
  | "100bb+";

export type PreflopRangeNode = {
  nodeKey: string;
  label: string;
  stackBucket?: string;
  sourceLabel: string;
  actions: Partial<Record<RangeAction, string[]>>;
};

export type RangePack = {
  version: string;
  sourceLabel: string;
  nodes: Record<string, PreflopRangeNode>;
};

export type RangeLibraryState = {
  activeSource: RangeSourceKind;
  customLabel: string | null;
  nodes: Record<string, PreflopRangeNode>;
};

export type RangeValidationResult =
  | {
      ok: true;
      pack: RangePack;
    }
  | {
      ok: false;
      error: string;
    };

export type ParsedActionType =
  | "post_sb"
  | "post_bb"
  | "post_ante"
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "unknown";

export type ParsedAction = {
  player: string;
  type: ParsedActionType;
  amount?: number;
  toAmount?: number;
  isAllIn?: boolean;
  raw: string;
};

export type ParsedStreet = "flop" | "turn" | "river";

export type ParsedStreetActions = Record<ParsedStreet, ParsedAction[]>;

export type ParsedHand = {
  id: string;
  raw: string;
  heroName: string;
  heroCards: HeroCards;
  tournamentType: TournamentType;
  seats: PlayerSeat[];
  buttonSeat: number | null;
  activePlayers: string[];
  heroPosition: Position;
  preflopActions: ParsedAction[];
  postflopActions: ParsedStreetActions;
  smallBlindAmount: number | null;
  bigBlindAmount: number | null;
};

export type DebugReason =
  | "bad_parse"
  | "unsupported_node"
  | "no_hero_action"
  | "unknown_position"
  | "too_many_raises"
  | "unsupported_multiway_branch"
  | "unsupported_jam_branch";

export type SkipReason =
  | "NOT_SRP"
  | "MULTIWAY"
  | "THREE_BET_POT"
  | "LIMPED_POT"
  | "HERO_NOT_INVOLVED"
  | "WALK"
  | "PARSER_ERROR";

export type DecisionFamily =
  | "unopened"
  | "facing_open"
  | "facing_3bet"
  | "facing_4bet"
  | "squeeze"
  | "blind_defense";

export type GradingActionFamily = "RFI" | "Call" | "3-bet" | "Fold" | "Jam";

export type GradeLetter = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D" | "E" | "F";

export type GradeStatus = "stable" | "provisional" | "not_enough_data";

export type GradingEligibilityStatus = "scored" | "visible_unscored";

export type DecisionConfidenceTier = "clean" | "lower_confidence";

export type GradingExclusionReason =
  | "bounty_all_in_spot"
  | "bounty_reshove_or_calloff"
  | "bounty_short_stack_spot"
  | "mystery_bounty_active_stage";

export type GradingEligibility = {
  status: GradingEligibilityStatus;
  reason?: GradingExclusionReason;
  message?: string;
};

export type GradeCard = {
  key: string;
  label: string;
  grade: GradeLetter | "N/A";
  status: GradeStatus;
  score: number | null;
  opportunityCount: number;
  scoredCount: number;
  sampleSize: number;
  mistakeCount: number;
  mistakeRate: number;
  weightedSeverity: number;
  confidence: number;
  studyHint: string;
  actionFrequency?: {
    action: GradingActionFamily;
    actionTakenLabel: string;
    actualPercent: number;
    baselinePercent: number | null;
    differencePercent: number | null;
    opportunities: number;
    takenCount: number;
    foldedCount: number;
    otherCount: number;
    baselineCount: number | null;
  };
  directionalLeakSummary?: {
    tightLabel: string;
    wideLabel: string;
    tightCount: number;
    wideCount: number;
    tendency: "Too Tight" | "Too Loose" | "Balanced";
  };
};

export type DashboardGradeSummary = {
  overall: GradeCard;
  positions: GradeCard[];
  actionFamilies: GradeCard[];
  byPositionAction: Record<string, GradeCard[]>;
  byPositionActionStack: Record<string, Record<string, GradeCard[]>>;
  biggestLeaks: {
    label: string;
    count: number;
    weightedSeverity: number;
  }[];
  bestAreas: GradeCard[];
  studyRecommendation: {
    label: string;
    reason: string;
    grade: GradeCard;
  } | null;
  rollingWindow: {
    activeDecisionCount: number;
    totalDecisionCount: number;
    recentHandLimit: number;
    minStableSample: number;
    minProvisionalSample: number;
  };
  tournament: {
    type: TournamentFormatFilter;
    label: string;
    baselineLabel: string;
    usesFallbackBaseline: boolean;
  };
};

export type BaselineFrequencyAdjustment = {
  baselinePercent: number;
};

export type PreflopOpportunity = {
  handId: string;
  nodeKey: string;
  fallbackNodeKeys: string[];
  tournamentType?: TournamentType;
  family: DecisionFamily;
  heroCards: string;
  heroPosition: Position;
  handTier: HandTier;
  heroStackChips: number;
  heroStackInBlinds: number;
  relevantOpponentStackChips: number[];
  effectiveStackChips: number;
  bigBlindAmount: number | null;
  effectiveStackInBlinds: number;
  stackBucket: StackDepthBucket;
  actualAction: string;
  handText: string;
  contextSummary: string;
  branchSummary: string;
};

export type SupportedDecision = {
  handId: string;
  nodeKey: string;
  tournamentType?: TournamentType;
  family: DecisionFamily;
  heroCards: string;
  heroPosition: Position;
  handTier: HandTier;
  heroStackInBlinds: number;
  effectiveStackInBlinds: number;
  actualAction: string;
  preferredAction: string;
  leakLabel: string;
  severity: "Low" | "Medium" | "High";
  severityScore: number;
  priority: "Low" | "Medium" | "High";
  priorityScore: number;
  mistakeType:
    | "on_plan"
    | "overfold"
    | "overcall"
    | "under_3bet"
    | "over_jam"
    | "under_jam"
    | "passive"
    | "spewy"
    | "line_mismatch";
  nodeSupport: "strong" | "medium" | "weak";
  confidenceTier: DecisionConfidenceTier;
  stackBucket: StackDepthBucket;
  usesFallback: boolean;
  isMistake: boolean;
  rangeSourceUsed: RangeSourceKind;
  rangeLabelUsed: string;
  handText: string;
  contextSummary: string;
  branchSummary: string;
};

export type DecisionOpportunitySummary = {
  action: GradingActionFamily;
  count: number;
};

export type DecisionSeed = {
  handId: string;
  nodeKey: string;
  fallbackNodeKeys: string[];
  family: DecisionFamily;
  heroCards: string;
  heroPosition: Position;
  handTier: HandTier;
  heroStackInBlinds: number;
  effectiveStackInBlinds: number;
  stackBucket: StackDepthBucket;
  actualAction: string;
  preferredAction: string;
  handText: string;
  contextSummary: string;
  branchSummary: string;
};

export type RangeResolution = {
  preferredAction: RangeAction;
  sourceUsed: RangeSourceKind;
  sourceLabel: string;
  nodeSupport: SupportedDecision["nodeSupport"];
  stackBucket: string;
  usesFallback: boolean;
};

export type ExcludedDecision = {
  handId: string;
  reason: DebugReason;
  message: string;
  handText: string;
  nodeKey?: string;
};

export type SkippedHandLog = {
  handId: string;
  reason: SkipReason;
  message: string;
  nodeKey?: string;
};

export type AnalysisReport = {
  opportunities: PreflopOpportunity[];
  supported: SupportedDecision[];
  excluded: ExcludedDecision[];
  skippedHands: SkippedHandLog[];
  totalHands: number;
  parsedHands: number;
  eligiblePreflopSpots: number;
  unsupportedSpots: number;
  classifiedHands: number;
  scoredHands: number;
  coveragePercent: number;
  modelCoveragePercent: number;
  topExclusionCategories: {
    reason: DebugReason;
    count: number;
    percentage: number;
  }[];
  skipReasonBreakdown: {
    reason: SkipReason;
    count: number;
  }[];
  decisionOpportunitiesByAction: DecisionOpportunitySummary[];
  topLeaksByWeightedSeverity: {
    label: string;
    weightedSeverity: number;
    count: number;
  }[];
  topLeaksByFrequency: {
    label: string;
    count: number;
  }[];
  topMistakeTypes: {
    type: SupportedDecision["mistakeType"];
    weightedSeverity: number;
    count: number;
  }[];
  topNodesByWeightedSeverity: {
    nodeKey: string;
    weightedSeverity: number;
    count: number;
    nodeSupport: SupportedDecision["nodeSupport"];
  }[];
  topPositionsByWeightedSeverity: {
    position: Position;
    weightedSeverity: number;
    count: number;
  }[];
  weakSupportNodes: {
    nodeKey: string;
    count: number;
  }[];
  fallbackNodes: {
    nodeKey: string;
    count: number;
  }[];
  activeRangeSource: RangeSourceKind;
  activeRangeLabel: string;
  overriddenNodes: {
    nodeKey: string;
    count: number;
  }[];
  missingRangeNodes: {
    nodeKey: string;
    count: number;
  }[];
  invalidRangeMessage: string | null;
  blindVsBlind: BlindVsBlindReport;
};

export type BlindVsBlindStackBucket = "0-10bb" | "10-15bb" | "15-25bb" | "25-40bb" | "40bb+";

export type BlindVsBlindPreflopBranch =
  | "sb_unopened"
  | "bb_vs_sb_limp"
  | "sb_vs_bb_iso"
  | "bb_vs_sb_open"
  | "sb_vs_bb_3bet";

export type BlindVsBlindPotType = "limped_pot" | "iso_pot" | "raised_pot" | "3bet_pot";

export type BlindVsBlindPostflopRole = "oop_sb" | "ip_bb";

export type BlindVsBlindPostflopAction =
  | "check"
  | "check_back"
  | "bet_small"
  | "bet_big"
  | "raise"
  | "jam";

export type BlindVsBlindOpportunity = {
  handId: string;
  branch: BlindVsBlindPreflopBranch;
  action: string;
  actorPosition: "SB" | "BB";
  stackBucket: BlindVsBlindStackBucket;
  effectiveStackInBlinds: number;
  effectiveStackInChips: number;
  actorStackInChips: number | null;
  heroCards: string;
  actionSummary: string;
  rawHand: string;
  potType?: BlindVsBlindPotType;
  street?: ParsedStreet;
  postflopRole?: BlindVsBlindPostflopRole;
};

export type BlindVsBlindLeakHand = {
  handId: string;
  heroCards: string;
  branch: BlindVsBlindPreflopBranch;
  action: string;
  actorPosition: "SB" | "BB";
  stackBucket: BlindVsBlindStackBucket;
  effectiveStackInBlinds: number;
  effectiveStackInChips: number;
  actorStackInChips: number | null;
  actionSummary: string;
  rawHand: string;
  potType?: BlindVsBlindPotType;
  street?: ParsedStreet;
  postflopRole?: BlindVsBlindPostflopRole;
};

export type BlindVsBlindLeakBucket = {
  key: string;
  label: string;
  supported: boolean;
  count: number;
  hands: BlindVsBlindLeakHand[];
};

export type BlindVsBlindGradeCard = {
  key: string;
  label: string;
  grade: GradeLetter | "N/A";
  opportunities: number;
  leakCount: number;
  leakRate: number;
  note: string;
  actionFrequency?: {
    label: string;
    actualPercent: number;
    opportunities: number;
    takenCount: number;
  };
  leakBuckets: BlindVsBlindLeakBucket[];
};

export type BlindVsBlindStackSummary = {
  bucket: BlindVsBlindStackBucket;
  opportunities: number;
  jams: number;
  jamRate: number;
};

export type BlindVsBlindReport = {
  totalHands: number;
  bvbHands: number;
  opportunities: BlindVsBlindOpportunity[];
  gradeCards: BlindVsBlindGradeCard[];
  stackSummary: BlindVsBlindStackSummary[];
  preflopCounts: {
    branch: BlindVsBlindPreflopBranch;
    action: string;
    count: number;
  }[];
  postflopCounts: {
    potType: BlindVsBlindPotType;
    street: ParsedStreet;
    role: BlindVsBlindPostflopRole;
    action: BlindVsBlindPostflopAction;
    count: number;
  }[];
  topLeaks: {
    label: string;
    count: number;
  }[];
};
