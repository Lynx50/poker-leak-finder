import { buildPositionMap } from "./parser";
import {
  BlindVsBlindGradeCard,
  BlindVsBlindLeakBucket,
  BlindVsBlindLeakHand,
  BlindVsBlindOpportunity,
  BlindVsBlindPostflopAction,
  BlindVsBlindPostflopRole,
  BlindVsBlindPotType,
  BlindVsBlindPreflopBranch,
  BlindVsBlindReport,
  BlindVsBlindStackBucket,
  ParsedAction,
  ParsedHand,
  ParsedStreet,
  Position,
} from "./types";

const BVB_STACK_BUCKETS: BlindVsBlindStackBucket[] = ["0-10bb", "10-15bb", "15-25bb", "25-40bb", "40bb+"];
const TRACKED_STREETS: ParsedStreet[] = ["flop", "turn", "river"];

function toBlindCount(amount: number, bigBlindAmount: number | null) {
  return bigBlindAmount ? amount / bigBlindAmount : 0;
}

function getStackBucket(stackInBlinds: number): BlindVsBlindStackBucket {
  if (stackInBlinds < 10) return "0-10bb";
  if (stackInBlinds < 15) return "10-15bb";
  if (stackInBlinds < 25) return "15-25bb";
  if (stackInBlinds < 40) return "25-40bb";
  return "40bb+";
}

function getSeatByPosition(hand: ParsedHand, position: Position) {
  const positionMap = buildPositionMap(hand.seats, hand.buttonSeat);
  return hand.seats.find((seat) => positionMap.get(seat.name) === position);
}

function getEffectiveStackInBlinds(hand: ParsedHand) {
  const sb = getSeatByPosition(hand, "SB");
  const bb = getSeatByPosition(hand, "BB");
  if (!sb || !bb) return 0;
  return toBlindCount(Math.min(sb.stack, bb.stack), hand.bigBlindAmount);
}

function getEffectiveStackInChips(hand: ParsedHand) {
  const sb = getSeatByPosition(hand, "SB");
  const bb = getSeatByPosition(hand, "BB");
  if (!sb || !bb) return 0;
  return Math.min(sb.stack, bb.stack);
}

function getActorStackInChips(hand: ParsedHand, actorPosition: "SB" | "BB") {
  return getSeatByPosition(hand, actorPosition)?.stack ?? null;
}

function getActorStackInBlinds(hand: ParsedHand, actorPosition: "SB" | "BB") {
  const chips = getActorStackInChips(hand, actorPosition);
  return chips !== null ? toBlindCount(chips, hand.bigBlindAmount) : null;
}

function isVoluntary(action: ParsedAction) {
  return ["fold", "check", "call", "bet", "raise"].includes(action.type);
}

function classifyRaise(action: ParsedAction, allInLabel: string, nonAllInLabel: string) {
  return action.isAllIn ? allInLabel : nonAllInLabel;
}

function summarizeActions(hand: ParsedHand, street?: ParsedStreet) {
  const actions = street ? hand.postflopActions[street] : hand.preflopActions;
  const summary = actions
    .filter(isVoluntary)
    .map((action) => action.raw)
    .join(" / ");
  return summary || "No action summary available";
}

function makeOpportunity(
  hand: ParsedHand,
  branch: BlindVsBlindPreflopBranch,
  actorPosition: "SB" | "BB",
  action: string,
  effectiveStackInBlinds: number,
  extra: Partial<BlindVsBlindOpportunity> = {},
): BlindVsBlindOpportunity {
  return {
    handId: hand.id,
    branch,
    action,
    actorPosition,
    stackBucket: getStackBucket(effectiveStackInBlinds),
    effectiveStackInBlinds,
    effectiveStackInChips: getEffectiveStackInChips(hand),
    actorStackInChips: getActorStackInChips(hand, actorPosition),
    actorStackInBlinds: getActorStackInBlinds(hand, actorPosition),
    heroCards: hand.heroCards.shorthand || hand.heroCards.raw || "--",
    heroCardsRaw: hand.heroCards.raw,
    actionSummary: summarizeActions(hand, extra.street),
    rawHand: hand.raw,
    ...extra,
  };
}

function getBlindPlayers(hand: ParsedHand) {
  const sb = getSeatByPosition(hand, "SB");
  const bb = getSeatByPosition(hand, "BB");
  if (!sb || !bb) return null;
  return { sb: sb.name, bb: bb.name };
}

function isFoldedToSmallBlind(hand: ParsedHand, sbName: string) {
  const firstSbActionIndex = hand.preflopActions.findIndex((action) => action.player === sbName && isVoluntary(action));
  if (firstSbActionIndex === -1) return false;

  return hand.preflopActions.slice(0, firstSbActionIndex).every((action) => {
    if (!isVoluntary(action)) return true;
    if (action.player === sbName) return true;
    return action.type === "fold";
  });
}

function findNextAction(actions: ParsedAction[], player: string, afterIndex: number) {
  const index = actions.findIndex((action, actionIndex) => actionIndex > afterIndex && action.player === player && isVoluntary(action));
  return index === -1 ? null : { action: actions[index], index };
}

function classifyPostflopAction(action: ParsedAction, role: BlindVsBlindPostflopRole, bigBlindAmount: number | null): BlindVsBlindPostflopAction | null {
  if (action.type === "check") return role === "ip_bb" ? "check_back" : "check";
  if (action.type === "raise") return action.isAllIn ? "jam" : "raise";
  if (action.type !== "bet") return null;
  if (action.isAllIn) return "jam";

  const betInBlinds = toBlindCount(action.amount ?? action.toAmount ?? 0, bigBlindAmount);
  return betInBlinds <= 2.5 ? "bet_small" : "bet_big";
}

function classifyPreflop(hand: ParsedHand): {
  opportunities: BlindVsBlindOpportunity[];
  potType: BlindVsBlindPotType | null;
  effectiveStackInBlinds: number;
} {
  const blinds = getBlindPlayers(hand);
  if (!blinds || !isFoldedToSmallBlind(hand, blinds.sb)) {
    return { opportunities: [], potType: null, effectiveStackInBlinds: 0 };
  }

  const effectiveStackInBlinds = getEffectiveStackInBlinds(hand);
  const actions = hand.preflopActions;
  const sbFirst = findNextAction(actions, blinds.sb, -1);
  if (!sbFirst) return { opportunities: [], potType: null, effectiveStackInBlinds };

  const opportunities: BlindVsBlindOpportunity[] = [];
  const sbAction = sbFirst.action;
  let potType: BlindVsBlindPotType | null = null;

  if (sbAction.type === "fold") {
    opportunities.push(makeOpportunity(hand, "sb_unopened", "SB", "fold", effectiveStackInBlinds));
    return { opportunities, potType, effectiveStackInBlinds };
  }

  if (sbAction.type === "call") {
    opportunities.push(makeOpportunity(hand, "sb_unopened", "SB", "limp", effectiveStackInBlinds));
    const bbResponse = findNextAction(actions, blinds.bb, sbFirst.index);
    if (!bbResponse) return { opportunities, potType, effectiveStackInBlinds };

    if (bbResponse.action.type === "check") {
      opportunities.push(makeOpportunity(hand, "bb_vs_sb_limp", "BB", "check", effectiveStackInBlinds));
      potType = "limped_pot";
      return { opportunities, potType, effectiveStackInBlinds };
    }

    if (bbResponse.action.type === "raise") {
      const bbAction = classifyRaise(bbResponse.action, "jam", "raise_non_all_in");
      opportunities.push(makeOpportunity(hand, "bb_vs_sb_limp", "BB", bbAction, effectiveStackInBlinds));
      const sbResponse = findNextAction(actions, blinds.sb, bbResponse.index);
      if (!sbResponse) return { opportunities, potType, effectiveStackInBlinds };

      if (sbResponse.action.type === "fold") {
        opportunities.push(makeOpportunity(hand, "sb_vs_bb_iso", "SB", "fold_vs_iso", effectiveStackInBlinds));
      } else if (sbResponse.action.type === "call") {
        opportunities.push(makeOpportunity(hand, "sb_vs_bb_iso", "SB", "call_vs_iso", effectiveStackInBlinds));
        potType = "iso_pot";
      } else if (sbResponse.action.type === "raise") {
        opportunities.push(
          makeOpportunity(
            hand,
            "sb_vs_bb_iso",
            "SB",
            classifyRaise(sbResponse.action, "limp_jam", "limp_reraise_non_all_in"),
            effectiveStackInBlinds,
          ),
        );
      }
    }

    return { opportunities, potType, effectiveStackInBlinds };
  }

  if (sbAction.type === "raise") {
    const openAction = classifyRaise(sbAction, "jam", "raise_non_all_in");
    opportunities.push(makeOpportunity(hand, "sb_unopened", "SB", openAction, effectiveStackInBlinds));
    const bbResponse = findNextAction(actions, blinds.bb, sbFirst.index);
    if (!bbResponse) return { opportunities, potType, effectiveStackInBlinds };

    if (bbResponse.action.type === "fold") {
      opportunities.push(makeOpportunity(hand, "bb_vs_sb_open", "BB", "fold_vs_open", effectiveStackInBlinds));
    } else if (bbResponse.action.type === "call") {
      opportunities.push(makeOpportunity(hand, "bb_vs_sb_open", "BB", "call_vs_open", effectiveStackInBlinds));
      potType = "raised_pot";
    } else if (bbResponse.action.type === "raise") {
      opportunities.push(
        makeOpportunity(
          hand,
          "bb_vs_sb_open",
          "BB",
          classifyRaise(bbResponse.action, "threebet_jam", "threebet_non_all_in"),
          effectiveStackInBlinds,
        ),
      );
      const sbResponse = findNextAction(actions, blinds.sb, bbResponse.index);
      if (!sbResponse) return { opportunities, potType, effectiveStackInBlinds };

      if (sbResponse.action.type === "fold") {
        opportunities.push(makeOpportunity(hand, "sb_vs_bb_3bet", "SB", "fold", effectiveStackInBlinds));
      } else if (sbResponse.action.type === "call") {
        opportunities.push(makeOpportunity(hand, "sb_vs_bb_3bet", "SB", "call", effectiveStackInBlinds));
        potType = "3bet_pot";
      } else if (sbResponse.action.type === "raise") {
        opportunities.push(makeOpportunity(hand, "sb_vs_bb_3bet", "SB", "fourbet_jam", effectiveStackInBlinds));
      }
    }
  }

  return { opportunities, potType, effectiveStackInBlinds };
}

function classifyPostflop(hand: ParsedHand, potType: BlindVsBlindPotType | null, effectiveStackInBlinds: number) {
  if (!potType) return [];
  const blinds = getBlindPlayers(hand);
  if (!blinds) return [];

  const opportunities: BlindVsBlindOpportunity[] = [];
  for (const street of TRACKED_STREETS) {
    for (const action of hand.postflopActions[street]) {
      const role: BlindVsBlindPostflopRole | null =
        action.player === blinds.sb ? "oop_sb" : action.player === blinds.bb ? "ip_bb" : null;
      if (!role) continue;

      const postflopAction = classifyPostflopAction(action, role, hand.bigBlindAmount);
      if (!postflopAction) continue;

      opportunities.push(
        makeOpportunity(hand, potType === "limped_pot" ? "bb_vs_sb_limp" : "bb_vs_sb_open", role === "oop_sb" ? "SB" : "BB", postflopAction, effectiveStackInBlinds, {
          potType,
          street,
          postflopRole: role,
        }),
      );
    }
  }
  return opportunities;
}

function ratio(count: number, total: number) {
  return total > 0 ? count / total : 0;
}

function toGrade(leakRate: number): BlindVsBlindGradeCard["grade"] {
  if (leakRate <= 0.08) return "A";
  if (leakRate <= 0.14) return "B";
  if (leakRate <= 0.22) return "C";
  if (leakRate <= 0.32) return "D";
  return "F";
}

function toLeakHand(opportunity: BlindVsBlindOpportunity): BlindVsBlindLeakHand {
  return {
    handId: opportunity.handId,
    heroCards: opportunity.heroCards,
    heroCardsRaw: opportunity.heroCardsRaw,
    displayContext: opportunity.actorPosition,
    branch: opportunity.branch,
    action: opportunity.action,
    actorPosition: opportunity.actorPosition,
    stackBucket: opportunity.stackBucket,
    effectiveStackInBlinds: opportunity.effectiveStackInBlinds,
    actorStackInBlinds: opportunity.actorStackInBlinds,
    actionSummary: opportunity.actionSummary,
    rawHand: opportunity.rawHand,
    potType: opportunity.potType,
    street: opportunity.street,
    postflopRole: opportunity.postflopRole,
  };
}

function makeLeakBucket(
  key: string,
  label: string,
  opportunities: BlindVsBlindOpportunity[],
  predicate: ((opportunity: BlindVsBlindOpportunity) => boolean) | null,
): BlindVsBlindLeakBucket {
  const matched = predicate ? opportunities.filter(predicate) : [];
  return {
    key,
    label,
    supported: Boolean(predicate),
    count: matched.length,
    hands: matched.map(toLeakHand),
  };
}

function makeGradeCard(
  key: string,
  label: string,
  opportunities: BlindVsBlindOpportunity[],
  actionFrequencyLabel: string,
  actionFrequencyPredicate: (opportunity: BlindVsBlindOpportunity) => boolean,
  leakBuckets: BlindVsBlindLeakBucket[],
  note: string,
): BlindVsBlindGradeCard {
  const leakCount = leakBuckets.filter((bucket) => bucket.supported).reduce((sum, bucket) => sum + bucket.count, 0);
  const leakRate = ratio(leakCount, opportunities.length);
  const takenCount = opportunities.filter(actionFrequencyPredicate).length;
  return {
    key,
    label,
    grade: opportunities.length >= 8 ? toGrade(leakRate) : "N/A",
    opportunities: opportunities.length,
    leakCount,
    leakRate,
    note,
    actionFrequency: {
      label: actionFrequencyLabel,
      actualPercent: ratio(takenCount, opportunities.length),
      opportunities: opportunities.length,
      takenCount,
    },
    leakBuckets,
  };
}

export function buildBlindVsBlindReport(parsedHands: ParsedHand[]): BlindVsBlindReport {
  const opportunities: BlindVsBlindOpportunity[] = [];
  let bvbHands = 0;

  for (const hand of parsedHands) {
    const preflop = classifyPreflop(hand);
    if (preflop.opportunities.length === 0) continue;
    bvbHands += 1;
    opportunities.push(...preflop.opportunities);
    opportunities.push(...classifyPostflop(hand, preflop.potType, preflop.effectiveStackInBlinds));
  }

  const byBranch = (branch: BlindVsBlindPreflopBranch) => opportunities.filter((opportunity) => opportunity.branch === branch && !opportunity.street);
  const byPot = (potType: BlindVsBlindPotType) => opportunities.filter((opportunity) => opportunity.potType === potType);

  const sbUnopened = byBranch("sb_unopened");
  const bbVsSbLimp = byBranch("bb_vs_sb_limp");
  const sbVsBbIso = byBranch("sb_vs_bb_iso");
  const limpedPot = byPot("limped_pot");
  const raisedPostflop = [...byPot("raised_pot"), ...byPot("3bet_pot")];
  const shortStackJamDecisions = opportunities.filter((o) => o.effectiveStackInBlinds <= 25);

  const gradeCards = [
    makeGradeCard(
      "sb_unopened",
      "SB unopened strategy",
      sbUnopened,
      "Raise/jam",
      (o) => o.action === "raise_non_all_in" || o.action === "jam",
      [
        makeLeakBucket("passed_up_opens", "Passed Up Opens", sbUnopened, (o) => o.action === "limp" || o.action === "fold"),
        makeLeakBucket("opened_too_wide", "Opened Too Wide", sbUnopened, null),
      ],
      "Flags possible over-limping and missed first-in aggression.",
    ),
    makeGradeCard(
      "bb_vs_sb_limp",
      "BB vs SB limp",
      bbVsSbLimp,
      "Iso raise",
      (o) => o.action === "raise_non_all_in" || o.action === "jam",
      [
        makeLeakBucket("missed_isos", "Missed Isos", bbVsSbLimp, (o) => o.action === "check"),
        makeLeakBucket("isoed_too_wide", "Isoed Too Wide", bbVsSbLimp, null),
      ],
      "Flags passive checks when BB may have iso opportunities.",
    ),
    makeGradeCard(
      "sb_vs_bb_iso",
      "SB vs BB iso",
      sbVsBbIso,
      "Continue",
      (o) => o.action === "call_vs_iso" || o.action === "limp_jam" || o.action === "limp_reraise_non_all_in",
      [
        makeLeakBucket("folded_too_much", "Folded Too Much", sbVsBbIso, (o) => o.action === "fold_vs_iso"),
        makeLeakBucket("continued_too_wide", "Continued Too Wide", sbVsBbIso, (o) => o.action === "call_vs_iso"),
      ],
      "Flags limp/calls and over-continuing versus isolation raises.",
    ),
    makeGradeCard(
      "limped_pot_postflop",
      "Limped pot postflop",
      limpedPot,
      "Bet/raise",
      (o) => o.action === "bet_small" || o.action === "bet_big" || o.action === "raise" || o.action === "jam",
      [
        makeLeakBucket("bet_too_little", "Bet Too Little", limpedPot, (o) => o.action === "check" || o.action === "check_back"),
        makeLeakBucket("bet_too_often", "Bet Too Often", limpedPot, null),
      ],
      "Tracks passive flop-through-river play after SB limp and BB check.",
    ),
    makeGradeCard(
      "raised_pot_postflop",
      "Raised pot postflop",
      raisedPostflop,
      "Bet/raise",
      (o) => o.action === "bet_small" || o.action === "bet_big" || o.action === "raise" || o.action === "jam",
      [
        makeLeakBucket("bet_too_little", "Bet Too Little", raisedPostflop, (o) => o.action === "check" || o.action === "check_back"),
        makeLeakBucket("bet_too_often", "Bet Too Often", raisedPostflop, null),
      ],
      "Tracks postflop passivity in raised and 3-bet blind battles.",
    ),
    makeGradeCard(
      "jam_decisions",
      "Jam decisions by stack depth",
      shortStackJamDecisions,
      "Jam",
      (o) => /jam/i.test(o.action),
      [
        makeLeakBucket("passed_on_jam", "Passed on Jam", shortStackJamDecisions, (o) => !/jam/i.test(o.action)),
        makeLeakBucket("jammed_too_wide", "Jammed Too Wide", shortStackJamDecisions, null),
      ],
      "Highlights low-stack BvB decisions that did not become jams.",
    ),
  ];

  const preflopCounts = Object.entries(
    opportunities
      .filter((opportunity) => !opportunity.street)
      .reduce<Record<string, number>>((acc, opportunity) => {
        const key = `${opportunity.branch}|${opportunity.action}`;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
  ).map(([key, count]) => {
    const [branch, action] = key.split("|");
    return { branch: branch as BlindVsBlindPreflopBranch, action, count };
  });

  const postflopCounts = Object.entries(
    opportunities
      .filter((opportunity) => opportunity.street && opportunity.potType && opportunity.postflopRole)
      .reduce<Record<string, number>>((acc, opportunity) => {
        const key = `${opportunity.potType}|${opportunity.street}|${opportunity.postflopRole}|${opportunity.action}`;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
  ).map(([key, count]) => {
    const [potType, street, role, action] = key.split("|");
    return {
      potType: potType as BlindVsBlindPotType,
      street: street as ParsedStreet,
      role: role as "oop_sb" | "ip_bb",
      action: action as BlindVsBlindPostflopAction,
      count,
    };
  });

  const stackSummary = BVB_STACK_BUCKETS.map((bucket) => {
    const bucketOpportunities = opportunities.filter((opportunity) => opportunity.stackBucket === bucket);
    const jams = bucketOpportunities.filter((opportunity) => /jam/i.test(opportunity.action)).length;
    return {
      bucket,
      opportunities: bucketOpportunities.length,
      jams,
      jamRate: ratio(jams, bucketOpportunities.length),
    };
  });

  const topLeaks = gradeCards
    .filter((card) => card.leakCount > 0)
    .sort((a, b) => b.leakCount - a.leakCount || b.leakRate - a.leakRate)
    .slice(0, 5)
    .map((card) => ({ label: card.note, count: card.leakCount }));

  return {
    totalHands: parsedHands.length,
    bvbHands,
    opportunities,
    gradeCards,
    stackSummary,
    preflopCounts,
    postflopCounts,
    topLeaks,
  };
}
