type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

/* Build one singleton out of per-concern parts. Copies property *descriptors*
   (not values) so getters/setters stay live and `this` is the composed object. */
export function compose<T extends object[]>(...parts: T): UnionToIntersection<T[number]> {
  const out = {};
  for (const p of parts) Object.defineProperties(out, Object.getOwnPropertyDescriptors(p));
  return out as UnionToIntersection<T[number]>;
}
