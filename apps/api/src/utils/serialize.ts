// apps/api/src/utils/serialize.ts
import { Prisma } from "@prisma/client";

type JsonLike =
  | null
  | undefined
  | string
  | number
  | boolean
  | bigint
  | Date
  | Prisma.Decimal
  | typeof Prisma.DbNull
  | typeof Prisma.JsonNull
  | typeof Prisma.AnyNull
  | JsonLike[]
  | { [key: string]: JsonLike };

const isPrismaNull = (value: unknown) =>
  value === Prisma.DbNull ||
  value === Prisma.JsonNull ||
  value === Prisma.AnyNull;

const isPlainObject = (value: unknown): value is Record<string, JsonLike> => {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

export function serializeJsonSafe<T = any>(value: T): T {
  const walk = (v: JsonLike): any => {
    if (v === null) return null;
    if (v === undefined) return undefined;
    if (isPrismaNull(v)) return null;
    if (typeof v === "bigint") return v.toString();
    if (v instanceof Prisma.Decimal) return v.toNumber();
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map((item) => walk(item as JsonLike));
    if (isPlainObject(v)) {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(v)) {
        out[key] = walk(val as JsonLike);
      }
      return out;
    }
    return v;
  };

  return walk(value as JsonLike);
}
