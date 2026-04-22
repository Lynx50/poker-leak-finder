import { HandTier, HeroCards } from "./types";

const RANK_ORDER = "23456789TJQKA";

function sortRanks(a: string, b: string) {
  return RANK_ORDER.indexOf(b) - RANK_ORDER.indexOf(a);
}

export function parseHeroCards(cardOne: string, cardTwo: string): HeroCards {
  const [first, second] = [cardOne, cardTwo];
  const rankA = first[0];
  const rankB = second[0];
  const suited = first[1] === second[1];
  const sortedRanks = [rankA, rankB].sort(sortRanks);
  const shorthand =
    sortedRanks[0] === sortedRanks[1]
      ? `${sortedRanks[0]}${sortedRanks[1]}`
      : `${sortedRanks[0]}${sortedRanks[1]}${suited ? "s" : "o"}`;

  return {
    raw: `${first} ${second}`,
    first,
    second,
    shorthand,
  };
}

export function getHandTier(cards: HeroCards): HandTier {
  const hand = cards.shorthand;

  if (["AA", "KK", "QQ", "JJ", "AKs", "AKo"].includes(hand)) {
    return "premium";
  }

  if (
    [
      "TT",
      "99",
      "AQs",
      "AQo",
      "AJs",
      "KQs",
      "KQo",
      "ATs",
      "QJs",
      "JTs",
    ].includes(hand)
  ) {
    return "strong";
  }

  if (
    [
      "88",
      "77",
      "66",
      "55",
      "AJo",
      "ATo",
      "KJs",
      "KTs",
      "QTs",
      "J9s",
      "T9s",
      "98s",
      "87s",
      "76s",
      "65s",
      "54s",
      "A5s",
      "A4s",
      "A3s",
      "A2s",
    ].includes(hand)
  ) {
    return "medium";
  }

  if (
    [
      "44",
      "33",
      "22",
      "QJo",
      "KTo",
      "Q9s",
      "97s",
      "86s",
      "75s",
      "64s",
      "53s",
      "43s",
    ].includes(hand)
  ) {
    return "speculative";
  }

  return "trash";
}
