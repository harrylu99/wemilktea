export type SipAction = "skip" | "like" | "must_try";

const AXIS_RATIO = 1.15;

function resolveByDistance(
  dx: number,
  dy: number,
  width: number,
  height: number
): SipAction | null {
  const horizontalThreshold = Math.max(72, width * 0.16);
  const verticalThreshold = Math.max(72, height * 0.12);

  if (
    Math.abs(dx) >= horizontalThreshold &&
    Math.abs(dx) >= Math.abs(dy) * AXIS_RATIO
  ) {
    return dx < 0 ? "skip" : "like";
  }
  if (-dy >= verticalThreshold && -dy >= Math.abs(dx) * AXIS_RATIO) {
    return "must_try";
  }
  return null;
}

export function resolveSipAction(
  dx: number,
  dy: number,
  width: number,
  height: number,
  velocityX = 0,
  velocityY = 0
): SipAction | null {
  const committed = resolveByDistance(dx, dy, width, height);
  if (committed) return committed;

  const flickVelocity = 0.65;
  const minFlickDistance = Math.max(24, Math.min(width, height) * 0.06);
  const horizontalFlick =
    Math.abs(dx) >= minFlickDistance &&
    Math.abs(velocityX) >= flickVelocity &&
    Math.abs(velocityX) >= Math.abs(velocityY) * AXIS_RATIO;
  if (horizontalFlick) return velocityX < 0 ? "skip" : "like";

  const verticalFlick =
    -dy >= minFlickDistance &&
    -velocityY >= flickVelocity &&
    -velocityY >= Math.abs(velocityX) * AXIS_RATIO;
  if (verticalFlick) return "must_try";
  return null;
}

export function sipDirection(dx: number, dy: number): SipAction | null {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy) * AXIS_RATIO) {
    return dx < 0 ? "skip" : "like";
  }
  if (-dy >= Math.abs(dx) * AXIS_RATIO) return "must_try";
  return null;
}
