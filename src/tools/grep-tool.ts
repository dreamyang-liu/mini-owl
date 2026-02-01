/**
 * Grep Tool - Search file contents for patterns
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Tool, ToolContext, ToolExecutionResult } from "../types.js";

async function* walkDir(
  dir: string,
  options: { maxDepth?: number; pattern?: RegExp }
): AsyncGenerator<string> {
  const { maxDepth = 10, pattern } = options;

  async function* walk(currentDir: string, depth: number): AsyncGenerator<string> {
    if (depth > maxDepth) return;

    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden files and common ignore patterns
        if (entry.name.startsWith(".")) continue;
        if (entry.name === "node_modules") continue;
        if (entry.name === "__pycache__") continue;
        if (entry.name === "dist") continue;
        if (entry.name === "build") continue;

        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          yield* walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          if (!pattern || pattern.test(entry.name)) {
            yield fullPath;
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  yield* walk(dir, 0);
}

export const grepTool: Tool = {
  name: "grep",
  description: "Search for a pattern in files. Supports regex patterns.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "The regex pattern to search for",
      },
      path: {
        type: "string",
        description: "The file or directory to search in. Defaults to workspace.",
      },
      glob: {
        type: "string",
        description: "Glob pattern to filter files (e.g., '*.ts', '*.py')",
      },
      case_insensitive: {
        type: "boolean",
        description: "If true, search is case-insensitive. Default is false.",
      },
      context: {
        type: "number",
        description: "Number of lines of context to show around matches. Default is 0.",
      },
    },
    required: ["pattern"],
  },

  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
    const searchPattern = args.pattern as string;
    const searchPath = (args.path as string) || ctx.workspaceDir;
    const glob = args.glob as string | undefined;
    const caseInsensitive = (args.case_insensitive as boolean) ?? false;
    const contextLines = (args.context as number) ?? 0;

    // Resolve path
    const resolvedPath = path.isAbsolute(searchPath)
      ? searchPath
      : path.join(ctx.workspaceDir, searchPath);

    try {
      // Build regex
      const flags = caseInsensitive ? "gi" : "g";
      const regex = new RegExp(searchPattern, flags);

      // Build file filter from glob
      let filePattern: RegExp | undefined;
      if (glob) {
        const globRegex = glob
          .replace(/\./g, "\\.")
          .replace(/\*/g, ".*")
          .replace(/\?/g, ".");
        filePattern = new RegExp(`^${globRegex}$`);
      }

      // Check if searching a single file or directory
      const stats = await fs.stat(resolvedPath);
      const files: string[] = [];

      if (stats.isFile()) {
        files.push(resolvedPath);
      } else {
        for await (const file of walkDir(resolvedPath, { pattern: filePattern })) {
          files.push(file);
          if (files.length > 1000) break; // Limit file count
        }
      }

      const results: string[] = [];
      let totalMatches = 0;
      const maxMatches = 100;

      for (const file of files) {
        if (totalMatches >= maxMatches) break;

        try {
          const content = await fs.readFile(file, "utf-8");
          const lines = content.split("\n");
          const relativePath = path.relative(ctx.workspaceDir, file);

          for (let i = 0; i < lines.length && totalMatches < maxMatches; i++) {
            if (regex.test(lines[i])) {
              totalMatches++;

              // Get context lines
              const startLine = Math.max(0, i - contextLines);
              const endLine = Math.min(lines.length - 1, i + contextLines);

              if (contextLines > 0) {
                results.push(`${relativePath}:${i + 1}:`);
                for (let j = startLine; j <= endLine; j++) {
                  const prefix = j === i ? ">" : " ";
                  results.push(`${prefix} ${j + 1}: ${lines[j]}`);
                }
                results.push("");
              } else {
                results.push(`${relativePath}:${i + 1}: ${lines[i]}`);
              }

              // Reset regex lastIndex
              regex.lastIndex = 0;
            }
          }
        } catch {
          // Skip files we can't read (binary, etc.)
        }
      }

      if (results.length === 0) {
        return { content: `No matches found for pattern: ${searchPattern}` };
      }

      const header = totalMatches >= maxMatches
        ? `Found ${maxMatches}+ matches (truncated):`
        : `Found ${totalMatches} match${totalMatches === 1 ? "" : "es"}:`;

      return { content: `${header}\n\n${results.join("\n")}` };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return {
          content: `Error: Path not found: ${searchPath}`,
          isError: true,
        };
      }
      if (err.message.includes("Invalid regular expression")) {
        return {
          content: `Error: Invalid regex pattern: ${searchPattern}`,
          isError: true,
        };
      }
      return {
        content: `Error searching: ${err.message}`,
        isError: true,
      };
    }
  },
};
