export type SipAction = "skip" | "like" | "must_try";

export function resolveSipAction(
  dx: number,
  dy: number,
  width: number,
  height: number
): SipAction | null {
  const horizontalThreshold = Math.max(72, width * 0.16);
  const verticalThreshold = Math.max(72, height * 0.12);

  if (
    Math.abs(dx) >= horizontalThreshold &&
    Math.abs(dx) >= Math.abs(dy) * 1.15
  ) {
    return dx < 0 ? "skip" : "like";
  }
  if (-dy >= verticalThreshold && -dy >= Math.abs(dx) * 1.15) {
    return "must_try";
  }
  return null;
}

export function sipDirection(dx: number, dy: number): SipAction | null {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy) * 1.15) {
    return dx < 0 ? "skip" : "like";
  }
  if (-dy >= Math.abs(dx) * 1.15) return "must_try";
  return null;
}
