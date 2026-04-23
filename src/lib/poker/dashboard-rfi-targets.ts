import { Position } from "./types";

export const DASHBOARD_RFI_TARGETS: Partial<Record<Position, number>> = {
  UTG: 17.0,
  MP: 19.6,
  LJ: 22.9,
  HJ: 27.3,
  CO: 34.5,
  BTN: 46.9,
};

export function getDashboardRfiTargetPercent(position: string) {
  const target = DASHBOARD_RFI_TARGETS[position as Position];
  return target === undefined ? null : target / 100;
}
