/**
 * Exec Tool - Execute shell commands
 *
 * Inspired by OpenClaw's exec tool in /agents/bash-tools.exec.ts
 *
 * Key features:
 * - Timeout support
 * - Working directory context
 * - Abort signal handling
 * - Output truncation for large outputs
 */

import { spawn } from "node:child_process";
import type { Tool, ToolContext, ToolExecutionResult } from "../types.js";

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const MAX_OUTPUT_CHARS = 30_000;

interface ExecOptions {
  command: string;
  cwd: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

async function executeCommand(options: ExecOptions): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}> {
  const { command, cwd, timeoutMs = DEFAULT_TIMEOUT_MS, abortSignal } = options;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    // Use shell to execute the command
    const shell = process.platform === "win32" ? "cmd" : "/bin/bash";
    const shellArgs = process.platform === "win32" ? ["/c", command] : ["-c", command];

    const child = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Timeout handler
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 5000);
    }, timeoutMs);

    // Abort signal handler
    const abortHandler = () => {
      child.kill("SIGTERM");
    };
    abortSignal?.addEventListener("abort", abortHandler);

    // Collect output
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      abortSignal?.removeEventListener("abort", abortHandler);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        timedOut,
      });
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      abortSignal?.removeEventListener("abort", abortHandler);
      resolve({
        stdout,
        stderr: error.message,
        exitCode: 1,
        timedOut: false,
      });
    });
  });
}

function truncateOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) {
    return output;
  }

  const halfMax = Math.floor(maxChars / 2);
  const start = output.slice(0, halfMax);
  const end = output.slice(-halfMax);
  const truncatedCount = output.length - maxChars;

  return `${start}\n\n... (${truncatedCount} characters truncated) ...\n\n${end}`;
}

export const execTool: Tool = {
  name: "exec",
  description: "Execute a shell command. Use this for running programs, scripts, git commands, npm, etc.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
      description: {
        type: "string",
        description: "A brief description of what this command does (for logging)",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds. Default is 120000 (2 minutes). Max is 600000 (10 minutes).",
      },
    },
    required: ["command"],
  },

  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
    const command = args.command as string;
    const timeoutMs = Math.min(
      (args.timeout as number) ?? DEFAULT_TIMEOUT_MS,
      600_000
    );

    // Basic command validation
    if (!command.trim()) {
      return {
        content: "Error: Command cannot be empty",
        isError: true,
      };
    }

    try {
      const result = await executeCommand({
        command,
        cwd: ctx.workspaceDir,
        timeoutMs,
        abortSignal: ctx.abortSignal,
      });

      const { stdout, stderr, exitCode, timedOut } = result;

      // Build output
      const parts: string[] = [];

      if (timedOut) {
        parts.push(`Command timed out after ${timeoutMs}ms`);
      }

      if (stdout) {
        const truncated = truncateOutput(stdout, MAX_OUTPUT_CHARS);
        parts.push(`stdout:\n${truncated}`);
      }

      if (stderr) {
        const truncated = truncateOutput(stderr, MAX_OUTPUT_CHARS);
        parts.push(`stderr:\n${truncated}`);
      }

      if (exitCode !== null && exitCode !== 0) {
        parts.push(`Exit code: ${exitCode}`);
      }

      if (parts.length === 0) {
        parts.push("(no output)");
      }

      return {
        content: parts.join("\n\n"),
        isError: timedOut || (exitCode !== null && exitCode !== 0),
      };
    } catch (error) {
      const err = error as Error;
      return {
        content: `Error executing command: ${err.message}`,
        isError: true,
      };
    }
  },
};
