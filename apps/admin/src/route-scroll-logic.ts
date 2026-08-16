import type { NavigationType } from "react-router-dom";

export function shouldResetRouteScroll(
  navigationType: NavigationType,
  isInitialRender: boolean
) {
  return isInitialRender || navigationType !== "POP";
}

export function resetRouteScroll(scrollTo: (options: ScrollToOptions) => void) {
  scrollTo({ top: 0, left: 0, behavior: "auto" });
}
