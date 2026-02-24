#!/usr/bin/env node

import express from "express";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";

import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_WATCH_FILE = join(tmpdir(), "blender_claude_execute.py");
const RESULT_FILE = join(tmpdir(), "blender_result.json");
const WAIT_POLL_COUNT = 24;
const WAIT_POLL_MS = 250;

function createServer() {
  const server = new Server(
    {
      name: "blender-mcp-server",
      version: "1.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Tool definitions
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "create_in_blender",
          description:
            `Execute Python code in Blender. Generate complete bpy/bmesh Python code for Blender 5.0+ and pass it here — it will be written to ${DEFAULT_WATCH_FILE} and auto-executed by Blender. ` +
            "IMPORTANT: Only CREATE new objects. NEVER delete or remove existing objects. Do NOT manage collections (they are handled automatically). " +
            "Coordinate conventions: +Z up, +X right, -Y forward, meters, right-handed. " +
            "If you create image textures, explicitly set up UVs and wire ShaderNodeTexCoord UV output. " +
            "Include proper error handling. Do not use markdown fences. " +
            "Blender 4.0+ API: shader node inputs were renamed — use 'Factor' not 'Fac', 'A'/'B' not 'Color1'/'Color2', Principled BSDF uses 'Base Color', 'Metallic', 'Roughness', 'IOR', 'Alpha'.",
          inputSchema: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description:
                  "Complete executable Python code for Blender (bpy, bmesh, mathutils available)",
              },
            },
            required: ["code"],
          },
        },
        {
          name: "delete_in_blender",
          description:
            "Delete specific Blender objects by exact name using the addon's explicit safety checks. " +
            "Uses explicit directives (DEL:ObjectName or DELETE:[...]) and, unless trusted-session mode is enabled in Blender, a matching one-time delete token.",
          inputSchema: {
            type: "object",
            properties: {
              object_names: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
                description:
                  "Exact Blender object names to delete (e.g., ['RyeLoaf'])",
              },
              delete_token: {
                type: "string",
                description:
                  "Optional one-time delete token from Blender's 'Arm One-Time Delete'",
              },
            },
            required: ["object_names"],
          },
        },
        {
          name: "explain_blender_code",
          description:
            "Explain existing Blender Python code or suggest improvements",
          inputSchema: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "The Python code to explain or improve",
              },
              question: {
                type: "string",
                description: "Specific question about the code",
              },
            },
            required: ["code"],
          },
        },
        {
          name: "get_blender_result",
          description:
            "Read the latest execution result from Blender. Returns status (success/error/rolled_back), " +
            "error message if any, list of created objects, all scene objects, and all collections. " +
            "Call this after create_in_blender to verify the code ran successfully or to diagnose errors.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "debug_blender_error",
          description: "Help debug Blender Python errors",
          inputSchema: {
            type: "object",
            properties: {
              error_message: {
                type: "string",
                description: "The error message from Blender",
              },
              code: {
                type: "string",
                description: "The code that caused the error",
              },
            },
            required: ["error_message"],
          },
        },
      ],
    };
  });

  // Tool handlers
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const watchFilePath = process.env.BLENDER_WATCH_FILE || DEFAULT_WATCH_FILE;

    switch (name) {
      case "create_in_blender": {
        const fs = await import("fs/promises");

        try {
          const requestId = randomUUID();
          const code = stripCodeFences(args.code);
          const stampedCode = stampCodeWithRequestId(code, requestId);
          await fs.writeFile(watchFilePath, stampedCode, "utf8");
          const result = await waitForFreshResult(fs, watchFilePath, requestId);

          const response = result
            ? `✓ Code sent to Blender.\n\nExecution result:\n${result}`
            : `✓ Code written to ${watchFilePath}. Blender has not reported a result yet — auto-execute may be disabled, or the addon needs reloading.`;

          return { content: [{ type: "text", text: response }] };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `✗ Error writing to ${watchFilePath}: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "delete_in_blender": {
        const fs = await import("fs/promises");

        try {
          const requestId = randomUUID();
          const objectNames = normalizeObjectNames(args.object_names);
          if (objectNames.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: "✗ delete_in_blender requires at least one valid object name.",
                },
              ],
              isError: true,
            };
          }

          const deleteToken = normalizeOptionalToken(args.delete_token);
          const code = buildDeleteScript(objectNames, deleteToken, requestId);
          await fs.writeFile(watchFilePath, code, "utf8");
          const result = await waitForFreshResult(fs, watchFilePath, requestId);

          const response = result
            ? `✓ Delete request sent to Blender for: ${objectNames.join(", ")}\n\nExecution result:\n${result}`
            : `✓ Delete request written to ${watchFilePath} for: ${objectNames.join(", ")}. Blender has not reported a result yet — auto-execute may be disabled, or the addon needs reloading.`;

          return { content: [{ type: "text", text: response }] };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `✗ Error preparing delete request: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "get_blender_result": {
        const fs = await import("fs/promises");

        try {
          const requestId = randomUUID();
          const probeCode = buildSnapshotProbeScript(requestId);
          await fs.writeFile(watchFilePath, probeCode, "utf8");

          const fresh = await waitForFreshResult(fs, watchFilePath, requestId);
          if (fresh) {
            return {
              content: [{ type: "text", text: fresh }],
            };
          }

          const data = await fs.readFile(RESULT_FILE, "utf8");
          return {
            content: [
              {
                type: "text",
                text:
                  "⚠ Timed out waiting for a fresh Blender snapshot. Returning last known result:\n\n" +
                  data,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text:
                  error.code === "ENOENT"
                    ? "No result file yet. Blender may not have executed any code, or auto-execute is not enabled."
                    : `Error reading result file: ${error.message}`,
              },
            ],
            isError: error.code !== "ENOENT",
          };
        }
      }

      case "explain_blender_code":
        return {
          content: [
            {
              type: "text",
              text: `Explain this Blender Python code${args.question ? ` and answer: ${args.question}` : ""}.\n\nCODE:\n${args.code}`,
            },
          ],
        };

      case "debug_blender_error":
        return {
          content: [
            {
              type: "text",
              text: `Debug this Blender Python error.\n\nERROR: ${args.error_message}${args.code ? `\n\nCODE:\n${args.code}` : ""}`,
            },
          ],
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}

function stripCodeFences(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    const lines = trimmed.split("\n");
    return lines.slice(1, -1).join("\n").trim();
  }
  return trimmed;
}

async function waitForFreshResult(fs, watchFilePath, requestId = "") {
  for (let i = 0; i < WAIT_POLL_COUNT; i++) {
    await new Promise((r) => setTimeout(r, WAIT_POLL_MS));
    try {
      const data = await fs.readFile(RESULT_FILE, "utf8");
      const parsed = JSON.parse(data);
      if (requestId && parsed.request_id === requestId) {
        return data;
      }
      if (requestId) {
        continue;
      }
      const watchStat = await fs.stat(watchFilePath);
      if (parsed.timestamp >= watchStat.mtimeMs / 1000 - 1) {
        return data;
      }
    } catch {
      // Result file not ready yet
    }
  }
  return null;
}

function normalizeObjectNames(value) {
  if (!Array.isArray(value)) return [];
  const unique = new Set();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (!name) continue;
    if (name.length > 128) continue;
    unique.add(name);
  }
  return [...unique];
}

function normalizeOptionalToken(value) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new Error("delete_token must be a string when provided");
  }
  const token = value.trim();
  if (!token) return "";
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(token)) {
    throw new Error("delete_token format is invalid");
  }
  return token;
}

function buildDeleteScript(objectNames, deleteToken, requestId = "") {
  const quotedNames = objectNames.map((n) => JSON.stringify(n)).join(", ");
  const directive = `# DEL:${objectNames.join(",")}`;
  const tokenDirective = deleteToken ? `\n# DELETE_TOKEN:${deleteToken}` : "";
  const requestDirective = requestId ? `\n# MCP_REQUEST_ID:${requestId}` : "";

  return `${directive}${tokenDirective}${requestDirective}
import bpy

target_names = [${quotedNames}]
missing = []
deleted = []

for _name in target_names:
    _obj = bpy.data.objects.get(_name)
    if _obj is None:
        missing.append(_name)
        continue
    bpy.data.objects.remove(_obj, do_unlink=True)
    deleted.append(_name)

if missing:
    print("Delete skipped (not found): " + ", ".join(missing))
`;
}

function stampCodeWithRequestId(code, requestId) {
  return `# MCP_REQUEST_ID:${requestId}\n${code}`;
}

function buildSnapshotProbeScript(requestId) {
  return `# MCP_REQUEST_ID:${requestId}
import bpy
print("Blender snapshot probe")
`;
}

function parseAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || "";
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function withSecurity(app) {
  const allowedOrigins = parseAllowedOrigins();
  const authToken = process.env.MCP_AUTH_TOKEN;

  app.use((req, res, next) => {
    if (allowedOrigins.length > 0) {
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.includes(origin)) {
        res.status(403).json({ error: "Origin not allowed" });
        return;
      }
    }

    if (authToken) {
      const authHeader = req.headers.authorization || "";
      const expected = `Bearer ${authToken}`;
      if (authHeader !== expected) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    next();
  });
}

async function runStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Blender MCP Server running on stdio");
}

async function runHttp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  withSecurity(app);

  const transports = new Map();

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      transport: "http",
      watchFile: process.env.BLENDER_WATCH_FILE || DEFAULT_WATCH_FILE,
    });
  });

  app.all("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    let transport = sessionId ? transports.get(sessionId) : undefined;

    try {
      if (!transport) {
        if (req.method !== "POST" || !isInitializeRequest(req.body)) {
          res.status(400).json({
            error:
              "No active session. Start with an initialize request (POST /mcp).",
          });
          return;
        }

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            transports.set(newSessionId, transport);
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            transports.delete(transport.sessionId);
          }
        };

        const sessionServer = createServer();
        await sessionServer.connect(transport);
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("HTTP transport error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 3030);
  app.listen(port, host, () => {
    console.error(`Blender MCP Server running on http://${host}:${port}/mcp`);
  });
}

async function main() {
  const mode = (process.env.MCP_TRANSPORT || "stdio").toLowerCase();
  if (mode === "http") {
    await runHttp();
    return;
  }

  await runStdio();
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
