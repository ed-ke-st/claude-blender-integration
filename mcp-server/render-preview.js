import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const DEFAULT_RENDER_OUTPUT = join(tmpdir(), "blender_mcp_preview.png");
const MAX_RENDER_BYTES = 25 * 1024 * 1024;

export function buildRenderPreviewScript(outputPath = DEFAULT_RENDER_OUTPUT) {
  const safeOutputPath = resolve(outputPath);
  return `import bpy

scene = bpy.context.scene
output_path = ${JSON.stringify(safeOutputPath)}
previous_filepath = scene.render.filepath
try:
    scene.render.filepath = output_path
    bpy.ops.render.render(write_still=True)
    scene["claude_last_render_path"] = output_path
finally:
    scene.render.filepath = previous_filepath
`;
}

export async function readRenderPreview(outputPath = DEFAULT_RENDER_OUTPUT) {
  const expectedPath = resolve(DEFAULT_RENDER_OUTPUT);
  const requestedPath = resolve(outputPath);
  if (requestedPath !== expectedPath) throw new Error("Unexpected render preview path.");
  const data = await fs.readFile(expectedPath);
  if (data.length > MAX_RENDER_BYTES) {
    throw new Error(`Render preview exceeds the ${MAX_RENDER_BYTES / (1024 * 1024)} MB response limit.`);
  }
  return {
    path: expectedPath,
    mimeType: "image/png",
    data: data.toString("base64"),
    size: data.length,
  };
}
