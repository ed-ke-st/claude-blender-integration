import OpenAI from "openai";

/** Provider adapter; orchestration code never imports a provider SDK directly. */
export function createOpenAIJsonRunner({ apiKey = process.env.OPENAI_API_KEY } = {}) {
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey });
  return async ({ definition, context, model }) => {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: `${definition.instructions}\nReturn JSON only. Do not include hidden reasoning, code, or markdown.`,
        },
        { role: "user", content: JSON.stringify(context) },
      ],
    });
    const text = String(response.output_text || "").trim();
    if (!text) throw new Error("Model returned an empty Scene Inspector report.");
    return {
      findings: JSON.parse(text),
      usage: response.usage
        ? {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  };
}
