import { useCallback, useEffect, useState, type RefObject } from "react";

const SCROLL_EDGE_TOLERANCE = 1;

export function getHorizontalScrollState(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number
) {
  const maximumScrollLeft = Math.max(0, scrollWidth - clientWidth);
  return {
    canScrollPrevious: scrollLeft > SCROLL_EDGE_TOLERANCE,
    canScrollNext: maximumScrollLeft - scrollLeft > SCROLL_EDGE_TOLERANCE,
    hasOverflow: maximumScrollLeft > SCROLL_EDGE_TOLERANCE
  };
}

export function getHorizontalScrollDistance(clientWidth: number) {
  return Math.max(1, clientWidth * 0.75);
}

function getScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

export function useHorizontalScrollControls(
  scrollerRef: RefObject<HTMLElement | null>,
  enabled: boolean
) {
  const [state, setState] = useState({
    canScrollPrevious: false,
    canScrollNext: false,
    hasOverflow: false
  });

  const updateState = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    setState(
      getHorizontalScrollState(
        scroller.scrollLeft,
        scroller.clientWidth,
        scroller.scrollWidth
      )
    );
  }, [scrollerRef]);

  useEffect(() => {
    if (!enabled) {
      setState({
        canScrollPrevious: false,
        canScrollNext: false,
        hasOverflow: false
      });
      return;
    }

    const scroller = scrollerRef.current;
    if (!scroller) return;

    updateState();
    const handleScroll = () => updateState();
    scroller.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", updateState);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateState);
    resizeObserver?.observe(scroller);
    Array.from(scroller.children).forEach((child) =>
      resizeObserver?.observe(child)
    );

    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            Array.from(scroller.children).forEach((child) =>
              resizeObserver?.observe(child)
            );
            updateState();
          });
    mutationObserver?.observe(scroller, { childList: true, subtree: true });

    return () => {
      scroller.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateState);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [enabled, scrollerRef, updateState]);

  const scroll = useCallback(
    (direction: -1 | 1) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      scroller.scrollBy({
        behavior: getScrollBehavior(),
        left: direction * getHorizontalScrollDistance(scroller.clientWidth)
      });
    },
    [scrollerRef]
  );

  return {
    ...state,
    scrollNext: () => scroll(1),
    scrollPrevious: () => scroll(-1)
  };
}
