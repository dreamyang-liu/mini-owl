/**
 * Tools Index - Export all available tools
 *
 * Inspired by OpenClaw's tool system in /agents/pi-tools.ts
 *
 * Tools are organized by category:
 * - File operations: read, write, edit, ls, grep
 * - Execution: exec
 */

import type { Tool } from "../types.js";
import { readTool } from "./read-tool.js";
import { writeTool } from "./write-tool.js";
import { editTool } from "./edit-tool.js";
import { execTool } from "./exec-tool.js";
import { lsTool } from "./ls-tool.js";
import { grepTool } from "./grep-tool.js";

// Export individual tools
export { readTool } from "./read-tool.js";
export { writeTool } from "./write-tool.js";
export { editTool } from "./edit-tool.js";
export { execTool } from "./exec-tool.js";
export { lsTool } from "./ls-tool.js";
export { grepTool } from "./grep-tool.js";

/**
 * All available tools
 */
export const allTools: Tool[] = [
  readTool,
  writeTool,
  editTool,
  execTool,
  lsTool,
  grepTool,
];

/**
 * Create a set of coding tools with optional filtering
 *
 * @param options.allowlist - If provided, only include tools in this list
 * @param options.denylist - If provided, exclude tools in this list
 */
export function createCodingTools(options?: {
  allowlist?: string[];
  denylist?: string[];
}): Tool[] {
  let tools = [...allTools];

  if (options?.allowlist) {
    const allowed = new Set(options.allowlist.map((n) => n.toLowerCase()));
    tools = tools.filter((t) => allowed.has(t.name.toLowerCase()));
  }

  if (options?.denylist) {
    const denied = new Set(options.denylist.map((n) => n.toLowerCase()));
    tools = tools.filter((t) => !denied.has(t.name.toLowerCase()));
  }

  return tools;
}

/**
 * Convert tools to Anthropic tool format
 */
export function toAnthropicTools(tools: Tool[]): Array<{
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object" as const,
      properties: tool.parameters.properties,
      required: tool.parameters.required,
    },
  }));
}
