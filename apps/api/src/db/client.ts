import { PrismaClient } from '@prisma/client';

declare global {
  // لمنع إنشاء أكثر من instance أثناء التطوير
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    log: ['warn', 'error'], // زد 'query' لو بدك تشوف الاستعلامات
  });

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;
