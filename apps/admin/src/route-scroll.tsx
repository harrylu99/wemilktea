import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { resetRouteScroll, shouldResetRouteScroll } from "./route-scroll-logic";

export function AdminRouteScroll() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const isInitialRender = useRef(true);

  useLayoutEffect(() => {
    if (shouldResetRouteScroll(navigationType, isInitialRender.current)) {
      resetRouteScroll((options) => window.scrollTo(options));
    }

    isInitialRender.current = false;
  }, [location.key, navigationType]);

  return null;
}
