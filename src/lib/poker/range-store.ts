import { RangeLibraryState, RangePack, RangeSourceKind } from "./types";

export const RANGE_LIBRARY_STORAGE_KEY = "poker-leak-finder.range-library";

export function getDefaultRangeLibraryState(): RangeLibraryState {
  return {
    activeSource: "built_in",
    customLabel: null,
    nodes: {},
  };
}

export function loadRangeLibraryState(): RangeLibraryState {
  if (typeof window === "undefined") {
    return getDefaultRangeLibraryState();
  }

  const raw = window.localStorage.getItem(RANGE_LIBRARY_STORAGE_KEY);
  if (!raw) {
    return getDefaultRangeLibraryState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<RangeLibraryState>;
    return {
      activeSource: isRangeSourceKind(parsed.activeSource) ? parsed.activeSource : "built_in",
      customLabel: typeof parsed.customLabel === "string" ? parsed.customLabel : null,
      nodes: parsed.nodes && typeof parsed.nodes === "object" ? parsed.nodes : {},
    };
  } catch {
    return getDefaultRangeLibraryState();
  }
}

export function saveRangeLibraryState(state: RangeLibraryState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RANGE_LIBRARY_STORAGE_KEY, JSON.stringify(state));
}

export function createImportedRangeState(pack: RangePack): RangeLibraryState {
  return {
    activeSource: "custom_import",
    customLabel: pack.sourceLabel,
    nodes: pack.nodes,
  };
}

export function createManualRangeState(nodes: RangeLibraryState["nodes"], label: string | null): RangeLibraryState {
  return {
    activeSource: "custom_manual",
    customLabel: label ?? "Manual Custom Ranges",
    nodes,
  };
}

function isRangeSourceKind(value: unknown): value is RangeSourceKind {
  return value === "built_in" || value === "custom_import" || value === "custom_manual";
}
