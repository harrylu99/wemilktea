export function firstRelation<T>(value: T | T[]) {
  return Array.isArray(value) ? value[0] : value;
}
