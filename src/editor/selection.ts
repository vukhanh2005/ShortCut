export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export const selectionRect = (
  x: number,
  y: number,
  nextX: number,
  nextY: number,
): Rect => ({
  left: Math.min(x, nextX),
  top: Math.min(y, nextY),
  right: Math.max(x, nextX),
  bottom: Math.max(y, nextY),
});
export const intersects = (a: Rect, b: Rect) =>
  a.left <= b.right &&
  a.right >= b.left &&
  a.top <= b.bottom &&
  a.bottom >= b.top;
export function rangeIds(
  order: string[],
  anchor: string | undefined,
  target: string,
) {
  const at = order.indexOf(target),
    from = anchor ? order.indexOf(anchor) : at;
  return at < 0
    ? []
    : order.slice(
        Math.min(from < 0 ? at : from, at),
        Math.max(from < 0 ? at : from, at) + 1,
      );
}
