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

const DEFAULT_WATCH_FILE = "/tmp/blender_claude_execute.py";

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
            "Execute Python code in Blender. Generate complete bpy/bmesh Python code for Blender 5.0+ and pass it here — it will be written to a watch file and auto-executed by Blender. " +
            "IMPORTANT: Only CREATE new objects. NEVER delete or remove existing objects. Do NOT manage collections (they are handled automatically). " +
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
          const code = stripCodeFences(args.code);
          await fs.writeFile(watchFilePath, code, "utf8");

          return {
            content: [
              {
                type: "text",
                text: `✓ Code written to ${watchFilePath}. Blender will auto-execute it within ~0.5 seconds.`,
              },
            ],
          };
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
