export function getMobileStorePreviewId(
  storeId: string,
  isDesktopLayout: boolean
) {
  return isDesktopLayout ? null : storeId;
}

export function shouldRevealSelectedStoreOnListTransition(
  currentView: "list" | "map",
  nextView: "list" | "map",
  selectedId: string | null,
  visibleStoreIds: readonly string[]
) {
  return (
    currentView === "map" &&
    nextView === "list" &&
    selectedId !== null &&
    visibleStoreIds.includes(selectedId)
  );
}

export function shouldPreserveListOnDesktopToMobile(
  wasDesktopLayout: boolean,
  isDesktopLayout: boolean,
  listHasFocus: boolean
) {
  return wasDesktopLayout && !isDesktopLayout && listHasFocus;
}
