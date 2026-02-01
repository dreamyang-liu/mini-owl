/**
 * LS Tool - List directory contents
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Tool, ToolContext, ToolExecutionResult } from "../types.js";

export const lsTool: Tool = {
  name: "ls",
  description: "List directory contents with file information.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The directory path to list. Defaults to current workspace.",
      },
    },
    required: [],
  },

  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
    const dirPath = (args.path as string) || ctx.workspaceDir;

    // Resolve path relative to workspace
    const resolvedPath = path.isAbsolute(dirPath)
      ? dirPath
      : path.join(ctx.workspaceDir, dirPath);

    try {
      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

      if (entries.length === 0) {
        return { content: `Directory is empty: ${dirPath}` };
      }

      // Sort: directories first, then files, alphabetically
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      const lines: string[] = [];

      for (const entry of sorted) {
        const fullPath = path.join(resolvedPath, entry.name);
        try {
          const stats = await fs.stat(fullPath);
          const size = entry.isDirectory() ? "-" : formatSize(stats.size);
          const type = entry.isDirectory() ? "dir " : "file";
          const modified = stats.mtime.toISOString().split("T")[0];
          lines.push(`${type}  ${size.padStart(10)}  ${modified}  ${entry.name}${entry.isDirectory() ? "/" : ""}`);
        } catch {
          lines.push(`????  ${" ".repeat(10)}  ??????????  ${entry.name}`);
        }
      }

      return { content: lines.join("\n") };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return {
          content: `Error: Directory not found: ${dirPath}`,
          isError: true,
        };
      }
      if (err.code === "ENOTDIR") {
        return {
          content: `Error: ${dirPath} is a file, not a directory`,
          isError: true,
        };
      }
      return {
        content: `Error listing directory: ${err.message}`,
        isError: true,
      };
    }
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
}
