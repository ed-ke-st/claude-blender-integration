import { stripCodeFences } from "./blender-exec.js";
import { buildGeneratePrompt } from "./blender-generation-prompt.js";

export const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function extractTextFromGeminiResponse(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const text = parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
    if (text) {
      return text;
    }
  }
  return "";
}

export async function generateCode({
  description,
  context = "",
  conversationHistory = "",
  sceneSnapshot = "",
  ragContext = "",
  model = DEFAULT_GEMINI_MODEL,
  apiKey = process.env.GEMINI_API_KEY,
} = {}) {
  const normalizedDescription = typeof description === "string" ? description.trim() : "";
  if (!normalizedDescription) {
    throw new Error("Missing description.");
  }

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const prompt = buildGeneratePrompt({
    description: normalizedDescription,
    context,
    conversationHistory,
    sceneSnapshot,
    ragContext,
  });
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        systemInstruction: {
          parts: [
            {
              text: "You write executable Blender Python only. No markdown, no explanation.",
            },
          ],
        },
      }),
    }
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const apiMessage =
      payload?.error?.message ||
      payload?.error?.status ||
      `Gemini API request failed with status ${response.status}`;
    throw new Error(apiMessage);
  }

  const text = extractTextFromGeminiResponse(payload);
  const code = stripCodeFences(text);

  if (!code) {
    throw new Error("Gemini returned empty output.");
  }

  return code;
}
