import test from "node:test";
import assert from "node:assert/strict";

import { buildBlindVsBlindReport } from "./blind-vs-blind";
import { classifyPreflopOpportunity, scorePreflopOpportunity } from "./classifier";
import { parseHand } from "./parser";
import { determineBaselineSourceType, determinePreflopFamily } from "./preflop-engine";
import { getDefaultRangeLibraryState } from "./range-store";
import { resolveRangeDecision } from "./ranges";
import { scoreDecision } from "./scoring";

const defaultRanges = getDefaultRangeLibraryState();

test("parser keeps preflop action order and assigns hero position", () => {
  const hand = parseHand(`PokerStars Hand #700000000001: Tournament #111, $1.00+$0.10 USD Hold'em No Limit - Level I (10/20) - 2026/04/23 12:00:00 ET
Table '111 1' 6-max Seat #1 is the button
Seat 1: Btn (1500 in chips)
Seat 2: Sb (1500 in chips)
Seat 3: Bb (1500 in chips)
Seat 4: Hero (1500 in chips)
Seat 5: Hj (1500 in chips)
Seat 6: Co (1500 in chips)
Sb: posts small blind 10
Bb: posts big blind 20
*** HOLE CARDS ***
Dealt to Hero [As Kd]
Hero: raises 40 to 60
Hj: folds
Co: folds
Btn: folds
Sb: folds
Bb: folds
*** SUMMARY ***`);

  assert.ok(hand);
  assert.equal(hand.heroPosition, "LJ");
  assert.deepEqual(
    hand.preflopActions.filter((action) => ["raise", "fold"].includes(action.type)).map((action) => `${action.player}:${action.type}`),
    ["Hero:raise", "Hj:fold", "Co:fold", "Btn:fold", "Sb:fold", "Bb:fold"],
  );
});

test("classifier computes effective stack in BB for short-stack reshove spots", () => {
  const hand = parseHand(`PokerStars Hand #700000000002: Tournament #111, $1.00+$0.10 USD Hold'em No Limit - Level I (10/20) - 2026/04/23 12:00:00 ET
Table '111 1' 6-max Seat #1 is the button
Seat 1: Btn (1500 in chips)
Seat 2: Sb (1500 in chips)
Seat 3: Bb (1500 in chips)
Seat 4: Lj (1500 in chips)
Seat 5: Hj (1500 in chips)
Seat 6: Hero (148 in chips)
Sb: posts small blind 10
Bb: posts big blind 20
*** HOLE CARDS ***
Dealt to Hero [Qs Qh]
Lj: folds
Hj: raises 40 to 60
Hero: raises 88 to 148 and is all-in
Btn: folds
Sb: folds
Bb: folds
*** SUMMARY ***`);

  assert.ok(hand);
  const opportunity = classifyPreflopOpportunity(hand);
  assert.ok(!("reason" in opportunity));
  assert.equal(opportunity.effectiveStackInBlinds, 7.4);
  assert.equal(opportunity.stackBucket, "10–15bb");
});

test("blind-vs-blind detection captures folded-to-sb branches", () => {
  const hand = parseHand(`PokerStars Hand #700000000003: Tournament #111, $1.00+$0.10 USD Hold'em No Limit - Level I (10/20) - 2026/04/23 12:00:00 ET
Table '111 1' 6-max Seat #1 is the button
Seat 1: Btn (1500 in chips)
Seat 2: Sb (1500 in chips)
Seat 3: Bb (1500 in chips)
Seat 4: Utg (1500 in chips)
Seat 5: Hj (1500 in chips)
Seat 6: Co (1500 in chips)
Sb: posts small blind 10
Bb: posts big blind 20
*** HOLE CARDS ***
Dealt to Btn [Ah Kh]
Utg: folds
Hj: folds
Co: folds
Btn: folds
Sb: calls 10
Bb: checks
*** FLOP *** [2c 7d Jh]
Sb: checks
Bb: checks
*** SUMMARY ***`);

  assert.ok(hand);
  const report = buildBlindVsBlindReport([hand]);
  assert.equal(report.bvbHands, 1);
  assert.ok(report.preflopCounts.some((entry) => entry.branch === "bb_vs_sb_limp" && entry.action === "check"));
});

test("strict family routing identifies reshove vs open separately from generic facing-open spots", () => {
  const hand = parseHand(`PokerStars Hand #700000000004: Tournament #111, $1.00+$0.10 USD Hold'em No Limit - Level I (10/20) - 2026/04/23 12:00:00 ET
Table '111 1' 6-max Seat #1 is the button
Seat 1: Btn (1500 in chips)
Seat 2: Sb (1500 in chips)
Seat 3: Bb (1500 in chips)
Seat 4: Lj (1500 in chips)
Seat 5: Hj (1500 in chips)
Seat 6: Hero (148 in chips)
Sb: posts small blind 10
Bb: posts big blind 20
*** HOLE CARDS ***
Dealt to Hero [Qs Qh]
Lj: folds
Hj: raises 40 to 60
Hero: raises 88 to 148 and is all-in
Btn: folds
Sb: folds
Bb: folds
*** SUMMARY ***`);

  assert.ok(hand);
  const opportunity = classifyPreflopOpportunity(hand);
  assert.ok(!("reason" in opportunity));
  assert.equal(determinePreflopFamily({
    ...opportunity,
    preferredAction: "Fold",
  }), "reshove_vs_open");
});

test("baseline selection records exact node matches and keeps unsupported paths neutral", () => {
  const hand = parseHand(`PokerStars Hand #700000000005: Tournament #111, $1.00+$0.10 USD Hold'em No Limit - Level I (10/20) - 2026/04/23 12:00:00 ET
Table '111 1' 6-max Seat #1 is the button
Seat 1: Btn (1500 in chips)
Seat 2: Sb (1500 in chips)
Seat 3: Bb (1500 in chips)
Seat 4: Lj (1500 in chips)
Seat 5: Hj (1500 in chips)
Seat 6: Hero (148 in chips)
Sb: posts small blind 10
Bb: posts big blind 20
*** HOLE CARDS ***
Dealt to Hero [Qs Qh]
Lj: folds
Hj: raises 40 to 60
Hero: raises 88 to 148 and is all-in
Btn: folds
Sb: folds
Bb: folds
*** SUMMARY ***`);

  assert.ok(hand);
  const opportunity = classifyPreflopOpportunity(hand);
  assert.ok(!("reason" in opportunity));
  const seed = {
    ...opportunity,
    preferredAction: "Fold",
  };
  const resolution = resolveRangeDecision(seed, defaultRanges);
  assert.ok(resolution);
  assert.equal(resolution.resolvedNodeKey, "HJ_open_CO_decision");
  assert.equal(determineBaselineSourceType(seed, resolution), "exact");
});

test("premium short-stack reshove regression: QQ facing HJ open is not marked jammed too wide", () => {
  const hand = parseHand(`PokerStars Hand #700000000006: Tournament #111, $1.00+$0.10 USD Hold'em No Limit - Level I (10/20) - 2026/04/23 12:00:00 ET
Table '111 1' 6-max Seat #1 is the button
Seat 1: Btn (1500 in chips)
Seat 2: Sb (1500 in chips)
Seat 3: Bb (1500 in chips)
Seat 4: Lj (1500 in chips)
Seat 5: Hj (1500 in chips)
Seat 6: Hero (148 in chips)
Sb: posts small blind 10
Bb: posts big blind 20
*** HOLE CARDS ***
Dealt to Hero [Qs Qh]
Lj: folds
Hj: raises 40 to 60
Hero: raises 88 to 148 and is all-in
Btn: folds
Sb: folds
Bb: folds
*** SUMMARY ***`);

  assert.ok(hand);
  const opportunity = classifyPreflopOpportunity(hand);
  assert.ok(!("reason" in opportunity));
  const scored = scorePreflopOpportunity(opportunity, defaultRanges);
  assert.ok(!("reason" in scored));
  assert.equal(scored.decisionTrace.preflopFamily, "reshove_vs_open");
  assert.equal(scored.decisionTrace.classificationResult, "mixed_or_borderline");
  assert.equal(scored.decisionTrace.confidence, "high");
  assert.equal(scored.leakLabel, "Borderline");
  assert.equal(scored.isMistake, false);
});

test("weak-fallback jam spots do not become hard leak labels", () => {
  const scored = scoreDecision(
    {
      handId: "weak-fallback-jam",
      nodeKey: "CUSTOM_UNSUPPORTED_JAM_NODE",
      fallbackNodeKeys: ["facing_open_default_decision"],
      family: "facing_open",
      heroCards: "A5o",
      heroCardsRaw: "Ah 5c",
      heroPosition: "CO",
      handTier: "medium",
      heroStackInBlinds: 11.2,
      effectiveStackInBlinds: 11.2,
      stackBucket: "10â€“15bb",
      actualAction: "Jam",
      jamType: "reshoveVsOpen",
      facingPosition: "HJ",
      preferredAction: "Fold",
      handText: "synthetic weak fallback jam test",
      contextSummary: "CO holding A5o",
      branchSummary: "Facing HJ open",
    },
    defaultRanges,
  );

  assert.ok(scored);
  assert.equal(scored.decisionTrace.baselineSourceType, "weak_fallback");
  assert.equal(scored.decisionTrace.classificationResult, "mixed_or_borderline");
  assert.equal(scored.isMistake, false);
  assert.notEqual(scored.leakLabel, "Jammed Too Wide");
});
