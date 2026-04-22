import { parseHeroCards } from "./cards";
import { ParsedAction, ParsedActionType, ParsedHand, PlayerSeat, Position } from "./types";

const HAND_START = /(?=PokerStars Hand #)/g;
const ACTION_REGEX = /^([^:]+): (.*)$/;
const POSITIONS_CLOCKWISE_FROM_BUTTON: Record<number, Position[]> = {
  2: ["SB", "BB"],
  3: ["SB", "BB", "BTN"],
  4: ["SB", "BB", "CO", "BTN"],
  5: ["SB", "BB", "HJ", "CO", "BTN"],
  6: ["SB", "BB", "LJ", "HJ", "CO", "BTN"],
  7: ["SB", "BB", "UTG", "LJ", "HJ", "CO", "BTN"],
  8: ["SB", "BB", "UTG", "MP", "LJ", "HJ", "CO", "BTN"],
  9: ["SB", "BB", "UTG", "MP", "MP", "LJ", "HJ", "CO", "BTN"],
};

function parseMoney(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.replace(/[$,]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : undefined;
}

function parseActionLine(line: string): ParsedAction | null {
  const match = line.match(ACTION_REGEX);
  if (!match) return null;

  const player = match[1].trim();
  const rest = match[2].trim();
  const isAllIn = /all-in/i.test(rest);

  const actionBuilders: [RegExp, ParsedActionType, (groups: RegExpMatchArray) => Partial<ParsedAction> | undefined][] = [
    [/^posts small blind \$?([\d,.]+)/i, "post_sb", (groups) => ({ amount: parseMoney(groups[1]) })],
    [/^posts big blind \$?([\d,.]+)/i, "post_bb", (groups) => ({ amount: parseMoney(groups[1]) })],
    [/^posts the ante \$?([\d,.]+)/i, "post_ante", (groups) => ({ amount: parseMoney(groups[1]) })],
    [/^folds/i, "fold", () => ({})],
    [/^checks/i, "check", () => ({})],
    [/^calls \$?([\d,.]+)/i, "call", (groups) => ({ amount: parseMoney(groups[1]) })],
    [/^bets \$?([\d,.]+)/i, "bet", (groups) => ({ amount: parseMoney(groups[1]), toAmount: parseMoney(groups[1]) })],
    [/^raises \$?[\d,.]+ to \$?([\d,.]+)/i, "raise", (groups) => ({ toAmount: parseMoney(groups[1]) })],
  ];

  for (const [pattern, type, build] of actionBuilders) {
    const actionMatch = rest.match(pattern);
    if (actionMatch) {
      return {
        player,
        type,
        raw: line,
        isAllIn,
        ...build(actionMatch),
      };
    }
  }

  return {
    player,
    type: "unknown",
    raw: line,
    isAllIn,
  };
}

function extractPreflopSection(rawHand: string) {
  const nextStreetIndex = rawHand.search(/\*\*\* (FLOP|TURN|RIVER|SUMMARY|SHOW DOWN) \*\*\*/);

  if (nextStreetIndex === -1) {
    return rawHand;
  }

  return rawHand.slice(0, nextStreetIndex);
}

function getPositionsForCount(count: number): Position[] {
  if (POSITIONS_CLOCKWISE_FROM_BUTTON[count]) {
    return POSITIONS_CLOCKWISE_FROM_BUTTON[count];
  }

  if (count < 2) {
    return [];
  }

  if (count > 9) {
    return [...POSITIONS_CLOCKWISE_FROM_BUTTON[9], ...Array(count - 9).fill("UNKNOWN" as Position)];
  }

  return POSITIONS_CLOCKWISE_FROM_BUTTON[9].slice(0, 2).concat(POSITIONS_CLOCKWISE_FROM_BUTTON[9].slice(11 - count));
}

export function buildPositionMap(seats: PlayerSeat[], buttonSeat: number | null) {
  const occupied = [...seats].sort((a, b) => a.seat - b.seat);
  const orderedFromButton =
    buttonSeat === null
      ? occupied
      : [
          ...occupied.filter((seat) => seat.seat > buttonSeat),
          ...occupied.filter((seat) => seat.seat <= buttonSeat),
        ];

  if (orderedFromButton.length < 2) {
    return new Map<string, Position>();
  }

  const names = orderedFromButton.map((seat) => seat.name);
  const positions = getPositionsForCount(names.length);
  return new Map(names.map((name, index) => [name, positions[index] ?? "UNKNOWN"]));
}

export function splitHandHistories(input: string) {
  return input
    .split(HAND_START)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

export function parseHand(rawHand: string): ParsedHand | null {
  const idMatch = rawHand.match(/PokerStars Hand #(\d+)/);
  const heroCardsMatch = rawHand.match(/Dealt to ([^\[]+) \[([2-9TJQKA][shdc]) ([2-9TJQKA][shdc])\]/i);
  if (!idMatch || !heroCardsMatch) {
    return null;
  }

  const heroName = heroCardsMatch[1].trim();
  const heroCards = parseHeroCards(heroCardsMatch[2], heroCardsMatch[3]);

  const seats = [...rawHand.matchAll(/^Seat (\d+): (.+?) \(\$?([\d,.]+) in chips\)$/gim)].map(
    (match) =>
      ({
        seat: Number(match[1]),
        name: match[2].trim(),
        stack: Number(match[3].replace(/,/g, "")),
      }) satisfies PlayerSeat,
  );

  const buttonSeatMatch = rawHand.match(/Seat #(\d+) is the button/i);
  const buttonSeat = buttonSeatMatch ? Number(buttonSeatMatch[1]) : null;
  const activePlayers = seats.map((seat) => seat.name);
  const positionMap = buildPositionMap(seats, buttonSeat);
  const heroPosition = positionMap.get(heroName) ?? "UNKNOWN";

  const preflopSection = extractPreflopSection(rawHand);
  const preflopActions = preflopSection
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map(parseActionLine)
    .filter((action): action is ParsedAction => Boolean(action));

  const smallBlindAmount = preflopActions.find((action) => action.type === "post_sb")?.amount ?? null;
  const bigBlindAmount = preflopActions.find((action) => action.type === "post_bb")?.amount ?? null;

  return {
    id: idMatch[1],
    raw: rawHand,
    heroName,
    heroCards,
    seats,
    buttonSeat,
    activePlayers,
    heroPosition,
    preflopActions,
    smallBlindAmount,
    bigBlindAmount,
  };
}
