/**
 * Edit Tool - Make precise edits to files
 *
 * Inspired by OpenClaw's edit tool implementation
 * Uses exact string matching for replacements
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Tool, ToolContext, ToolExecutionResult } from "../types.js";

export const editTool: Tool = {
  name: "edit",
  description: "Make a precise edit to a file by replacing an exact string with a new string.",
  parameters: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "The path to the file to edit (relative to workspace or absolute)",
      },
      old_string: {
        type: "string",
        description: "The exact string to find and replace. Must match exactly including whitespace.",
      },
      new_string: {
        type: "string",
        description: "The string to replace old_string with.",
      },
      replace_all: {
        type: "boolean",
        description: "If true, replace all occurrences. Default is false (replace first occurrence only).",
      },
    },
    required: ["file_path", "old_string", "new_string"],
  },

  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
    const filePath = args.file_path as string;
    const oldString = args.old_string as string;
    const newString = args.new_string as string;
    const replaceAll = (args.replace_all as boolean) ?? false;

    // Resolve path relative to workspace
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(ctx.workspaceDir, filePath);

    try {
      // Read the file
      const content = await fs.readFile(resolvedPath, "utf-8");

      // Check if old_string exists in file
      if (!content.includes(oldString)) {
        return {
          content: `Error: The string to replace was not found in the file.\n\nSearched for:\n\`\`\`\n${oldString.slice(0, 200)}${oldString.length > 200 ? "..." : ""}\n\`\`\``,
          isError: true,
        };
      }

      // Check for ambiguity (multiple matches when not using replace_all)
      if (!replaceAll) {
        const matches = content.split(oldString).length - 1;
        if (matches > 1) {
          return {
            content: `Error: Found ${matches} occurrences of the string. Either:\n1. Provide more context to make the match unique\n2. Set replace_all=true to replace all occurrences`,
            isError: true,
          };
        }
      }

      // Perform the replacement
      const newContent = replaceAll
        ? content.replaceAll(oldString, newString)
        : content.replace(oldString, newString);

      // Write back
      await fs.writeFile(resolvedPath, newContent, "utf-8");

      const matchCount = replaceAll
        ? content.split(oldString).length - 1
        : 1;

      return {
        content: `Edited ${filePath}: replaced ${matchCount} occurrence${matchCount > 1 ? "s" : ""}`,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return {
          content: `Error: File not found: ${filePath}`,
          isError: true,
        };
      }
      return {
        content: `Error editing file: ${err.message}`,
        isError: true,
      };
    }
  },
};
