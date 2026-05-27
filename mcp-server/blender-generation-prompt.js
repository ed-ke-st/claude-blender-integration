function normalizeSection(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildGeneratePrompt({
  description,
  context = "",
  conversationHistory = "",
  sceneSnapshot = "",
  ragContext = "",
} = {}) {
  const normalizedDescription = normalizeSection(description);
  const normalizedContext = normalizeSection(context);
  const normalizedHistory = normalizeSection(conversationHistory);
  const normalizedSceneSnapshot = normalizeSection(sceneSnapshot);
  const normalizedRagContext = normalizeSection(ragContext);

  const sections = [
    "Generate Blender Python code for the following request.",
    "",
    "REQUIREMENTS:",
    "- Use bpy and bmesh libraries where appropriate",
    "- Code must run in Blender 5.0+",
    "- Include basic error handling",
    "- Return ONLY Python code, no markdown fences",
    "- Treat conversation history, scene snapshot, and repository context as grounding context when they are provided",
    "- Keep changes additive and non-destructive relative to the existing Blender scene",
    "",
    `REQUEST:\n${normalizedDescription}`,
  ];

  if (normalizedHistory) {
    sections.push("", `CONVERSATION HISTORY:\n${normalizedHistory}`);
  }

  if (normalizedSceneSnapshot) {
    sections.push("", `LIVE SCENE SNAPSHOT:\n${normalizedSceneSnapshot}`);
  }

  if (normalizedRagContext) {
    sections.push("", normalizedRagContext);
  }

  if (normalizedContext) {
    sections.push("", `EXTRA USER CONTEXT:\n${normalizedContext}`);
  }

  return `${sections.join("\n")}\n`;
}
