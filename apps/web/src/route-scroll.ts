export function shouldScrollToTop(
  previousPathname: string,
  currentPathname: string,
  navigationType: "POP" | "PUSH" | "REPLACE"
) {
  return previousPathname !== currentPathname && navigationType !== "POP";
}
