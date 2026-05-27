import OpenAI from "openai";

import { stripCodeFences } from "./blender-exec.js";
import { buildGeneratePrompt } from "./blender-generation-prompt.js";

export const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

export async function generateCode({
  description,
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
        content: prompt,
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
