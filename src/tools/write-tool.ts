/**
 * Write Tool - Create or overwrite files
 *
 * Inspired by OpenClaw's write tool implementation
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Tool, ToolContext, ToolExecutionResult } from "../types.js";

export const writeTool: Tool = {
  name: "write",
  description: "Create a new file or overwrite an existing file with the provided content.",
  parameters: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "The path to the file to write (relative to workspace or absolute)",
      },
      content: {
        type: "string",
        description: "The content to write to the file",
      },
    },
    required: ["file_path", "content"],
  },

  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
    const filePath = args.file_path as string;
    const content = args.content as string;

    // Resolve path relative to workspace
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(ctx.workspaceDir, filePath);

    try {
      // Ensure directory exists
      const dir = path.dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });

      // Check if file exists (for reporting)
      let existed = false;
      try {
        await fs.access(resolvedPath);
        existed = true;
      } catch {
        // File doesn't exist
      }

      // Write the file
      await fs.writeFile(resolvedPath, content, "utf-8");

      const lines = content.split("\n").length;
      const bytes = Buffer.byteLength(content, "utf-8");

      if (existed) {
        return {
          content: `Updated file: ${filePath} (${lines} lines, ${bytes} bytes)`,
        };
      }

      return {
        content: `Created file: ${filePath} (${lines} lines, ${bytes} bytes)`,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      return {
        content: `Error writing file: ${err.message}`,
        isError: true,
      };
    }
  },
};
