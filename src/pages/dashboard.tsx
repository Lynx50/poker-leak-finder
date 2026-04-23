import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Filter,
  Info,
  RefreshCw,
  Search,
  Settings2,
  UploadCloud,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { analyzeHandHistories } from "@/lib/poker/analysis";
import { getBaselineTargetPercent } from "@/lib/poker/baseline-targets";
import {
  buildDashboardGradeSummary,
  classifyDecisionsForGrading,
  DEFAULT_ROLLING_WINDOW_CONFIG,
  getPositionLabel,
  getTournamentTypeLabel,
  isActionOpportunity,
  POSITION_ORDER,
  TOURNAMENT_FORMAT_FILTER_OPTIONS,
} from "@/lib/poker/grading";
import { createImportedRangeState, createManualRangeState, getDefaultRangeLibraryState, loadRangeLibraryState, saveRangeLibraryState } from "@/lib/poker/range-store";
import { BUILT_IN_RANGE_PACK, exportRangePack, formatRangeTokens, getEffectiveRangeNodes, parseRangeText, validateRangePack } from "@/lib/poker/ranges";
import { STACK_DEPTH_BUCKETS } from "@/lib/poker/stack-depth";
import { AnalysisReport, GradeCard, GradingActionFamily, GradingEligibility, Position, PreflopRangeNode, RangeAction, RangeLibraryState, RangeSourceKind, SkipReason, TournamentFormatFilter, TournamentType } from "@/lib/poker/types";
import { cn } from "@/lib/utils";

type AnalysisResult = {
  id: string;
  nodeKey: string;
  heroCards: string;
  heroPosition: string;
  actualAction: string;
  preferredAction: string;
  leakLabel: string;
  severity: "Low" | "Medium" | "High";
  priority: "Low" | "Medium" | "High";
  mistakeType: string;
  rangeSourceUsed: RangeSourceKind;
  rangeLabelUsed: string;
  handText: string;
  branchSummary: string;
  gradingEligibility?: GradingEligibility;
};

type UploadedFile = {
  file: File;
  content: string;
};

type FilterState = {
  node: string;
  position: string;
  severity: string;
  action: string;
  leakLabel: string;
};

type RangeEditorState = Record<RangeAction, string>;

type DrilldownSelection =
  | { type: "position"; key: Position; action?: GradingActionFamily }
  | { type: "action"; key: GradingActionFamily }
  | { type: "leak"; key: string };

type StoredUploadBatch = {
  id: string;
  createdAt: string;
  tournamentType: TournamentType;
  handCount: number;
  characterCount: number;
};

const EMPTY_FILTERS: FilterState = {
  node: "",
  position: "",
  severity: "",
  action: "",
  leakLabel: "",
};

const RANGE_ACTIONS: RangeAction[] = ["Raise", "Call", "Fold", "Jam", "Check", "Continue"];
const UPLOAD_HISTORY_KEY = "poker-leak-finder-upload-history";
const EXPERIMENTAL_RFI_POSITION: Position = "BTN";
const EXPERIMENTAL_RFI_ACTION: GradingActionFamily = "RFI";
const EXPERIMENTAL_RFI_STACK_BUCKET = STACK_DEPTH_BUCKETS.find((bucket) => bucket.startsWith("20")) ?? STACK_DEPTH_BUCKETS[2];
const EXPERIMENTAL_RFI_CARD_KEY = `${EXPERIMENTAL_RFI_POSITION}:${EXPERIMENTAL_RFI_STACK_BUCKET}:${EXPERIMENTAL_RFI_ACTION}`;

const SEVERITY_STYLES: Record<AnalysisResult["severity"], string> = {
  High: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  Medium: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
  Low: "border-teal-500/30 bg-teal-500/10 text-teal-400",
};

function includesText(source: string, query: string) {
  if (!query.trim()) return true;
  return source.toLowerCase().includes(query.trim().toLowerCase());
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function createEditorState(node?: PreflopRangeNode): RangeEditorState {
  return {
    Raise: formatRangeTokens(node?.actions.Raise),
    Call: formatRangeTokens(node?.actions.Call),
    Fold: formatRangeTokens(node?.actions.Fold),
    Jam: formatRangeTokens(node?.actions.Jam),
    Check: formatRangeTokens(node?.actions.Check),
    Continue: formatRangeTokens(node?.actions.Continue),
  };
}

function getSourceBadge(source: RangeSourceKind) {
  switch (source) {
    case "custom_import":
      return "Imported Custom";
    case "custom_manual":
      return "Manual Custom";
    default:
      return "Built-In Baseline";
  }
}

function getActiveRangeLabel(library: RangeLibraryState) {
  return library.activeSource === "built_in"
    ? BUILT_IN_RANGE_PACK.sourceLabel
    : library.customLabel ?? "Custom Ranges";
}

function getGradeTone(card: GradeCard) {
  if (card.status === "not_enough_data") return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  if (card.score !== null && card.score >= 90) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (card.score !== null && card.score >= 80) return "border-lime-500/30 bg-lime-500/10 text-lime-300";
  if (card.score !== null && card.score >= 70) return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
  return "border-orange-500/30 bg-orange-500/10 text-orange-300";
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

function formatOneDecimalPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSignedPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatOneDecimalPercent(value)}`;
}

function formatGradingExclusionReason(reason: string) {
  switch (reason) {
    case "bounty_all_in_spot":
      return "Bounty-sensitive all-in spot";
    case "bounty_reshove_or_calloff":
      return "Bounty-sensitive reshove/call-off";
    case "bounty_short_stack_spot":
      return "Short-stack bounty spot";
    case "mystery_bounty_active_stage":
      return "Mystery bounty active-stage spot";
    default:
      return reason;
  }
}

function getExclusionCount(report: AnalysisReport | null, reason: string) {
  return report?.excluded.filter((decision) => decision.reason === reason).length ?? 0;
}

function getModelScopeExclusionCount(report: AnalysisReport | null) {
  return (
    getExclusionCount(report, "too_many_raises") +
    getExclusionCount(report, "unsupported_jam_branch") +
    getExclusionCount(report, "unsupported_multiway_branch")
  );
}

function getSkipReasonCount(report: AnalysisReport | null, reason: SkipReason) {
  return report?.skipReasonBreakdown.find((entry) => entry.reason === reason)?.count ?? 0;
}

function getUserFacingExclusionReason(reason: string) {
  switch (reason) {
    case "unsupported_node":
      return "Outside supported spot model";
    case "unknown_position":
      return "Unknown position";
    case "unsupported_jam_branch":
      return "Unsupported jam branch";
    case "unsupported_multiway_branch":
      return "Unsupported multiway branch";
    case "too_many_raises":
      return "Too many raises";
    case "no_hero_action":
      return "Missing clean opportunity";
    case "bad_parse":
      return "Bad parse";
    default:
      return reason;
  }
}

function makeEmptyGradeCard(key: string, label: string): GradeCard {
  return {
    key,
    label,
    grade: "N/A",
    status: "not_enough_data",
    score: null,
    opportunityCount: 0,
    scoredCount: 0,
    sampleSize: 0,
    mistakeCount: 0,
    mistakeRate: 0,
    weightedSeverity: 0,
    confidence: 0,
    studyHint: "No recent opportunities yet.",
  };
}

function getBlindVsBlindBaselineTarget(
  cardKey: string,
  resolveBaseline: (cardKey: string) => number | null,
) {
  switch (cardKey) {
    case "sb_unopened":
      return resolveBaseline("SB:RFI");
    case "bb_vs_sb_limp":
      return resolveBaseline("BB:3-bet");
    case "sb_vs_bb_iso":
      return resolveBaseline("SB:Call");
    case "jam_decisions":
      return resolveBaseline("Jam");
    default:
      return null;
  }
}

function getBaselineLabelOverride(filter: TournamentFormatFilter) {
  return filter === "pko" || filter === "mystery_bounty" ? "Pending" : undefined;
}

function readStoredUploadBatches(): StoredUploadBatch[] {
  try {
    const raw = window.localStorage.getItem(UPLOAD_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredUploadBatch(batch: StoredUploadBatch) {
  const current = readStoredUploadBatches();
  window.localStorage.setItem(UPLOAD_HISTORY_KEY, JSON.stringify([...current, batch].slice(-50)));
}

function GradeTile({
  card,
  baselineTarget,
  baselineLabelOverride,
  metricLabels = { baseline: "Baseline", actual: "Your %" },
  descriptor,
  onClick,
  active,
  mode = "summary",
}: {
  card: GradeCard;
  baselineTarget?: number | null;
  baselineLabelOverride?: string;
  metricLabels?: {
    baseline: string;
    actual: string;
  };
  descriptor?: string;
  onClick?: () => void;
  active?: boolean;
  mode?: "summary" | "detail";
}) {
  const resolvedBaseline = card.actionFrequency?.baselinePercent ?? baselineTarget ?? null;
  const baselineLabel = baselineLabelOverride ?? (resolvedBaseline !== null
    ? formatOneDecimalPercent(resolvedBaseline)
    : "--");
  const yourPercentLabel = card.actionFrequency
    ? formatOneDecimalPercent(card.actionFrequency.actualPercent)
    : "--";
  const sampleLabel =
    card.status === "not_enough_data" ? "Low sample" : card.status === "provisional" ? "Provisional" : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border bg-background p-5 text-left transition hover:border-primary/50 hover:bg-muted/30",
        active ? "border-primary/60 bg-primary/10 shadow-lg shadow-primary/5" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xl font-semibold leading-tight text-white">{card.label}</p>
          {descriptor && <p className="mt-2 text-sm leading-snug text-muted-foreground">{descriptor}</p>}
        </div>
        <Badge variant="outline" className={cn("shrink-0 border px-3 py-1 font-mono text-xl", getGradeTone(card))}>
          {card.grade}
        </Badge>
      </div>

      <div className="mt-5 grid gap-3">
        {[
          ["Hands", card.opportunityCount.toLocaleString()],
          [metricLabels.baseline, baselineLabel],
          [metricLabels.actual, yourPercentLabel],
        ].map(([label, value]) => (
          <div key={label} className="grid grid-cols-[1fr_auto] items-baseline gap-4 rounded-xl border border-border bg-card/60 px-4 py-3">
            <span className="text-base font-medium text-muted-foreground">{label}</span>
            <span className="font-mono text-2xl font-semibold text-white">{value}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex min-h-6 items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{sampleLabel}</span>
        {card.mistakeCount > 0 && <span>Mistakes: {card.mistakeCount}</span>}
      </div>
      {mode === "detail" && <Progress value={card.confidence * 100} className="mt-2 h-1.5" />}
    </button>
  );
}

export default function Dashboard() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rangeImportRef = useRef<HTMLInputElement | null>(null);

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [handHistoryInput, setHandHistoryInput] = useState("");
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [status, setStatus] = useState("Upload hand histories or paste them below.");
  const [isDragging, setIsDragging] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Record<string, boolean>>({});
  const [rangeLibrary, setRangeLibrary] = useState<RangeLibraryState>(() => loadRangeLibraryState());
  const [selectedRangeNodeKey, setSelectedRangeNodeKey] = useState("");
  const [rangeEditor, setRangeEditor] = useState<RangeEditorState>(() => createEditorState());
  const [invalidRangeMessage, setInvalidRangeMessage] = useState<string | null>(null);
  const [tournamentFormatFilter, setTournamentFormatFilter] = useState<TournamentFormatFilter>("all_tournaments");
  const [selectedDrilldown, setSelectedDrilldown] = useState<DrilldownSelection | null>(null);
  const [storedUploadBatches, setStoredUploadBatches] = useState<StoredUploadBatch[]>([]);
  const [experimentalRfiDelta, setExperimentalRfiDelta] = useState(0);

  const baselineLabelOverride = getBaselineLabelOverride(tournamentFormatFilter);
  const effectiveRangeNodes = useMemo(() => getEffectiveRangeNodes(rangeLibrary), [rangeLibrary]);
  const getCardBaselineTarget = useMemo(
    () => (cardKey: string) => getBaselineTargetPercent(cardKey, effectiveRangeNodes),
    [effectiveRangeNodes],
  );
  const editableNodeKeys = useMemo(() => Object.keys(effectiveRangeNodes).sort(), [effectiveRangeNodes]);
  const selectedRangeNode = selectedRangeNodeKey ? effectiveRangeNodes[selectedRangeNodeKey] : undefined;

  useEffect(() => {
    setStoredUploadBatches(readStoredUploadBatches());
  }, []);

  useEffect(() => {
    saveRangeLibraryState(rangeLibrary);
  }, [rangeLibrary]);

  useEffect(() => {
    if (!selectedRangeNodeKey || !effectiveRangeNodes[selectedRangeNodeKey]) {
      setSelectedRangeNodeKey(editableNodeKeys[0] ?? "");
    }
  }, [effectiveRangeNodes, editableNodeKeys, selectedRangeNodeKey]);

  useEffect(() => {
    setRangeEditor(createEditorState(selectedRangeNode));
  }, [selectedRangeNodeKey, selectedRangeNode]);

  const filteredResults = useMemo(() => {
    return results.filter((result) => {
      if (!includesText(result.nodeKey, filters.node)) return false;
      if (!includesText(result.heroPosition, filters.position)) return false;
      if (!includesText(result.severity, filters.severity)) return false;
      if (
        filters.action.trim() &&
        !includesText(result.actualAction, filters.action) &&
        !includesText(result.preferredAction, filters.action)
      ) {
        return false;
      }
      if (!includesText(result.leakLabel, filters.leakLabel)) return false;
      return true;
    });
  }, [filters, results]);

  const summary = useMemo(() => {
    const severityCounts = { High: 0, Medium: 0, Low: 0 };
    const leakCounts: Record<string, number> = {};

    filteredResults.forEach((result) => {
      severityCounts[result.severity] += 1;
      leakCounts[result.leakLabel] = (leakCounts[result.leakLabel] ?? 0) + 1;
    });

    const topLeakEntry = Object.entries(leakCounts).sort((a, b) => b[1] - a[1])[0];
    const topNodeEntry = filteredResults.reduce<Record<string, number>>((acc, result) => {
      acc[result.nodeKey] = (acc[result.nodeKey] ?? 0) + 1;
      return acc;
    }, {});
    const worstNode = Object.entries(topNodeEntry).sort((a, b) => b[1] - a[1])[0];

    return {
      severityCounts,
      topLeak: topLeakEntry ? `${topLeakEntry[0]} (${topLeakEntry[1]})` : "None yet",
      worstNode: worstNode ? worstNode[0] : "None yet",
      parsedHands: report?.parsedHands ?? 0,
      classifiedHands: report?.classifiedHands ?? 0,
      scoredHands: report?.scoredHands ?? 0,
    };
  }, [filteredResults, report]);

  const debugSummary = useMemo(() => {
    if (!report) return null;

    return {
      coverage: report.coveragePercent,
      exclusionCounts: report.topExclusionCategories,
      classifiedHands: report.classifiedHands,
      scoredHands: report.scoredHands,
      excludedDecisions: report.excluded.length,
      rawHands: report.totalHands,
      parsedHands: report.parsedHands,
      malformedHands: getExclusionCount(report, "bad_parse"),
      handsWithHeroDecision: report.parsedHands - getExclusionCount(report, "no_hero_action"),
      eligiblePreflopSpots: report.eligiblePreflopSpots,
      unsupportedSpots: report.unsupportedSpots,
      unknownPositionSpots: getExclusionCount(report, "unknown_position"),
      unsupportedNodeSpots: getExclusionCount(report, "unsupported_node"),
      modelScopeExclusions: getModelScopeExclusionCount(report),
      modelCoverage: report.modelCoveragePercent,
      decisionOpportunitiesByAction: report.decisionOpportunitiesByAction,
      lowerConfidenceDecisions: report.supported.filter((decision) => decision.confidenceTier === "lower_confidence").length,
      skippedHands: report.skippedHands,
      skipReasonBreakdown: report.skipReasonBreakdown,
      activeRangeSource: report.activeRangeSource,
      activeRangeLabel: report.activeRangeLabel,
    };
  }, [report]);

  const gradingEligibilitySummary = useMemo(
    () => classifyDecisionsForGrading(report?.supported ?? [], tournamentFormatFilter),
    [report, tournamentFormatFilter],
  );

  const gradingEligibilityByHandId = useMemo(() => {
    const entries: [string, GradingEligibility][] = [
      ...gradingEligibilitySummary.scored.map((decision) => [
        decision.handId,
        { status: "scored" as const },
      ] satisfies [string, GradingEligibility]),
      ...gradingEligibilitySummary.visibleUnscored.map((decision) => [
        decision.handId,
        decision.gradingEligibility,
      ] satisfies [string, GradingEligibility]),
    ];

    return new Map<string, GradingEligibility>(entries);
  }, [gradingEligibilitySummary]);

  const baseDashboardGrades = useMemo(
    () =>
      buildDashboardGradeSummary(
        gradingEligibilitySummary.scored,
        report?.opportunities ?? [],
        tournamentFormatFilter,
        DEFAULT_ROLLING_WINDOW_CONFIG,
      ),
    [gradingEligibilitySummary.scored, report?.opportunities, tournamentFormatFilter],
  );

  const experimentalRfiBaseCard = useMemo(() => {
    const stackMap = baseDashboardGrades.byPositionActionStack[EXPERIMENTAL_RFI_POSITION] ?? {};
    return stackMap[EXPERIMENTAL_RFI_STACK_BUCKET]?.find((card) => card.key === EXPERIMENTAL_RFI_CARD_KEY) ?? null;
  }, [baseDashboardGrades]);

  const experimentalRfiBasePercent = experimentalRfiBaseCard?.actionFrequency?.baselinePercent ?? 0.469;
  const experimentalRfiAdjustedPercent = Math.max(
    0,
    Math.min(1, experimentalRfiBasePercent + experimentalRfiDelta / 100),
  );

  const dashboardGrades = useMemo(
    () =>
      buildDashboardGradeSummary(
        gradingEligibilitySummary.scored,
        report?.opportunities ?? [],
        tournamentFormatFilter,
        DEFAULT_ROLLING_WINDOW_CONFIG,
        {
          [EXPERIMENTAL_RFI_CARD_KEY]: {
            baselinePercent: experimentalRfiAdjustedPercent,
          },
        },
      ),
    [gradingEligibilitySummary.scored, report?.opportunities, tournamentFormatFilter, experimentalRfiAdjustedPercent],
  );

  const experimentalRfiAdjustedCard = useMemo(() => {
    const stackMap = dashboardGrades.byPositionActionStack[EXPERIMENTAL_RFI_POSITION] ?? {};
    return stackMap[EXPERIMENTAL_RFI_STACK_BUCKET]?.find((card) => card.key === EXPERIMENTAL_RFI_CARD_KEY) ?? null;
  }, [dashboardGrades]);

  const handCoverageBreakdown = useMemo(() => {
    const totalHands = report?.totalHands ?? 0;
    const scoredHands = report?.scoredHands ?? 0;
    const toPercent = (count: number) => (totalHands > 0 ? count / totalHands : 0);
    const skippedRows: { label: string; reason: SkipReason; tooltip: string }[] = [
      {
        label: "multiway",
        reason: "MULTIWAY",
        tooltip: "Hands skipped because more than two players created a multiway preflop branch outside the current scoring model.",
      },
      {
        label: "three_bet_pot",
        reason: "THREE_BET_POT",
        tooltip: "Hands skipped because the preflop action reached a 3-bet, 4-bet, or higher-complexity reraised branch not scored here.",
      },
      {
        label: "limped_pot",
        reason: "LIMPED_POT",
        tooltip: "Hands skipped because one or more players limped before the hero decision.",
      },
      {
        label: "hero_not_involved",
        reason: "HERO_NOT_INVOLVED",
        tooltip: "Hands where the parser did not find a clean hero preflop decision to classify.",
      },
      {
        label: "walk",
        reason: "WALK",
        tooltip: "Hands where the blinds were awarded without a meaningful hero preflop decision.",
      },
      {
        label: "parser_error",
        reason: "PARSER_ERROR",
        tooltip: "Hands that could not be parsed because required metadata, cards, position, or action text was missing or malformed.",
      },
    ];

    return {
      totalHands,
      scoredHands,
      scoredPercent: toPercent(scoredHands),
      rows: skippedRows.map((row) => {
        const count = getSkipReasonCount(report, row.reason);
        return {
          ...row,
          count,
          percent: toPercent(count),
        };
      }),
    };
  }, [report]);

  const drilldownCards = useMemo(() => {
    if (!selectedDrilldown) return [];
    if (selectedDrilldown.type === "leak") return [];
    if (selectedDrilldown.type === "position") {
      return dashboardGrades.byPositionAction[selectedDrilldown.key] ?? [];
    }

    return POSITION_ORDER.map((position) => {
      const positionCards = dashboardGrades.byPositionAction[position] ?? [];
      const fallbackCard = makeEmptyGradeCard(
        `${position}:${selectedDrilldown.key}`,
        `${getPositionLabel(position)} ${selectedDrilldown.key}`,
      );

      return positionCards.find((card) => card.key === fallbackCard.key) ?? fallbackCard;
    });
  }, [dashboardGrades, selectedDrilldown]);

  const drilldownStackCards = useMemo(() => {
    if (!selectedDrilldown || selectedDrilldown.type !== "position" || !selectedDrilldown.action) return [];

    const stackMap = dashboardGrades.byPositionActionStack[selectedDrilldown.key] ?? {};
    return STACK_DEPTH_BUCKETS.map((stackBucket) => {
      const cardKey = `${selectedDrilldown.key}:${stackBucket}:${selectedDrilldown.action}`;
      const label = `${getPositionLabel(selectedDrilldown.key)} ${selectedDrilldown.action} ${stackBucket}`;
      const card = stackMap[stackBucket]?.find((entry) => entry.key === cardKey) ?? makeEmptyGradeCard(cardKey, label);
      return [stackBucket, card] as const;
    });
  }, [dashboardGrades, selectedDrilldown]);

  const selectedNodeStackDiagnostics = useMemo(() => {
    if (!report || !selectedDrilldown || selectedDrilldown.type !== "position" || !selectedDrilldown.action) {
      return null;
    }

    const nodeOpportunities = report.opportunities.filter(
      (opportunity) =>
        opportunity.heroPosition === selectedDrilldown.key &&
        isActionOpportunity(opportunity, selectedDrilldown.action!),
    );
    const bucketCounts = STACK_DEPTH_BUCKETS.map((bucket) => ({
      bucket,
      count: nodeOpportunities.filter((opportunity) => opportunity.stackBucket === bucket).length,
    }));
    const rollingScoredNode = gradingEligibilitySummary.scored
      .slice(-DEFAULT_ROLLING_WINDOW_CONFIG.recentHandLimit)
      .filter(
        (decision) =>
          decision.heroPosition === selectedDrilldown.key &&
          isActionOpportunity(decision, selectedDrilldown.action!),
      );
    const rollingBucketCounts = STACK_DEPTH_BUCKETS.map((bucket) => ({
      bucket,
      count: rollingScoredNode.filter((decision) => decision.stackBucket === bucket).length,
    }));
    const validStackCount = nodeOpportunities.filter(
      (opportunity) => Number.isFinite(opportunity.effectiveStackInBlinds) && opportunity.effectiveStackInBlinds > 0,
    ).length;

    return {
      label: `${getPositionLabel(selectedDrilldown.key)} ${selectedDrilldown.action}`,
      total: nodeOpportunities.length,
      rollingTotal: rollingScoredNode.length,
      validStackCount,
      missingStackCount: nodeOpportunities.length - validStackCount,
      bucketCounts,
      rollingBucketCounts,
      examples: nodeOpportunities.slice(0, 10).map((opportunity) => ({
        handId: opportunity.handId,
        heroStackChips: opportunity.heroStackChips,
        bigBlindAmount: opportunity.bigBlindAmount,
        effectiveStackChips: opportunity.effectiveStackChips,
        effectiveStackInBlinds: opportunity.effectiveStackInBlinds,
        stackBucket: opportunity.stackBucket,
      })),
    };
  }, [gradingEligibilitySummary.scored, report, selectedDrilldown]);

  const setMergedTextarea = (nextFiles: UploadedFile[]) => {
    setHandHistoryInput(nextFiles.map((entry) => entry.content).join("\n\n"));
  };

  const loadFiles = async (files: File[]) => {
    if (files.length === 0) return;

    const nextFiles = await Promise.all(
      files.map(async (file) => ({
        file,
        content: await file.text(),
      })),
    );

    setUploadedFiles((current) => {
      const combined = [...current, ...nextFiles];
      setMergedTextarea(combined);
      return combined;
    });

    setStatus(`${files.length} file${files.length === 1 ? "" : "s"} loaded and merged into the input.`);
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    await loadFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    await loadFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const runAnalysis = () => {
    if (!handHistoryInput.trim()) {
      setStatus("Paste or upload at least one hand history before analysing.");
      return;
    }

    const nextReport = analyzeHandHistories(handHistoryInput, rangeLibrary, invalidRangeMessage);
    const uploadBatch: StoredUploadBatch = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      tournamentType: tournamentFormatFilter === "all_tournaments" ? "standard_mtt" : tournamentFormatFilter,
      handCount: nextReport.totalHands,
      characterCount: handHistoryInput.length,
    };
    writeStoredUploadBatch(uploadBatch);
    setStoredUploadBatches(readStoredUploadBatches());
    const nextEligibility = classifyDecisionsForGrading(nextReport.supported, tournamentFormatFilter);
    setReport(nextReport);
    setExpandedResults({});
    setResults(
      nextReport.supported.map((decision) => ({
        id: decision.handId,
        nodeKey: decision.nodeKey,
        heroCards: decision.heroCards,
        heroPosition: decision.heroPosition,
        actualAction: decision.actualAction,
        preferredAction: decision.preferredAction,
        leakLabel: decision.leakLabel,
        severity: decision.severity,
        priority: decision.priority,
        mistakeType: decision.mistakeType,
        rangeSourceUsed: decision.rangeSourceUsed,
        rangeLabelUsed: decision.rangeLabelUsed,
        handText: decision.handText,
        branchSummary: decision.branchSummary,
        gradingEligibility: nextEligibility.visibleUnscored.find((entry) => entry.handId === decision.handId)
          ?.gradingEligibility ?? { status: "scored" },
      })),
    );
    setStatus(
      `Analysis complete. ${nextReport.totalHands} uploaded hands, ${nextReport.eligiblePreflopSpots} detected preflop opportunities, ${nextEligibility.scoredDecisions} scored spots, ${nextReport.modelCoveragePercent.toFixed(1)}% model coverage, ${getTournamentTypeLabel(tournamentFormatFilter)}.`,
    );
  };

  const clearFiles = () => {
    setUploadedFiles([]);
    setHandHistoryInput("");
    setResults([]);
    setReport(null);
    setExpandedResults({});
    setStatus("Cleared uploaded files, input, and results.");
  };

  const exportCsv = () => {
    if (filteredResults.length === 0) {
      setStatus("No filtered results available to export.");
      return;
    }

    const csv = [
      ["node", "cards", "position", "actual_action", "preferred_action", "leak", "severity", "range_source"].join(","),
      ...filteredResults.map((result) =>
        [
          result.nodeKey,
          result.heroCards,
          result.heroPosition,
          result.actualAction,
          result.preferredAction,
          result.leakLabel,
          result.severity,
          result.rangeSourceUsed,
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "results.csv";
    link.click();
    URL.revokeObjectURL(url);

    setStatus(`Exported ${filteredResults.length} result${filteredResults.length === 1 ? "" : "s"} to CSV.`);
  };

  const handleRangeImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const validation = validateRangePack(json);
      if (!validation.ok) {
        setInvalidRangeMessage(validation.error);
        setStatus(`Range import failed: ${validation.error}`);
        return;
      }

      const nextState = createImportedRangeState(validation.pack);
      setRangeLibrary(nextState);
      setInvalidRangeMessage(null);
      setStatus(`Imported ${Object.keys(validation.pack.nodes).length} custom range nodes.`);
    } catch {
      const error = "Range import failed: file is not valid JSON.";
      setInvalidRangeMessage(error);
      setStatus(error);
    }
  };

  const handleRangeExport = () => {
    const pack = exportRangePack(rangeLibrary);
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "poker-leak-finder-ranges.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`Exported ${Object.keys(pack.nodes).length} range nodes from ${getSourceBadge(rangeLibrary.activeSource)}.`);
  };

  const handleResetRanges = () => {
    setRangeLibrary(getDefaultRangeLibraryState());
    setInvalidRangeMessage(null);
    setStatus("Reset back to the built-in tournament baseline range pack.");
  };

  const handleSwitchToBaseline = () => {
    setRangeLibrary((current) => ({
      ...current,
      activeSource: "built_in",
    }));
    setStatus("Switched scoring back to the built-in baseline ranges.");
  };

  const handleSwitchToCustom = () => {
    if (Object.keys(rangeLibrary.nodes).length === 0) {
      setStatus("No imported or manual custom ranges are available yet.");
      return;
    }
    const nextSource: RangeSourceKind =
      rangeLibrary.customLabel === "Manual Custom Ranges" ? "custom_manual" : "custom_import";
    setRangeLibrary((current) => ({
      ...current,
      activeSource: nextSource,
    }));
    setStatus("Switched scoring to the current custom range overrides.");
  };

  const handleRangeFieldChange = (action: RangeAction, value: string) => {
    setRangeEditor((current) => ({
      ...current,
      [action]: value,
    }));
  };

  const handleSaveRangeNode = () => {
    if (!selectedRangeNodeKey) {
      setStatus("Select a range node before saving edits.");
      return;
    }

    const nodeActions = RANGE_ACTIONS.reduce<Partial<Record<RangeAction, string[]>>>((acc, action) => {
      const tokens = parseRangeText(rangeEditor[action]);
      if (tokens.length > 0) {
        acc[action] = tokens;
      }
      return acc;
    }, {});

    const payload = {
      version: "1.0.0",
      sourceLabel: "Manual Custom Ranges",
      nodes: {
        [selectedRangeNodeKey]: {
          nodeKey: selectedRangeNodeKey,
          label: selectedRangeNode?.label ?? selectedRangeNodeKey,
          stackBucket: selectedRangeNode?.stackBucket ?? "10–15bb",
          actions: nodeActions,
        },
      },
    };

    const validation = validateRangePack(payload);
    if (!validation.ok) {
      setInvalidRangeMessage(validation.error);
      setStatus(`Range save failed: ${validation.error}`);
      return;
    }

    const nextNodes = {
      ...rangeLibrary.nodes,
      [selectedRangeNodeKey]: validation.pack.nodes[selectedRangeNodeKey],
    };

    setRangeLibrary(createManualRangeState(nextNodes, "Manual Custom Ranges"));
    setInvalidRangeMessage(null);
    setStatus(`Saved custom range override for ${selectedRangeNodeKey}.`);
  };

  return (
    <div className="min-h-screen bg-background pb-16 text-foreground selection:bg-primary/30">
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 pr-32">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/15">
              <Search className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-mono text-lg font-bold text-white">Poker Leak Finder</p>
              <p className="text-sm text-muted-foreground">Upload, grade, and study your next preflop leak</p>
            </div>
          </div>
          <Badge variant="outline" className="border-primary/30 bg-primary/10 px-4 py-2 font-mono uppercase tracking-wider text-primary">
            Preflop Dashboard
          </Badge>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8">
        <section className="order-1 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="casino-surface border-primary/20 bg-card shadow-2xl shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl text-white">
                <UploadCloud className="h-5 w-5 text-primary" />
                Upload Hands / Refresh Data
              </CardTitle>
              <CardDescription className="text-base">Drag files in, paste histories, then run the preflop range analysis.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input ref={fileInputRef} type="file" multiple onChange={handleUpload} className="hidden" />

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                }}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors",
                  isDragging
                    ? "border-primary bg-primary/10"
                    : "border-primary/30 bg-background/70 hover:border-primary/60 hover:bg-muted/30",
                )}
              >
                <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    <UploadCloud className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white">Drag and drop hand history files here</h3>
                    <p className="mt-2 text-base text-muted-foreground">or click to choose files</p>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">Supports multiple text hand histories</p>
                </div>
              </div>

              {uploadedFiles.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {uploadedFiles.map((entry, index) => (
                    <div key={`${entry.file.name}-${index}`} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm text-white">{entry.file.name}</p>
                        <p className="text-xs text-muted-foreground">{entry.content.length.toLocaleString()} chars</p>
                      </div>
                      <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-400">
                        Loaded
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              <Textarea
                value={handHistoryInput}
                onChange={(event) => setHandHistoryInput(event.target.value)}
                placeholder="Paste hand histories here"
                className="min-h-[220px] resize-y bg-background font-mono text-base leading-7"
              />

              <div className="flex flex-wrap gap-3">
                <Button onClick={runAnalysis} size="lg" className="cta-accent px-7 font-semibold shadow-lg shadow-orange-900/20">
                  <UploadCloud className="mr-2 h-5 w-5" />
                  Upload Hands / Refresh Data
                </Button>
                <Button variant="secondary" onClick={clearFiles}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Clear Files
                </Button>
                <Button variant="outline" onClick={exportCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>

              <div className="rounded-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                {status}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <FileText className="h-5 w-5 text-primary" />
                  Sample Summary
                </CardTitle>
                <CardDescription>Simple counts for the current upload and grading sample.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Uploaded hands</p>
                    <p className="mt-2 font-mono text-2xl text-white">{debugSummary?.rawHands ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Detected preflop opportunities</p>
                    <p className="mt-2 font-mono text-2xl text-white">{debugSummary?.eligiblePreflopSpots ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Scored spots</p>
                    <p className="mt-2 font-mono text-2xl text-white">{gradingEligibilitySummary.scoredDecisions}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Not scored (outside model)</p>
                    <p className="mt-2 font-mono text-2xl text-white">
                      {(debugSummary?.unsupportedSpots ?? 0) + gradingEligibilitySummary.visibleUnscoredDecisions}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Model coverage</p>
                      <p className="mt-1 text-sm text-muted-foreground">Scored spots divided by eligible preflop spots.</p>
                    </div>
                    <p className="font-mono text-2xl text-white">
                      {debugSummary ? `${debugSummary.modelCoverage.toFixed(1)}%` : "0.0%"}
                    </p>
                  </div>
                  <Progress value={debugSummary?.modelCoverage ?? 0} className="mt-3 h-2" />
                </div>

                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Confidence</p>
                  <p className="mt-2 text-sm text-white">
                    {dashboardGrades.overall.status === "stable"
                      ? "Reliable sample"
                      : dashboardGrades.overall.status === "provisional"
                        ? "Provisional sample"
                        : "Needs more scored spots"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Based on {dashboardGrades.rollingWindow.activeDecisionCount} recent scored spots.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/20 bg-card">
              <CardHeader>
                <CardTitle className="text-white">Hand Classification Breakdown</CardTitle>
                <CardDescription>Hands scored vs. total uploaded, plus why some hands are visible but unscored.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Hands</p>
                    <p className="mt-2 font-mono text-3xl text-white">{handCoverageBreakdown.totalHands}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Hands scored vs. total uploaded</p>
                    <p className="mt-2 font-mono text-3xl text-white">
                      {handCoverageBreakdown.scoredHands}
                      <span className="ml-2 text-base text-primary">
                        ({formatOneDecimalPercent(handCoverageBreakdown.scoredPercent)})
                      </span>
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Unscored Hands Breakdown</p>
                  <div className="mt-3 space-y-2">
                    {handCoverageBreakdown.rows.map((entry) => (
                      <div
                        key={entry.reason}
                        title={entry.tooltip}
                        className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
                      >
                        <span className="flex items-center gap-2 text-sm text-white">
                          {entry.label}
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                        <span className="font-mono text-sm text-muted-foreground">
                          {entry.count} ({formatOneDecimalPercent(entry.percent)})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="order-2 space-y-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle className="text-2xl text-white">Preflop Performance Dashboard</CardTitle>
                  <CardDescription>
                    Recent-window grades designed to show what to study next, not just raw leak rows.
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={tournamentFormatFilter}
                    onChange={(event) => setTournamentFormatFilter(event.target.value as TournamentFormatFilter)}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm text-white"
                  >
                    {TOURNAMENT_FORMAT_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <Badge
                    variant="outline"
                    className={cn(
                      "border font-mono",
                      dashboardGrades.tournament.usesFallbackBaseline
                        ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
                        : "border-primary/30 bg-primary/10 text-primary",
                    )}
                  >
                    {dashboardGrades.tournament.baselineLabel}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-8">
              {dashboardGrades.tournament.usesFallbackBaseline && (
                <div className="rounded-md border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
                  {dashboardGrades.tournament.type === "all_tournaments"
                    ? "All tournament formats are combined in this view. Bounty-sensitive spots remain excluded from grades when a hand has a bounty format."
                    : `${dashboardGrades.tournament.label} is filtered here. Bounty-sensitive all-in, reshove/call-off, and short-stack spots are visible but excluded from grades until explicit bounty baselines exist.`}
                </div>
              )}

              <div>
                <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-3xl font-semibold text-white">Grade By Position</h3>
                    <p className="mt-2 text-lg text-muted-foreground">
                      Your main dashboard view. Click a position to drill into RFI, calls, 3-bets, folds, jams, and stack depth.
                    </p>
                  </div>
                  <Badge variant="outline" className="border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary">
                    Primary study map
                  </Badge>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  {dashboardGrades.positions.map((card) => (
                    <GradeTile
                      key={card.key}
                      card={card}
                      baselineTarget={getCardBaselineTarget(card.key)}
                      baselineLabelOverride={baselineLabelOverride}
                      metricLabels={{ baseline: "Open Target", actual: "Your Open" }}
                      descriptor="Open-raise frequency from this position"
                      active={selectedDrilldown?.type === "position" && selectedDrilldown.key === card.key}
                      onClick={() => setSelectedDrilldown({ type: "position", key: card.key as Position })}
                    />
                  ))}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
                  <p className="text-sm uppercase tracking-wider text-muted-foreground">Overall Grade</p>
                  <div className="mt-4 flex items-end justify-between gap-4">
                    <div>
                      <p className="font-mono text-5xl font-bold leading-none text-white">{dashboardGrades.overall.grade}</p>
                      <p className="mt-2 text-base text-muted-foreground">
                        {dashboardGrades.overall.status === "stable"
                          ? "Stable grade"
                          : dashboardGrades.overall.status === "provisional"
                            ? "Provisional grade"
                            : "Not enough data"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-2xl text-primary">{dashboardGrades.overall.score ?? "--"}</p>
                      <p className="text-sm text-muted-foreground">score</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{dashboardGrades.overall.studyHint}</p>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Grades use the most recent {dashboardGrades.rollingWindow.recentHandLimit} scored opportunities.
                  </p>
                </div>

                <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-5">
                  <p className="text-sm uppercase tracking-wider text-orange-200">Recommended Next Study Spot</p>
                  {dashboardGrades.studyRecommendation ? (
                    <>
                      <p className="mt-3 text-2xl font-semibold text-white">{dashboardGrades.studyRecommendation.label}</p>
                      <p className="mt-3 text-base leading-relaxed text-orange-100">{dashboardGrades.studyRecommendation.reason}</p>
                    </>
                  ) : (
                    <p className="mt-3 text-base leading-relaxed text-orange-100">
                      Run analysis or add more recent samples before the dashboard chooses a study target.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
                <div className="rounded-2xl border border-border bg-background p-6">
                  <p className="text-sm uppercase tracking-wider text-muted-foreground">Biggest Leaks</p>
                  {dashboardGrades.biggestLeaks.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {dashboardGrades.biggestLeaks.slice(0, 3).map((leak) => (
                        <button
                          key={leak.label}
                          type="button"
                          onClick={() => setSelectedDrilldown({ type: "leak", key: leak.label })}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-3 text-left transition hover:border-primary/30 hover:bg-primary/5",
                            selectedDrilldown?.type === "leak" && selectedDrilldown.key === leak.label && "border-primary/40 bg-primary/5",
                          )}
                        >
                          <span className="text-base text-white">{leak.label}</span>
                          <span className="font-mono text-sm text-muted-foreground">{leak.weightedSeverity} severity</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-base text-muted-foreground">No recent mistakes found yet.</p>
                  )}
                </div>

                <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm uppercase tracking-wider text-sky-200">Experimental Range Adjustment</p>
                      <h3 className="mt-2 text-xl font-semibold text-white">BTN RFI {EXPERIMENTAL_RFI_STACK_BUCKET}</h3>
                    </div>
                    <Badge variant="outline" className="border-sky-500/40 bg-sky-500/10 text-sky-200">
                      Experimental
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-sky-100">
                    Adjust this one sample RFI baseline by up to 5 percentage points. Parser and baseline JSON stay unchanged.
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-sky-500/20 bg-background/70 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Current baseline</p>
                      <p className="mt-1 font-mono text-2xl text-white">{formatOneDecimalPercent(experimentalRfiBasePercent)}</p>
                    </div>
                    <div className="rounded-lg border border-sky-500/20 bg-background/70 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Adjusted baseline</p>
                      <p className="mt-1 font-mono text-2xl text-white">{formatOneDecimalPercent(experimentalRfiAdjustedPercent)}</p>
                    </div>
                    <div className="rounded-lg border border-sky-500/20 bg-background/70 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Node grade</p>
                      <p className="mt-1 font-mono text-2xl text-white">{experimentalRfiAdjustedCard?.grade ?? "N/A"}</p>
                    </div>
                  </div>
                  <div className="mt-5">
                    <div className="mb-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">-5%</span>
                      <span className="font-mono text-sky-100">
                        Delta {experimentalRfiDelta > 0 ? "+" : ""}
                        {experimentalRfiDelta.toFixed(1)}%
                      </span>
                      <span className="text-muted-foreground">+5%</span>
                    </div>
                    <Slider
                      value={[experimentalRfiDelta]}
                      min={-5}
                      max={5}
                      step={0.1}
                      onValueChange={(value) => setExperimentalRfiDelta(value[0] ?? 0)}
                    />
                  </div>
                </div>
              </div>

              {selectedDrilldown && (
              <div className="rounded-xl border border-border bg-background p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-white">
                      {selectedDrilldown.type === "position"
                        ? `${getPositionLabel(selectedDrilldown.key)} Breakdown`
                        : selectedDrilldown.type === "action"
                          ? `${selectedDrilldown.key} Breakdown`
                          : `Leak Breakdown: ${selectedDrilldown.key}`}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedDrilldown.type === "position"
                        ? "Choose an action below to reveal its stack-depth breakdown."
                        : selectedDrilldown.type === "action"
                          ? "Action-family breakdown across positions."
                          : "This leak is one of the highest-impact issues in the recent scored sample."}
                    </p>
                    {selectedDrilldown.type === "position" && selectedDrilldown.action && (
                      <p className="mt-1 text-xs text-primary">
                        Selected path: {getPositionLabel(selectedDrilldown.key)} → {selectedDrilldown.action}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                    Rolling last {dashboardGrades.rollingWindow.recentHandLimit} scored opportunities
                  </Badge>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  This grade uses your most recent scored preflop opportunities, not all uploaded hands.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {drilldownCards.map((card) => (
                    <GradeTile
                      key={card.key}
                      card={card}
                      baselineTarget={getCardBaselineTarget(card.key)}
                      baselineLabelOverride={baselineLabelOverride}
                      mode="detail"
                      active={
                        selectedDrilldown.type === "position" &&
                        selectedDrilldown.action !== undefined &&
                        card.key === `${selectedDrilldown.key}:${selectedDrilldown.action}`
                      }
                      onClick={
                        selectedDrilldown.type === "position"
                          ? () => {
                              const parts = card.key.split(":");
                              setSelectedDrilldown({ ...selectedDrilldown, action: parts[parts.length - 1] as GradingActionFamily });
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>

                {selectedDrilldown.type === "leak" && (
                  <div className="mt-5 rounded-lg border border-orange-500/20 bg-orange-500/10 p-4">
                    <p className="text-sm text-orange-100">
                      Study the exact spot shown above first. Use Advanced Review for example hands and Debug Diagnostics for excluded opportunity details.
                    </p>
                  </div>
                )}

                {drilldownCards.some((card) => card.actionFrequency) && (
                  <div className="mt-5 rounded-lg border border-border bg-card p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Action Frequency Detail</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {drilldownCards
                        .filter((card) => card.actionFrequency)
                        .map((card) => (
                          <div key={`${card.key}-frequency`} className="rounded-md border border-border bg-background px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-mono text-sm text-white">{card.label}</span>
                              <span className="font-mono text-sm text-primary">
                                {formatOneDecimalPercent(card.actionFrequency!.actualPercent)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {card.actionFrequency!.takenCount}/{card.actionFrequency!.opportunities} opportunities
                              {card.actionFrequency!.baselinePercent !== null
                                ? ` | baseline ${formatOneDecimalPercent(card.actionFrequency!.baselinePercent)} | diff ${formatSignedPercent(card.actionFrequency!.differencePercent ?? 0)}`
                                : ""}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {selectedDrilldown.type === "position" && (
                  <div className="mt-6 space-y-4">
                    <div>
                      <h4 className="font-semibold text-white">
                        {selectedDrilldown.action
                          ? `${getPositionLabel(selectedDrilldown.key)} ${selectedDrilldown.action} by Stack Depth`
                          : "Choose an action to see stack depth"}
                      </h4>
                      <p className="mt-1 text-xs text-primary">
                        Click RFI, Call, 3-bet, Fold, or Jam above to choose the exact node.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Opportunities are grouped by effective stack using the standard dashboard buckets from 10–15bb through 100bb+.
                      </p>
                    </div>
                    {selectedDrilldown.action ? (
                      <>
                        {selectedNodeStackDiagnostics && (
                          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                            <p className="text-xs uppercase tracking-wider text-primary">Selected Node Stack Diagnostics</p>
                            <p className="mt-2 font-mono text-sm text-white">{selectedNodeStackDiagnostics.label}</p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                              <div className="rounded-md border border-border bg-background px-3 py-2">
                                <p className="text-xs text-muted-foreground">Total opportunities</p>
                                <p className="font-mono text-lg text-white">{selectedNodeStackDiagnostics.total}</p>
                                <p className="text-[11px] text-muted-foreground">full uploaded sample</p>
                              </div>
                              <div className="rounded-md border border-border bg-background px-3 py-2">
                                <p className="text-xs text-muted-foreground">Rolling scored</p>
                                <p className="font-mono text-lg text-white">{selectedNodeStackDiagnostics.rollingTotal}</p>
                                <p className="text-[11px] text-muted-foreground">grade sample</p>
                              </div>
                              <div className="rounded-md border border-border bg-background px-3 py-2">
                                <p className="text-xs text-muted-foreground">Valid / missing stack BB</p>
                                <p className="font-mono text-lg text-white">
                                  {selectedNodeStackDiagnostics.validStackCount}/{selectedNodeStackDiagnostics.missingStackCount}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                              {selectedNodeStackDiagnostics.bucketCounts.map((entry) => {
                                const rollingEntry = selectedNodeStackDiagnostics.rollingBucketCounts.find(
                                  (rolling) => rolling.bucket === entry.bucket,
                                );
                                return (
                                  <div key={entry.bucket} className="rounded-md border border-border bg-background px-3 py-2">
                                    <div className="flex items-center justify-between">
                                      <span className="font-mono text-sm text-white">{entry.bucket}</span>
                                      <span className="font-mono text-sm text-primary">{entry.count}</span>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                      full opportunities | rolling scored {rollingEntry?.count ?? 0}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {drilldownStackCards.map(([stackBucket, card]) => (
                          <div key={stackBucket} className="rounded-lg border border-border bg-card p-4">
                            <p className="font-mono text-sm text-white">{stackBucket}</p>
                            <div className="mt-3">
                              <GradeTile
                                key={card.key}
                                card={card}
                                baselineTarget={getCardBaselineTarget(card.key)}
                                baselineLabelOverride={baselineLabelOverride}
                                mode="detail"
                              />
                            </div>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                        Select an action card above to show stack-depth buckets for {getPositionLabel(selectedDrilldown.key)}.
                      </p>
                    )}
                  </div>
                )}
              </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="order-3">
          <Card className="border-primary/20 bg-card shadow-xl shadow-primary/5">
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle className="text-2xl text-white">Blind vs Blind Priority Module</CardTitle>
                  <CardDescription className="text-base">
                    Dedicated SB/BB tree. Limp, iso, raise, 3-bet, jam, and limped-pot postflop branches stay separate from normal position reports.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-primary/30 bg-primary/10 px-4 py-2 text-primary">
                  {report?.blindVsBlind.bvbHands ?? 0} BvB hands
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {(report?.blindVsBlind.gradeCards ?? []).map((card) => (
                  <div key={card.key} className="rounded-2xl border border-border bg-background p-5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xl font-semibold leading-tight text-white">{card.label}</p>
                      <Badge variant="outline" className={cn("border px-3 py-1 font-mono text-lg", card.grade === "N/A" ? "border-slate-500/30 bg-slate-500/10 text-slate-300" : "border-primary/30 bg-primary/10 text-primary")}>
                        {card.grade}
                      </Badge>
                    </div>
                    <div className="mt-5 grid gap-3">
                      {[
                        ["Hands", card.opportunities.toLocaleString()],
                        [
                          "Baseline",
                          (() => {
                            if (baselineLabelOverride) return baselineLabelOverride;
                            const target = getBlindVsBlindBaselineTarget(card.key, getCardBaselineTarget);
                            return target !== null ? formatOneDecimalPercent(target) : "--";
                          })(),
                        ],
                        ["Your %", "--"],
                      ].map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[1fr_auto] items-baseline gap-4 rounded-xl border border-border bg-card/60 px-4 py-3">
                          <span className="text-base font-medium text-muted-foreground">{label}</span>
                          <span className="font-mono text-2xl font-semibold text-white">{value}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">Mistakes: {card.leakCount}</p>
                  </div>
                ))}
                {(!report || report.blindVsBlind.gradeCards.length === 0) && (
                  <div className="rounded-2xl border border-border bg-background p-5 text-base text-muted-foreground sm:col-span-2 xl:col-span-3">
                    Run analysis to populate dedicated Blind vs Blind grades.
                  </div>
                )}
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-border bg-background p-5">
                  <p className="text-sm uppercase tracking-wider text-muted-foreground">Preflop BvB Tree Counts</p>
                  <div className="mt-4 grid gap-2">
                    {(report?.blindVsBlind.preflopCounts ?? []).slice(0, 12).map((entry) => (
                      <div key={`${entry.branch}-${entry.action}`} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                        <span className="font-mono text-sm text-white">{entry.branch} / {entry.action}</span>
                        <span className="font-mono text-sm text-primary">{entry.count}</span>
                      </div>
                    ))}
                    {(!report || report.blindVsBlind.preflopCounts.length === 0) && (
                      <p className="text-sm text-muted-foreground">No BvB preflop branches detected yet.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-background p-5">
                  <p className="text-sm uppercase tracking-wider text-muted-foreground">Jam Decisions By Stack Depth</p>
                  <div className="mt-4 grid gap-2">
                    {(report?.blindVsBlind.stackSummary ?? []).map((entry) => (
                      <div key={entry.bucket} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                        <span className="font-mono text-sm text-white">{entry.bucket}</span>
                        <span className="font-mono text-sm text-muted-foreground">{entry.opportunities} opps</span>
                        <span className="font-mono text-sm text-primary">{formatOneDecimalPercent(entry.jamRate)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background p-5">
                <p className="text-sm uppercase tracking-wider text-muted-foreground">Postflop Pot-Type Tracking</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Limped pot = SB limp / BB check. Iso pot = SB limp / BB raise / SB call. Raised pot = SB open / BB call. 3-bet pot = SB open / BB 3-bet / SB call.
                </p>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {(report?.blindVsBlind.postflopCounts ?? []).slice(0, 16).map((entry) => (
                    <div key={`${entry.potType}-${entry.street}-${entry.role}-${entry.action}`} className="rounded-lg border border-border bg-card px-3 py-2">
                      <p className="font-mono text-sm text-white">{entry.potType}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{entry.street} / {entry.role} / {entry.action}</p>
                      <p className="mt-2 font-mono text-lg text-primary">{entry.count}</p>
                    </div>
                  ))}
                  {(!report || report.blindVsBlind.postflopCounts.length === 0) && (
                    <p className="text-sm text-muted-foreground md:col-span-2 xl:col-span-4">
                      No tracked BvB postflop actions yet. Limped pot flop actions will appear here when detected.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="order-5">
          <Collapsible>
            <Card className="border-border bg-card">
              <CardHeader>
                <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Filter className="h-5 w-5 text-primary" />
                      Advanced Filters
                    </CardTitle>
                    <CardDescription>Filter and export the detailed result list without cluttering the main dashboard.</CardDescription>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-5">
                    <Input value={filters.node} onChange={(event) => setFilters((prev) => ({ ...prev, node: event.target.value }))} placeholder="Node" />
                    <Input value={filters.position} onChange={(event) => setFilters((prev) => ({ ...prev, position: event.target.value }))} placeholder="Position" />
                    <Input value={filters.severity} onChange={(event) => setFilters((prev) => ({ ...prev, severity: event.target.value }))} placeholder="Severity" />
                    <Input value={filters.action} onChange={(event) => setFilters((prev) => ({ ...prev, action: event.target.value }))} placeholder="Action" />
                    <Input value={filters.leakLabel} onChange={(event) => setFilters((prev) => ({ ...prev, leakLabel: event.target.value }))} placeholder="Leak Label" />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Reset Filters
                    </Button>
                    <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                      {filteredResults.length} visible results
                    </Badge>
                    <span className="text-sm text-muted-foreground">Range source: {getActiveRangeLabel(rangeLibrary)}</span>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </section>

        <section className="order-4">
          <Collapsible>
            <Card className="border-border bg-card">
              <CardHeader>
                <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Settings2 className="h-5 w-5 text-primary" />
                      Range Manager
                    </CardTitle>
                    <CardDescription>
                      Built-in baseline plus import, export, reset, and manual node editing.
                    </CardDescription>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-4">
                  <input ref={rangeImportRef} type="file" accept=".json,application/json" onChange={handleRangeImport} className="hidden" />

                  <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="space-y-4">
                      <div className="rounded-md border border-border bg-background p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Current source</span>
                          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                            {getSourceBadge(rangeLibrary.activeSource)}
                          </Badge>
                        </div>
                        <p className="mt-3 font-mono text-sm text-white">
                          {getActiveRangeLabel(rangeLibrary)}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Built-in ranges always exist. Imported and manual ranges act as explicit overrides.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Button variant="outline" onClick={() => rangeImportRef.current?.click()}>
                          Import JSON
                        </Button>
                        <Button variant="outline" onClick={handleRangeExport}>
                          Export JSON
                        </Button>
                        <Button variant="outline" onClick={handleSwitchToBaseline}>
                          Use Baseline
                        </Button>
                        <Button variant="outline" onClick={handleSwitchToCustom}>
                          Use Custom
                        </Button>
                        <Button variant="secondary" onClick={handleResetRanges}>
                          Reset To Baseline
                        </Button>
                      </div>

                      {invalidRangeMessage && (
                        <div className="rounded-md border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-300">
                          {invalidRangeMessage}
                        </div>
                      )}

                      <div className="rounded-md border border-border bg-background p-4">
                        <label className="text-xs uppercase tracking-wider text-muted-foreground">Node</label>
                        <select
                          value={selectedRangeNodeKey}
                          onChange={(event) => setSelectedRangeNodeKey(event.target.value)}
                          className="mt-2 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-white"
                        >
                          {editableNodeKeys.map((nodeKey) => (
                            <option key={nodeKey} value={nodeKey}>
                              {nodeKey}
                            </option>
                          ))}
                        </select>
                        {selectedRangeNode && (
                          <div className="mt-3 space-y-1">
                            <p className="text-sm text-white">{selectedRangeNode.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {selectedRangeNode.stackBucket} | source {selectedRangeNode.sourceLabel}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        {RANGE_ACTIONS.map((action) => (
                          <div key={action} className="rounded-md border border-border bg-background p-4">
                            <label className="text-xs uppercase tracking-wider text-muted-foreground">{action}</label>
                            <Textarea
                              value={rangeEditor[action]}
                              onChange={(event) => handleRangeFieldChange(action, event.target.value)}
                              placeholder="e.g. TT+, AQs+, AKo"
                              className="mt-2 min-h-[110px] bg-card font-mono text-xs"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Button onClick={handleSaveRangeNode}>Save Node Override</Button>
                        <Button
                          variant="secondary"
                          onClick={() => setRangeEditor(createEditorState(selectedRangeNode))}
                        >
                          Reset Editor
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </section>

        <section className="order-6">
          <Collapsible>
            <Card className="border-border bg-card">
              <CardHeader>
                <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                  <div>
                    <CardTitle className="text-white">Advanced Review</CardTitle>
                    <CardDescription>Detailed reports and example hands live here when you want to inspect the sample.</CardDescription>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-6">
        <section className="order-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card className="border-border bg-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm uppercase tracking-wider text-muted-foreground">High Priority</p>
                <AlertTriangle className="h-4 w-4 text-orange-400" />
              </div>
              <p className="mt-4 font-mono text-3xl text-white">{summary.severityCounts.High}</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm uppercase tracking-wider text-muted-foreground">Medium Priority</p>
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
              </div>
              <p className="mt-4 font-mono text-3xl text-white">{summary.severityCounts.Medium}</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm uppercase tracking-wider text-muted-foreground">Low Priority</p>
                <AlertTriangle className="h-4 w-4 text-teal-400" />
              </div>
              <p className="mt-4 font-mono text-3xl text-white">{summary.severityCounts.Low}</p>
            </CardContent>
          </Card>
        </section>

        <section className="order-8 grid gap-6 lg:grid-cols-[0.9fr_0.9fr_1.1fr]">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-white">Weighted Leak Report</CardTitle>
              <CardDescription>Top leaks by weighted severity in the visible range-scored sample.</CardDescription>
            </CardHeader>
            <CardContent>
              {report && report.topLeaksByWeightedSeverity.length > 0 ? (
                <div className="space-y-3">
                  {report.topLeaksByWeightedSeverity.map((entry) => (
                    <div key={entry.label} className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-3">
                      <div>
                        <span className="text-sm text-white">{entry.label}</span>
                        <p className="text-xs text-muted-foreground">{entry.count} hands</p>
                      </div>
                      <span className="font-mono text-sm text-primary">{entry.weightedSeverity}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Run analysis to generate a leak report.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-white">Frequency Report</CardTitle>
              <CardDescription>Most common leak labels and mistake types in the visible range-scored sample.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Top Leaks By Frequency</p>
                {report && report.topLeaksByFrequency.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {report.topLeaksByFrequency.map((entry) => (
                      <div key={entry.label} className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-3">
                        <span className="text-sm text-white">{entry.label}</span>
                        <span className="font-mono text-sm text-primary">{entry.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Run analysis to generate frequency data.</p>
                )}
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Top Mistake Types</p>
                {report && report.topMistakeTypes.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {report.topMistakeTypes.map((entry) => (
                      <div key={entry.type} className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-3">
                        <div>
                          <span className="text-sm text-white">{entry.type}</span>
                          <p className="text-xs text-muted-foreground">{entry.count} hands</p>
                        </div>
                        <span className="font-mono text-sm text-primary">{entry.weightedSeverity}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Run analysis to generate mistake-type data.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-white">Results</CardTitle>
              <CardDescription>{filteredResults.length} of {results.length} results visible.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {filteredResults.length > 0 ? (
                filteredResults.map((result) => {
                  const eligibility =
                    gradingEligibilityByHandId.get(result.id) ??
                    result.gradingEligibility ??
                    ({ status: "scored" } satisfies GradingEligibility);

                  return (
                  <div key={result.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-base font-semibold text-white">{result.nodeKey}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {result.heroCards} | {result.heroPosition}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                          {result.branchSummary}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className={cn("border", SEVERITY_STYLES[result.severity])}>
                          {result.severity}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "border",
                            eligibility.status === "scored"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
                          )}
                        >
                          {eligibility.status === "scored" ? "Scored spot" : "Unscored spot"}
                        </Badge>
                        {report?.supported.find((decision) => decision.handId === result.id)?.confidenceTier === "lower_confidence" && (
                          <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-300">
                            Lower confidence
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Actual</span>
                      <span className="rounded bg-card px-2 py-1 font-medium text-white">{result.actualAction}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary">{result.preferredAction}</span>
                    </div>

                    <div className="mt-4">
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">Leak Label</span>
                      <p className="mt-1 text-sm text-white">{result.leakLabel}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {result.mistakeType} | priority {result.priority} | {getSourceBadge(result.rangeSourceUsed)}
                      </p>
                      {eligibility.status === "visible_unscored" && (
                        <p className="mt-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100">
                          {eligibility.message ?? "Excluded from grade scoring for this tournament format."}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 border-t border-border pt-4">
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-white"
                        onClick={() =>
                          setExpandedResults((prev) => ({
                            ...prev,
                            [result.id]: !prev[result.id],
                          }))
                        }
                      >
                        {expandedResults[result.id] ? (
                          <>
                            Hide hand history
                            <ChevronUp className="ml-2 h-4 w-4" />
                          </>
                        ) : (
                          <>
                            View hand history
                            <ChevronDown className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>

                      {expandedResults[result.id] && (
                        <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-card p-3 font-mono text-xs text-muted-foreground whitespace-pre-wrap">
                          {result.handText}
                        </pre>
                      )}
                    </div>
                  </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">
                  No results to show yet. Run the analysis or loosen the filters.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </section>

        <section className="order-9">
          <Collapsible>
            <Card className="border-border bg-card">
              <CardHeader>
                <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                  <div>
                    <CardTitle className="text-white">Debug Diagnostics</CardTitle>
                    <CardDescription>
                      Detailed counts, exclusion reasons, range-source visibility, and branch support.
                    </CardDescription>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Raw Hands</p>
                      <p className="mt-2 font-mono text-xl text-white">{debugSummary?.rawHands ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Parsed Hands</p>
                      <p className="mt-2 font-mono text-xl text-white">{debugSummary?.parsedHands ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Classified Hands</p>
                      <p className="mt-2 font-mono text-xl text-white">{debugSummary?.classifiedHands ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Range-Scored</p>
                      <p className="mt-2 font-mono text-xl text-white">{debugSummary?.scoredHands ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Lower Confidence</p>
                      <p className="mt-2 font-mono text-xl text-white">{debugSummary?.lowerConfidenceDecisions ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Scored Spots</p>
                      <p className="mt-2 font-mono text-xl text-white">{gradingEligibilitySummary.scoredDecisions}</p>
                    </div>
                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Unscored Spots</p>
                      <p className="mt-2 font-mono text-xl text-white">{gradingEligibilitySummary.visibleUnscoredDecisions}</p>
                    </div>
                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Unsupported</p>
                      <p className="mt-2 font-mono text-xl text-white">{debugSummary?.excludedDecisions ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Model Coverage</p>
                      <p className="mt-2 font-mono text-xl text-white">
                        {debugSummary ? `${debugSummary.modelCoverage.toFixed(1)}%` : "0.0%"}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Opportunity Loss Breakdown</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {[
                          ["Uploaded hands", debugSummary?.rawHands ?? 0],
                          ["Hands with hero preflop decision", debugSummary?.handsWithHeroDecision ?? 0],
                          ["Supported opportunities", debugSummary?.scoredHands ?? 0],
                          ["Unsupported opportunities", debugSummary?.unsupportedSpots ?? 0],
                          ["Bounty-sensitive exclusions", gradingEligibilitySummary.visibleUnscoredDecisions],
                          ["Unknown position", debugSummary?.unknownPositionSpots ?? 0],
                          ["Unsupported node", debugSummary?.unsupportedNodeSpots ?? 0],
                          ["Malformed / parse issue", debugSummary?.malformedHands ?? 0],
                          ["Model scope rules", debugSummary?.modelScopeExclusions ?? 0],
                        ].map(([label, count]) => (
                          <div key={label} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                            <span className="text-sm text-white">{label}</span>
                            <span className="font-mono text-sm text-muted-foreground">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Skipped Hands By Reason</p>
                      <p className="mt-2 text-sm text-muted-foreground">Each skipped hand is assigned exactly one category.</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {(debugSummary?.skipReasonBreakdown ?? []).map((entry) => (
                          <div key={entry.reason} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                            <span className="font-mono text-sm text-white">{entry.reason}</span>
                            <span className="font-mono text-sm text-muted-foreground">{entry.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Opportunities By Action</p>
                      {debugSummary && debugSummary.decisionOpportunitiesByAction.length > 0 ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                          {debugSummary.decisionOpportunitiesByAction.map((entry) => (
                            <div key={entry.action} className="rounded-md border border-border bg-card px-3 py-2">
                              <p className="font-mono text-sm text-white">{entry.action}</p>
                              <p className="mt-1 font-mono text-lg text-primary">{entry.count}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">Run analysis to see action opportunity counts.</p>
                      )}
                    </div>

                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Selected Node Stack Buckets</p>
                      {selectedNodeStackDiagnostics ? (
                        <div className="mt-4 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-md border border-border bg-card px-3 py-2">
                              <p className="text-xs text-muted-foreground">{selectedNodeStackDiagnostics.label}</p>
                              <p className="mt-1 font-mono text-lg text-white">{selectedNodeStackDiagnostics.total}</p>
                              <p className="text-xs text-muted-foreground">total opportunities</p>
                              <p className="text-[11px] text-muted-foreground">full uploaded sample</p>
                            </div>
                            <div className="rounded-md border border-border bg-card px-3 py-2">
                              <p className="text-xs text-muted-foreground">Rolling scored opportunities</p>
                              <p className="mt-1 font-mono text-lg text-white">{selectedNodeStackDiagnostics.rollingTotal}</p>
                            </div>
                            <div className="rounded-md border border-border bg-card px-3 py-2">
                              <p className="text-xs text-muted-foreground">Valid / missing stack BB</p>
                              <p className="mt-1 font-mono text-lg text-white">
                                {selectedNodeStackDiagnostics.validStackCount}/{selectedNodeStackDiagnostics.missingStackCount}
                              </p>
                            </div>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-3">
                            {selectedNodeStackDiagnostics.bucketCounts.map((entry) => {
                              const rollingEntry = selectedNodeStackDiagnostics.rollingBucketCounts.find(
                                (rolling) => rolling.bucket === entry.bucket,
                              );
                              return (
                                <div key={entry.bucket} className="rounded-md border border-border bg-card px-3 py-2">
                                  <div className="flex items-center justify-between">
                                    <span className="font-mono text-sm text-white">{entry.bucket}</span>
                                    <span className="font-mono text-sm text-primary">{entry.count}</span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    full opportunities | rolling scored {rollingEntry?.count ?? 0}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                          <div className="overflow-x-auto rounded-md border border-border bg-card">
                            <table className="min-w-full text-left text-xs">
                              <thead className="text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2">Hand id</th>
                                  <th className="px-3 py-2">Hero chips</th>
                                  <th className="px-3 py-2">BB</th>
                                  <th className="px-3 py-2">Effective chips</th>
                                  <th className="px-3 py-2">Effective BB</th>
                                  <th className="px-3 py-2">Bucket</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedNodeStackDiagnostics.examples.map((entry) => (
                                  <tr key={entry.handId} className="border-t border-border">
                                    <td className="px-3 py-2 font-mono text-white">{entry.handId}</td>
                                    <td className="px-3 py-2 font-mono text-muted-foreground">{entry.heroStackChips}</td>
                                    <td className="px-3 py-2 font-mono text-muted-foreground">{entry.bigBlindAmount ?? "missing"}</td>
                                    <td className="px-3 py-2 font-mono text-muted-foreground">{entry.effectiveStackChips}</td>
                                    <td className="px-3 py-2 font-mono text-muted-foreground">{entry.effectiveStackInBlinds.toFixed(1)}</td>
                                    <td className="px-3 py-2 font-mono text-primary">{entry.stackBucket}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">
                          Select a position and action, such as CO then RFI, to inspect stack bucket counts for that node.
                        </p>
                      )}
                    </div>

                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Exclusion Watchlist</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {[
                          ["Multiway excluded", getExclusionCount(report, "unsupported_multiway_branch")],
                          ["Limp pots excluded", 0],
                          ["Unknown position", getExclusionCount(report, "unknown_position")],
                          ["Unsupported node", getExclusionCount(report, "unsupported_node")],
                          ["Bounty-sensitive exclusion", gradingEligibilitySummary.visibleUnscoredDecisions],
                        ].map(([label, count]) => (
                          <div key={label} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                            <span className="text-sm text-white">{label}</span>
                            <span className="font-mono text-sm text-muted-foreground">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-md border border-border bg-background p-4 lg:col-span-2">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Skipped Hand Log</p>
                      {debugSummary && debugSummary.skippedHands.length > 0 ? (
                        <div className="mt-4 max-h-80 overflow-auto rounded-md border border-border bg-card">
                          <table className="min-w-full text-left text-xs">
                            <thead className="sticky top-0 bg-card text-muted-foreground">
                              <tr>
                                <th className="px-3 py-2">Hand id</th>
                                <th className="px-3 py-2">Reason</th>
                                <th className="px-3 py-2">Node</th>
                                <th className="px-3 py-2">Message</th>
                              </tr>
                            </thead>
                            <tbody>
                              {debugSummary.skippedHands.map((entry, index) => (
                                <tr key={`${entry.handId}-${index}`} className="border-t border-border">
                                  <td className="px-3 py-2 font-mono text-white">{entry.handId}</td>
                                  <td className="px-3 py-2 font-mono text-primary">{entry.reason}</td>
                                  <td className="px-3 py-2 font-mono text-muted-foreground">{entry.nodeKey ?? "-"}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{entry.message}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">Run analysis to see skipped hand logs.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md border border-border bg-background p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Active Range Source</p>
                      <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                      {debugSummary ? getSourceBadge(debugSummary.activeRangeSource) : getSourceBadge(rangeLibrary.activeSource)}
                    </Badge>
                  </div>
                  <p className="mt-2 font-mono text-sm text-white">
                      {debugSummary?.activeRangeLabel ?? getActiveRangeLabel(rangeLibrary)}
                  </p>
                    {report?.invalidRangeMessage && (
                      <p className="mt-2 text-sm text-orange-300">{report.invalidRangeMessage}</p>
                    )}
                  </div>

                  <div className="rounded-md border border-border bg-background p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Top Exclusion Reasons</p>
                    {debugSummary && debugSummary.exclusionCounts.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {debugSummary.exclusionCounts.map((entry) => (
                          <div key={entry.reason} className="flex items-center justify-between">
                            <span className="text-sm text-white">{getUserFacingExclusionReason(entry.reason)}</span>
                            <span className="font-mono text-sm text-muted-foreground">
                              {entry.count} ({entry.percentage.toFixed(1)}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">Run analysis to see exclusion breakdown.</p>
                    )}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Worst Nodes By Weighted Severity</p>
                      {report && report.topNodesByWeightedSeverity.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          {report.topNodesByWeightedSeverity.map((entry) => (
                            <div key={entry.nodeKey} className="flex items-center justify-between">
                              <div className="min-w-0">
                                <p className="truncate font-mono text-sm text-white">{entry.nodeKey}</p>
                                <p className="text-xs text-muted-foreground">
                                  {entry.count} hands | support {entry.nodeSupport}
                                </p>
                              </div>
                              <span className="font-mono text-sm text-primary">{entry.weightedSeverity}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">Run analysis to see node ranking.</p>
                      )}
                    </div>

                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Worst Positions By Weighted Severity</p>
                      {report && report.topPositionsByWeightedSeverity.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          {report.topPositionsByWeightedSeverity.map((entry) => (
                            <div key={entry.position} className="flex items-center justify-between">
                              <div>
                                <p className="font-mono text-sm text-white">{entry.position}</p>
                                <p className="text-xs text-muted-foreground">{entry.count} hands</p>
                              </div>
                              <span className="font-mono text-sm text-primary">{entry.weightedSeverity}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">Run analysis to see position ranking.</p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Nodes With Weak Baseline Support</p>
                      {report && report.weakSupportNodes.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          {report.weakSupportNodes.map((entry) => (
                            <div key={entry.nodeKey} className="flex items-center justify-between">
                              <span className="truncate font-mono text-sm text-white">{entry.nodeKey}</span>
                              <span className="font-mono text-sm text-muted-foreground">{entry.count}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">No weak-support nodes in the current scored set.</p>
                      )}
                    </div>

                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Nodes Using Fallback Logic</p>
                      {report && report.fallbackNodes.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          {report.fallbackNodes.map((entry) => (
                            <div key={entry.nodeKey} className="flex items-center justify-between">
                              <span className="truncate font-mono text-sm text-white">{entry.nodeKey}</span>
                              <span className="font-mono text-sm text-muted-foreground">{entry.count}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">No fallback nodes in the current scored set.</p>
                      )}
                    </div>

                    <div className="rounded-md border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Nodes Overridden By Custom Ranges</p>
                      {report && report.overriddenNodes.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          {report.overriddenNodes.map((entry) => (
                            <div key={entry.nodeKey} className="flex items-center justify-between">
                              <span className="truncate font-mono text-sm text-white">{entry.nodeKey}</span>
                              <span className="font-mono text-sm text-muted-foreground">{entry.count}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">No custom overrides were used in the current run.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md border border-border bg-background p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Nodes Missing Valid Ranges</p>
                    {report && report.missingRangeNodes.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {report.missingRangeNodes.map((entry) => (
                          <div key={entry.nodeKey} className="flex items-center justify-between">
                            <span className="truncate font-mono text-sm text-white">{entry.nodeKey}</span>
                            <span className="font-mono text-sm text-muted-foreground">{entry.count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">No missing range nodes in the current run.</p>
                    )}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </section>
      </main>
    </div>
  );
}
