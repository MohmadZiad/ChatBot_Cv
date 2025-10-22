// apps/api/src/utils/serialize.ts
import { Prisma } from '@prisma/client';

export function serializeJsonSafe<T = any>(value: T): T {
  const walk = (v: any): any => {
    if (typeof v === 'bigint') return v.toString();          // BigInt → string
    if (v instanceof Prisma.Decimal) return v.toNumber();     // Decimal → number (أو toString لو تفضّل)
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: any = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(value);
}
