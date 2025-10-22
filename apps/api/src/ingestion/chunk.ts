// apps/api/src/ingestion/chunk.ts
export type Chunk = { section: string; content: string };

export function chunkText(text: string, size = 1000, overlap = 120): Chunk[] {
  if (!text) return [];
  const clean = text.replace(/\r/g, "").split(/\n{2,}/g); // فواصل على فقرات
  const parts: Chunk[] = [];
  let buf = "";

  const pushBuf = () => {
    if (buf.trim()) parts.push({ section: "body", content: buf.trim() });
    buf = "";
  };

  for (const para of clean) {
    if ((buf + "\n" + para).length >= size) {
      pushBuf();
      buf = para;
      continue;
    }
    buf = buf ? `${buf}\n${para}` : para;
  }
  pushBuf();

  // دمج/تقاطع بسيط
  if (overlap > 0 && parts.length > 1) {
    const withOverlap: Chunk[] = [];
    for (let i = 0; i < parts.length; i++) {
      const prev = parts[i - 1]?.content ?? "";
      const head = prev.slice(Math.max(0, prev.length - overlap));
      withOverlap.push({
        section: parts[i].section,
        content: head ? `${head}\n${parts[i].content}` : parts[i].content,
      });
    }
    return withOverlap;
  }
  return parts;
}
