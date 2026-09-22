import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

import { stripCodeFences } from "./blender-exec.js";
import { buildGeneratePrompt } from "./blender-generation-prompt.js";

export const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function inferImageMimeType(filePath) {
  const extension = path.extname(String(filePath || "")).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "application/octet-stream";
}

async function buildAttachmentInputs(attachments = []) {
  const items = [];

  for (const attachment of attachments) {
    const filePath = typeof attachment?.path === "string" ? attachment.path.trim() : "";
    if (!filePath) {
      continue;
    }

    const bytes = await fs.readFile(filePath);
    items.push({
      type: "input_image",
      image_url: `data:${inferImageMimeType(filePath)};base64,${bytes.toString("base64")}`,
    });
  }

  return items;
}

export async function generateCode({
  description,
  attachments = [],
  context = "",
  conversationHistory = "",
  sceneSnapshot = "",
  ragContext = "",
  model = DEFAULT_OPENAI_MODEL,
  apiKey = process.env.OPENAI_API_KEY,
} = {}) {
  const normalizedDescription = typeof description === "string" ? description.trim() : "";
  if (!normalizedDescription) {
    throw new Error("Missing description.");
  }

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const client = new OpenAI({ apiKey });
  const prompt = buildGeneratePrompt({
    description: normalizedDescription,
    context,
    conversationHistory,
    sceneSnapshot,
    ragContext,
  });
  const attachmentInputs = await buildAttachmentInputs(attachments);

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "You write executable Blender Python only. No markdown, no explanation.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt,
          },
          ...attachmentInputs,
        ],
      },
    ],
  });

  const text = response.output_text || "";
  const code = stripCodeFences(text);

  if (!code) {
    throw new Error("Model returned empty output.");
  }

  return code;
}
