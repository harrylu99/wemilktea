export function getMobilePreviewId(
  selectedId: string | null,
  showMobilePreview: boolean,
  isDesktopLayout: boolean
) {
  return !isDesktopLayout && showMobilePreview ? selectedId : null;
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

export function shouldPreserveMapOnDesktopToMobile(
  wasDesktopLayout: boolean,
  isDesktopLayout: boolean,
  mapHasFocus: boolean
) {
  return wasDesktopLayout && !isDesktopLayout && mapHasFocus;
}
