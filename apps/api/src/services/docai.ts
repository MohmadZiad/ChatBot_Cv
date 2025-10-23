// Lightweight wrapper around Google Document AI (Document OCR)
// Non-breaking: يُستدعى فقط إذا USE_DOC_AI=1 وكل الإعدادات موجودة.

import assert from "node:assert";

const USE_DOC_AI = process.env.USE_DOC_AI === "1";
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION || "us";
const PROCESSOR_ID = process.env.DOC_AI_PROCESSOR_ID;
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

export function isDocAiEnabled() {
  return (
    USE_DOC_AI &&
    !!PROJECT_ID &&
    !!LOCATION &&
    !!PROCESSOR_ID &&
    !!GOOGLE_APPLICATION_CREDENTIALS
  );
}

/**
 * docaiExtractPdfText:
 * يرسل الـ PDF إلى Document AI ويُعيد النص المستخرج (full_text أو paragraphs).
 * يُعيد "" عند أي خطأ حتى لا يكسر المسار القديم.
 */
export async function docaiExtractPdfText(
  pdfBuffer: Buffer,
  log?: (m: any) => void
): Promise<string> {
  if (!isDocAiEnabled()) return "";

  assert(PROJECT_ID, "GCP_PROJECT_ID required");
  assert(PROCESSOR_ID, "DOC_AI_PROCESSOR_ID required");

  try {
    // يجب أن يُشير لمسار الـ JSON الصحيح على القرص (بدون علامات اقتباس).
    process.env.GOOGLE_APPLICATION_CREDENTIALS = GOOGLE_APPLICATION_CREDENTIALS!;

    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();

    const url = `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}:process`;

    const body = {
      rawDocument: {
        content: pdfBuffer.toString("base64"),
        mimeType: "application/pdf",
      },
    };

    const res = await client.request<{ document?: any }>({
      url,
      method: "POST",
      data: body,
    });

    const doc = res.data?.document;
    let out = "";

    // 1) full text
    const full = doc?.text ?? "";
    if (full) out = full;

    // 2) paragraphs كـ fallback
    if (!out && Array.isArray(doc?.pages)) {
      out = doc.pages
        .map((p: any) =>
          (p.paragraphs || [])
            .map((pg: any) => (pg.layout?.textAnchor?.content || "").toString().trim())
            .filter(Boolean)
            .join("\n")
        )
        .filter(Boolean)
        .join("\n\n");
    }

    out = (out || "").replace(/\u0000/g, "").trim();
    log?.({ step: "docai", length: out.length });
    return out;
  } catch (e: any) {
    log?.({ step: "docai", error: String(e?.message || e) });
    return "";
  }
}
