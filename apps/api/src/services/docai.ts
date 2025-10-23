// apps/api/src/services/docai.ts
import {
  protos,
  DocumentProcessorServiceClient,
} from "@google-cloud/documentai";
import path from "node:path";
import fs from "node:fs/promises";

export async function docaiExtractPdfText(buf: Buffer): Promise<string> {
  const enabled = (process.env.USE_DOC_AI || "0") !== "0";
  if (!enabled) throw new Error("DocAI disabled");

  const projectId = process.env.GCP_PROJECT_ID!;
  const location = process.env.GCP_LOCATION || "us";
  const processorId = process.env.DOC_AI_PROCESSOR_ID!;
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!projectId || !processorId) throw new Error("DocAI config missing");

  // Optional: sanity check the key file exists (when path provided)
  if (keyPath) {
    try {
      await fs.access(path.resolve(keyPath));
    } catch {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS not found");
    }
  }

  const client = new DocumentProcessorServiceClient();
  const name = client.processorPath(projectId, location, processorId);

  const request: protos.google.cloud.documentai.v1.IProcessRequest = {
    name,
    rawDocument: { content: buf, mimeType: "application/pdf" },
  };

  const [result] = await client.processDocument(request);
  const doc = result.document;
  const text = (doc?.text || "").trim();
  return text;
}
