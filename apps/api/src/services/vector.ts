// apps/api/src/services/vectors.ts
export function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i];
  return s;
}
export function norm(a: number[]) {
  return Math.sqrt(dot(a, a));
}
export function cosine(a: number[], b: number[]) {
  const d = dot(a, b),
    na = norm(a),
    nb = norm(b);
  return na && nb ? d / (na * nb) : 0;
}
