/**
 * Core types for the minimal agent daemon
 */

// Supported providers (priority order: anthropic > openai > bedrock)
export type Provider = "anthropic" | "openai" | "bedrock";

// Message roles in conversation
export type MessageRole = "user" | "assistant" | "system";

// A single message in the conversation
export interface Message {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

// Tool call made by the assistant
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// Result from executing a tool
export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

// Tool definition
export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolExecutionResult>;
}

export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
}

export interface ToolContext {
  workspaceDir: string;
  abortSignal?: AbortSignal;
}

export interface ToolExecutionResult {
  content: string;
  isError?: boolean;
}

// Session configuration
export interface SessionConfig {
  sessionId: string;
  workspaceDir: string;
  model?: string;
  provider?: Provider;
  systemPrompt?: string;
}

// Bedrock configuration
export interface BedrockConfig {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  profile?: string;
}

// Agent run parameters
export interface AgentRunParams {
  sessionId: string;
  prompt: string;
  sessionFile?: string;
  workspaceDir: string;
  model?: string;
  provider?: Provider;
  apiKey?: string;
  bedrockConfig?: BedrockConfig;
  tools?: Tool[];
  onPartialReply?: (text: string) => void;
  onToolExecution?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: string) => void;
  abortSignal?: AbortSignal;
}

// Agent run result
export interface AgentRunResult {
  response: string;
  messages: Message[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  error?: {
    kind: string;
    message: string;
  };
}

// Event types emitted during agent execution
export type AgentEvent =
  | { type: "message_start" }
  | { type: "message_delta"; text: string }
  | { type: "message_end"; text: string }
  | { type: "tool_start"; toolName: string; args: Record<string, unknown> }
  | { type: "tool_end"; toolName: string; result: string; isError?: boolean }
  | { type: "error"; error: Error };

export interface AgentEventHandler {
  (event: AgentEvent): void;
}

// System prompt builder parameters
export interface SystemPromptParams {
  workspaceDir: string;
  tools?: Tool[];
  contextFiles?: Array<{ path: string; content: string }>;
  userTimezone?: string;
  agentId?: string;
  extraInstructions?: string;
}
