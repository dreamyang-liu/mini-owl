/**
 * Session Manager - Handles conversation history persistence
 *
 * Inspired by OpenClaw's session management in:
 * - /agents/pi-embedded-runner/session-manager-init.ts
 * - /agents/pi-embedded-runner/session-manager-cache.ts
 *
 * Key concepts:
 * - Sessions are stored as JSONL files (one JSON object per line)
 * - Each line represents a message in the conversation
 * - Write locks prevent concurrent modifications
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Message } from "../types.js";

export interface SessionData {
  sessionId: string;
  messages: Message[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    model?: string;
    provider?: string;
  };
}

// Simple write lock to prevent concurrent session modifications
const sessionLocks = new Map<string, Promise<void>>();

async function acquireSessionLock(sessionFile: string): Promise<() => void> {
  // Wait for any existing lock
  const existingLock = sessionLocks.get(sessionFile);
  if (existingLock) {
    await existingLock;
  }

  // Create a new lock
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  sessionLocks.set(sessionFile, lockPromise);

  return () => {
    sessionLocks.delete(sessionFile);
    releaseLock!();
  };
}

/**
 * Load session from a JSONL file
 */
export async function loadSession(sessionFile: string): Promise<SessionData | null> {
  try {
    const content = await fs.readFile(sessionFile, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    if (lines.length === 0) {
      return null;
    }

    // First line is metadata, rest are messages
    const metadata = JSON.parse(lines[0]);
    const messages: Message[] = lines.slice(1).map((line) => JSON.parse(line));

    return {
      sessionId: metadata.sessionId,
      messages,
      metadata: {
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
        model: metadata.model,
        provider: metadata.provider,
      },
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Save session to a JSONL file
 */
export async function saveSession(
  sessionFile: string,
  session: SessionData
): Promise<void> {
  const release = await acquireSessionLock(sessionFile);

  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });

    // Build JSONL content
    const metadataLine = JSON.stringify({
      sessionId: session.sessionId,
      createdAt: session.metadata.createdAt,
      updatedAt: new Date().toISOString(),
      model: session.metadata.model,
      provider: session.metadata.provider,
    });

    const messageLines = session.messages.map((msg) => JSON.stringify(msg));
    const content = [metadataLine, ...messageLines].join("\n") + "\n";

    await fs.writeFile(sessionFile, content, "utf-8");
  } finally {
    release();
  }
}

/**
 * Append a message to an existing session
 */
export async function appendMessage(
  sessionFile: string,
  message: Message
): Promise<void> {
  const release = await acquireSessionLock(sessionFile);

  try {
    const line = JSON.stringify(message) + "\n";
    await fs.appendFile(sessionFile, line, "utf-8");
  } finally {
    release();
  }
}

/**
 * Create a new session
 */
export function createSession(params: {
  sessionId: string;
  model?: string;
  provider?: string;
}): SessionData {
  return {
    sessionId: params.sessionId,
    messages: [],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model: params.model,
      provider: params.provider,
    },
  };
}

/**
 * Resolve session file path from session ID
 */
export function resolveSessionFile(
  sessionsDir: string,
  sessionId: string
): string {
  // Sanitize session ID for file system
  const safeId = sessionId.replace(/[^a-zA-Z0-9-_]/g, "_");
  return path.join(sessionsDir, `${safeId}.jsonl`);
}

/**
 * Limit history to prevent context overflow
 * Keeps the first message (usually system context) and trims from the middle
 */
export function limitHistoryTurns(
  messages: Message[],
  maxTurns: number
): Message[] {
  if (messages.length <= maxTurns) {
    return messages;
  }

  // Keep first message and last (maxTurns - 1) messages
  const firstMessage = messages[0];
  const recentMessages = messages.slice(-(maxTurns - 1));

  return [firstMessage, ...recentMessages];
}
