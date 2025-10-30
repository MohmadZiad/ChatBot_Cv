// apps/api/src/utils/serialize.ts
import { Prisma } from "@prisma/client";

/**
 * ✅ حل جذري لخطأ: "Do not know how to serialize a BigInt"
 * - نفعّل toJSON لـ BigInt عالميًا => يرجّعه string
 * - نفعّل toJSON لـ Prisma.Decimal عالميًا => يرجّعه number
 * - نوحّد دالة serializeJsonSafe للاستعمال اليدوي عند الحاجة
 *
 * ملاحظة: يكفي وضع هذا الملف كما هو. التعديلات العالمية (monkey-patch)
 * تعمل بمجرد تحميل الملف في وقت التشغيل بدون لمس أي ملفات أخرى.
 */

/* --------------------------- Global Patches --------------------------- */

// BigInt -> JSON string
try {
  // @ts-expect-error add toJSON at runtime
  if (typeof BigInt !== "undefined" && !BigInt.prototype.toJSON) {
    // @ts-expect-error runtime patch
    BigInt.prototype.toJSON = function () {
      return this.toString();
    };
  }
} catch {
  // لا شيء: بيئات قد تمنع التعديل على البروتوتايب
}

// Prisma.Decimal -> JSON number
try {
  const DecimalCtor: any = (Prisma as any)?.Decimal;
  if (DecimalCtor && DecimalCtor.prototype) {
    if (typeof DecimalCtor.prototype.toJSON !== "function") {
      DecimalCtor.prototype.toJSON = function () {
        try {
          return typeof this?.toNumber === "function"
            ? this.toNumber()
            : Number(this);
        } catch {
          // fallback: string إن فشل التحويل لرقم
          return String(this);
        }
      };
    }
  }
} catch {
  // تجاهل بصمت
}

/* ------------------------ Safe JSON Serialization ------------------------ */

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

/**
 * يحوّل القيم الحسّاسة قبل إرسالها كـ JSON
 * - bigint → string (احترازيًا حتى مع الـ patch)
 * - Prisma.Decimal → number
 * - Date → ISO string
 * - Prisma.*Null → null
 */
export function serializeJsonSafe<T = any>(value: T): T {
  const walk = (v: JsonLike): any => {
    if (v === null) return null;
    if (v === undefined) return undefined;
    if (isPrismaNull(v)) return null;
    if (typeof v === "bigint") return v.toString();
    if (v instanceof Prisma.Decimal) {
      try {
        return v.toNumber();
      } catch {
        return String(v);
      }
    }
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
export function stringifyJsonSafe(value: unknown, space?: number): string {
  const replacer = (_key: string, v: any) => {
    if (v === null || v === undefined) return v;
    if (isPrismaNull(v)) return null;
    if (typeof v === "bigint") return v.toString();
    if (v instanceof Prisma.Decimal) {
      try {
        return v.toNumber();
      } catch {
        return String(v);
      }
    }
    if (v instanceof Date) return v.toISOString();
    return v;
  };
  return JSON.stringify(value, replacer, space);
}
