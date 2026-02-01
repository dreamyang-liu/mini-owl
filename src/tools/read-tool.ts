/**
 * Read Tool - Read file contents
 *
 * Inspired by OpenClaw's read tool implementation
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Tool, ToolContext, ToolExecutionResult } from "../types.js";

export const readTool: Tool = {
  name: "read",
  description: "Read the contents of a file. Returns the file content with line numbers.",
  parameters: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "The path to the file to read (relative to workspace or absolute)",
      },
      offset: {
        type: "number",
        description: "Line number to start reading from (1-indexed). Optional.",
      },
      limit: {
        type: "number",
        description: "Maximum number of lines to read. Optional, defaults to 2000.",
      },
    },
    required: ["file_path"],
  },

  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
    const filePath = args.file_path as string;
    const offset = (args.offset as number) ?? 1;
    const limit = (args.limit as number) ?? 2000;

    // Resolve path relative to workspace
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(ctx.workspaceDir, filePath);

    try {
      const content = await fs.readFile(resolvedPath, "utf-8");
      const lines = content.split("\n");

      // Apply offset and limit
      const startIndex = Math.max(0, offset - 1);
      const endIndex = Math.min(lines.length, startIndex + limit);
      const selectedLines = lines.slice(startIndex, endIndex);

      // Format with line numbers (like cat -n)
      const formatted = selectedLines
        .map((line, i) => {
          const lineNum = startIndex + i + 1;
          const truncated = line.length > 2000 ? line.slice(0, 2000) + "..." : line;
          return `${String(lineNum).padStart(6, " ")}\t${truncated}`;
        })
        .join("\n");

      const totalLines = lines.length;
      const header = `File: ${filePath} (${totalLines} lines total)`;

      if (endIndex < totalLines) {
        return {
          content: `${header}\nShowing lines ${offset}-${endIndex}:\n\n${formatted}\n\n... (${totalLines - endIndex} more lines)`,
        };
      }

      return {
        content: `${header}\n\n${formatted}`,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return {
          content: `Error: File not found: ${filePath}`,
          isError: true,
        };
      }
      if (err.code === "EISDIR") {
        return {
          content: `Error: ${filePath} is a directory, not a file. Use 'ls' to list directory contents.`,
          isError: true,
        };
      }
      return {
        content: `Error reading file: ${err.message}`,
        isError: true,
      };
    }
  },
};
