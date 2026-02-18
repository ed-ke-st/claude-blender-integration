#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "blender-mcp-server",
    version: "1.0.0",
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
        name: "generate_blender_code",
        description: "Generate Python code for Blender based on natural language description. Returns executable bpy/bmesh code.",
        inputSchema: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "Natural language description of what to create/modify in Blender (e.g., 'create a spiral staircase with 12 steps')",
            },
            context: {
              type: "string",
              description: "Optional context about current scene, selected objects, or constraints",
            },
          },
          required: ["description"],
        },
      },
      {
        name: "explain_blender_code",
        description: "Explain existing Blender Python code or suggest improvements",
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
      {
        name: "write_blender_code",
        description: "Write Python code directly to Blender's auto-execute file (/tmp/blender_auto_execute.py). Blender will automatically detect and execute the code.",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "The complete Python code to write and execute in Blender",
            },
          },
          required: ["code"],
        },
      },
    ],
  };
});

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "generate_blender_code": {
      const prompt = buildGeneratePrompt(args.description, args.context);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              prompt: prompt,
              mode: "generate",
            }),
          },
        ],
      };
    }

    case "explain_blender_code": {
      const prompt = buildExplainPrompt(args.code, args.question);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              prompt: prompt,
              mode: "explain",
            }),
          },
        ],
      };
    }

    case "debug_blender_error": {
      const prompt = buildDebugPrompt(args.error_message, args.code);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              prompt: prompt,
              mode: "debug",
            }),
          },
        ],
      };
    }

    case "write_blender_code": {
      const fs = await import('fs/promises');
      const filePath = '/tmp/blender_auto_execute.py';
      
      try {
        await fs.writeFile(filePath, args.code, 'utf8');
        
        return {
          content: [
            {
              type: "text",
              text: `✓ Code written to ${filePath}. Blender should auto-execute it within ~0.5 seconds.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `✗ Error writing to ${filePath}: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Prompt builders
function buildGeneratePrompt(description, context = "") {
  return `Generate Blender Python code for the following request.

REQUIREMENTS:
- Use bpy and bmesh libraries
- Code should be complete and executable in Blender 5.0+
- Include proper error handling
- Add comments explaining key steps
- Return ONLY the Python code, no markdown formatting

REQUEST: ${description}

${context ? `CONTEXT: ${context}` : ""}

Generate the complete Python code:`;
}

function buildExplainPrompt(code, question = "") {
  return `Explain this Blender Python code${question ? ` and answer: ${question}` : ""}.

CODE:
\`\`\`python
${code}
\`\`\`

Provide a clear explanation with:
1. What the code does overall
2. Key Blender API calls explained
3. Any potential issues or improvements
${question ? `4. Answer to: ${question}` : ""}`;
}

function buildDebugPrompt(errorMessage, code = "") {
  return `Debug this Blender Python error.

ERROR MESSAGE:
${errorMessage}

${code ? `CODE:
\`\`\`python
${code}
\`\`\`
` : ""}

Provide:
1. What caused the error
2. How to fix it
3. Corrected code if applicable`;
}

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Blender MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
