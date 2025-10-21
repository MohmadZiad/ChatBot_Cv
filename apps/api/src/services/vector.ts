// apps/api/src/services/vector.ts
export function cosine(a: number[], b: number[]) {
    let dot = 0, na = 0, nb = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (!na || !nb) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }
  
  export function toSqlVectorLiteral(vec: number[]) {
    // صيغة pgvector: '[v1, v2, ...]'
    // انتبه للفواصل العشرية (نتركها كما هي)
    return `'[${vec.join(',')}]'`;
  }
  