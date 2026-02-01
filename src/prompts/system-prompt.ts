/**
 * System Prompt Builder
 *
 * Inspired by OpenClaw's system prompt architecture.
 * Loads context from markdown files:
 * - INSTRUCTIONS.md: Task-specific instructions (highest priority)
 * - SOUL.md: Agent persona and tone
 * - MEMORY.md: Persistent memory/notes
 */

import type { SystemPromptParams, Tool } from "../types.js";

/**
 * Core system prompt - kept minimal to reduce verbosity
 */
const CORE_PROMPT = `You are a coding assistant. Be concise and direct.

Guidelines:
- Give short, focused answers. Avoid lengthy explanations unless asked.
- When asked a simple question, give a simple answer.
- Use tools to accomplish tasks, don't just talk about them.
- Show code/results, minimize commentary.
- Skip pleasantries and self-introductions.`;

/**
 * Build tool descriptions (compact format)
 */
function buildToolSection(tools: Tool[]): string {
  if (tools.length === 0) return "";

  const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join("\n");
  return `\nTools:\n${toolList}`;
}

/**
 * Build context section from loaded files
 */
function buildContextSection(
  contextFiles: Array<{ path: string; content: string }>
): string {
  if (contextFiles.length === 0) return "";

  const sections = contextFiles.map(f => {
    // Use the file name as a section header
    const name = f.path.replace(/\.md$/i, "").toUpperCase();
    return `<${name}>\n${f.content}\n</${name}>`;
  });

  return "\n\n" + sections.join("\n\n");
}

/**
 * Build the complete system prompt
 */
export function buildSystemPrompt(params: SystemPromptParams): string {
  const parts: string[] = [CORE_PROMPT];

  // Add tool descriptions
  if (params.tools && params.tools.length > 0) {
    parts.push(buildToolSection(params.tools));
  }

  // Add workspace info
  parts.push(`\nWorkspace: ${params.workspaceDir}`);

  // Add context files (INSTRUCTIONS, SOUL, MEMORY)
  if (params.contextFiles && params.contextFiles.length > 0) {
    parts.push(buildContextSection(params.contextFiles));
  }

  // Add extra instructions if provided
  if (params.extraInstructions) {
    parts.push(`\n${params.extraInstructions}`);
  }

  return parts.join("");
}

/**
 * Load context files from workspace
 *
 * Files are loaded in priority order:
 * 1. INSTRUCTIONS.md - Task-specific instructions (loaded first, highest priority)
 * 2. SOUL.md - Agent persona and tone guidance
 * 3. MEMORY.md - Persistent memory/notes
 *
 * Also checks .mini-owl/ directory for project-specific configs
 */
export async function loadContextFiles(
  workspaceDir: string,
  fs: typeof import("node:fs/promises")
): Promise<Array<{ path: string; content: string }>> {
  const contextFiles: Array<{ path: string; content: string }> = [];

  // Files to load in order of priority
  const filesToLoad = [
    // Root level files
    { path: "INSTRUCTIONS.md", name: "INSTRUCTIONS" },
    { path: "SOUL.md", name: "SOUL" },
    { path: "MEMORY.md", name: "MEMORY" },
    // .mini-owl directory files (alternative location)
    { path: ".mini-owl/INSTRUCTIONS.md", name: "INSTRUCTIONS" },
    { path: ".mini-owl/SOUL.md", name: "SOUL" },
    { path: ".mini-owl/MEMORY.md", name: "MEMORY" },
  ];

  const loadedNames = new Set<string>();

  for (const file of filesToLoad) {
    // Skip if we already loaded this type of file
    if (loadedNames.has(file.name)) continue;

    try {
      const filepath = `${workspaceDir}/${file.path}`;
      const content = await fs.readFile(filepath, "utf-8");
      if (content.trim()) {
        contextFiles.push({ path: file.path, content: content.trim() });
        loadedNames.add(file.name);
      }
    } catch {
      // File doesn't exist or can't be read - skip it
    }
  }

  return contextFiles;
}
