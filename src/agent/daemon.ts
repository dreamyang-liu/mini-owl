/**
 * Agent Daemon - Main orchestrator
 *
 * Inspired by OpenClaw's architecture in:
 * - /agents/pi-embedded-runner/run.ts (main execution)
 * - /agents/pi-embedded-runner/runs.ts (active run tracking)
 * - /gateway/server.ts (daemon service)
 *
 * Key concepts:
 * - Session management (create, list, get history)
 * - Request routing through lanes
 * - Active run tracking for cancellation
 * - Event emission for monitoring
 * - Multi-provider support (Anthropic, Bedrock)
 */

import { EventEmitter } from "node:events";
import { runAgent } from "./runner.js";
import { enqueueInSessionLane, getLaneStats } from "./lanes.js";
import {
  loadSession,
  resolveSessionFile,
  type SessionData,
} from "../session/session-manager.js";
import type { AgentRunParams, AgentRunResult, Tool, Provider, BedrockConfig } from "../types.js";

export interface DaemonConfig {
  workspaceDir: string;
  defaultModel?: string;
  provider?: Provider;
  apiKey?: string;
  bedrockConfig?: BedrockConfig;
  tools?: Tool[];
}

export interface RunOptions {
  sessionId: string;
  prompt: string;
  model?: string;
  provider?: Provider;
  onPartialReply?: (text: string) => void;
  onToolExecution?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: string) => void;
}

interface ActiveRun {
  sessionId: string;
  startedAt: Date;
  abortController: AbortController;
  provider: Provider;
}

/**
 * Agent Daemon - Manages agent sessions and execution
 *
 * Usage with Anthropic API:
 * ```typescript
 * const daemon = new AgentDaemon({
 *   workspaceDir: "/path/to/workspace",
 *   apiKey: "sk-...",
 * });
 * ```
 *
 * Usage with AWS Bedrock:
 * ```typescript
 * const daemon = new AgentDaemon({
 *   workspaceDir: "/path/to/workspace",
 *   provider: "bedrock",
 *   bedrockConfig: {
 *     region: "us-east-1",
 *   },
 * });
 * ```
 */
export class AgentDaemon extends EventEmitter {
  private config: DaemonConfig;
  private activeRuns: Map<string, ActiveRun> = new Map();
  private sessionsDir: string;

  constructor(config: DaemonConfig) {
    super();
    this.config = config;
    this.sessionsDir = `${config.workspaceDir}/.agent/sessions`;
  }

  /**
   * Get the current provider
   */
  getProvider(): Provider {
    return this.config.provider || "anthropic";
  }

  /**
   * Run the agent with a prompt in a session
   *
   * Requests are serialized per-session using lanes.
   */
  async run(options: RunOptions): Promise<AgentRunResult> {
    const { sessionId, prompt, model, provider, onPartialReply, onToolExecution, onToolResult } =
      options;

    // Use run-specific provider/model or fall back to config defaults
    const effectiveProvider = provider || this.config.provider || "anthropic";
    const effectiveModel = model || this.config.defaultModel;

    // Serialize execution through session lane
    return enqueueInSessionLane(sessionId, async () => {
      // Create abort controller for this run
      const abortController = new AbortController();

      // Track active run
      const runId = `${sessionId}:${Date.now()}`;
      this.activeRuns.set(runId, {
        sessionId,
        startedAt: new Date(),
        abortController,
        provider: effectiveProvider,
      });

      this.emit("run:start", { runId, sessionId, provider: effectiveProvider });

      try {
        const params: AgentRunParams = {
          sessionId,
          prompt,
          workspaceDir: this.config.workspaceDir,
          model: effectiveModel,
          provider: effectiveProvider,
          apiKey: this.config.apiKey,
          bedrockConfig: this.config.bedrockConfig,
          tools: this.config.tools,
          onPartialReply,
          onToolExecution,
          onToolResult,
          abortSignal: abortController.signal,
        };

        const result = await runAgent(params);

        this.emit("run:end", { runId, sessionId, result });

        return result;
      } catch (error) {
        this.emit("run:error", { runId, sessionId, error });
        throw error;
      } finally {
        this.activeRuns.delete(runId);
      }
    });
  }

  /**
   * Get session history
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    const sessionFile = resolveSessionFile(this.sessionsDir, sessionId);
    return loadSession(sessionFile);
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<string[]> {
    const fs = await import("node:fs/promises");

    try {
      const files = await fs.readdir(this.sessionsDir);
      return files
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => f.replace(".jsonl", ""));
    } catch {
      return [];
    }
  }

  /**
   * Cancel an active run
   */
  cancelRun(sessionId: string): boolean {
    for (const [runId, run] of this.activeRuns) {
      if (run.sessionId === sessionId) {
        run.abortController.abort();
        this.emit("run:cancelled", { runId, sessionId });
        return true;
      }
    }
    return false;
  }

  /**
   * Get active runs
   */
  getActiveRuns(): Array<{
    runId: string;
    sessionId: string;
    startedAt: Date;
    provider: Provider;
  }> {
    return Array.from(this.activeRuns.entries()).map(([runId, run]) => ({
      runId,
      sessionId: run.sessionId,
      startedAt: run.startedAt,
      provider: run.provider,
    }));
  }

  /**
   * Get daemon statistics
   */
  getStats(): {
    activeRuns: number;
    activeLanes: number;
    totalQueuedTasks: number;
    provider: Provider;
  } {
    const laneStats = getLaneStats();
    return {
      activeRuns: this.activeRuns.size,
      provider: this.getProvider(),
      ...laneStats,
    };
  }
}

/**
 * Create a daemon instance
 */
export function createDaemon(config: DaemonConfig): AgentDaemon {
  return new AgentDaemon(config);
}
