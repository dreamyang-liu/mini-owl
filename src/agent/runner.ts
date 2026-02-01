/**
 * Agent Runner - Core execution engine
 *
 * Inspired by OpenClaw's /agents/pi-embedded-runner/run.ts
 *
 * Key concepts:
 * - Streaming responses from the LLM
 * - Tool execution loop (agent calls tool -> execute -> return result)
 * - Session history management
 * - Error handling and retries
 * - Multi-provider support (Anthropic API, OpenAI, AWS Bedrock)
 */

import Anthropic from "@anthropic-ai/sdk";
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import OpenAI from "openai";
import type {
  AgentRunParams,
  AgentRunResult,
  Message,
  Tool,
  ToolContext,
  Provider,
  BedrockConfig,
} from "../types.js";
import { toAnthropicTools, createCodingTools } from "../tools/index.js";
import {
  loadSession,
  saveSession,
  createSession,
  resolveSessionFile,
  limitHistoryTurns,
} from "../session/session-manager.js";
import { buildSystemPrompt, loadContextFiles } from "../prompts/system-prompt.js";
import fs from "node:fs/promises";

// Default models per provider
const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  bedrock: "us.anthropic.claude-sonnet-4-20250514-v1:0",
};

// Model ID mapping for Bedrock (short name -> full ARN)
const BEDROCK_MODEL_MAP: Record<string, string> = {
  // Claude 4 models
  "claude-sonnet-4": "us.anthropic.claude-sonnet-4-20250514-v1:0",
  "claude-opus-4": "us.anthropic.claude-opus-4-20250514-v1:0",
  // Claude 3.5 models
  "claude-3.5-sonnet": "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
  "claude-3.5-haiku": "us.anthropic.claude-3-5-haiku-20241022-v1:0",
  // Claude 3 models
  "claude-3-opus": "us.anthropic.claude-3-opus-20240229-v1:0",
  "claude-3-sonnet": "us.anthropic.claude-3-sonnet-20240229-v1:0",
  "claude-3-haiku": "us.anthropic.claude-3-haiku-20240307-v1:0",
};

const MAX_TOOL_ITERATIONS = 25;
const MAX_HISTORY_TURNS = 50;

// Unified client types
type AnthropicClient = Anthropic | AnthropicBedrock;
type LLMClient = AnthropicClient | OpenAI;

interface RunContext {
  client: LLMClient;
  tools: Tool[];
  toolContext: ToolContext;
  sessionId: string;
  model: string;
  provider: Provider;
  onPartialReply?: (text: string) => void;
  onToolExecution?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: string) => void;
}

/**
 * Create the appropriate client based on provider
 */
function createClient(
  provider: Provider,
  apiKey?: string,
  bedrockConfig?: BedrockConfig
): LLMClient {
  if (provider === "bedrock") {
    const config: ConstructorParameters<typeof AnthropicBedrock>[0] = {};

    // Region from config or environment
    if (bedrockConfig?.region) {
      config.awsRegion = bedrockConfig.region;
    } else if (process.env.AWS_REGION) {
      config.awsRegion = process.env.AWS_REGION;
    } else if (process.env.AWS_DEFAULT_REGION) {
      config.awsRegion = process.env.AWS_DEFAULT_REGION;
    }

    // Explicit credentials if provided
    if (bedrockConfig?.accessKeyId && bedrockConfig?.secretAccessKey) {
      config.awsAccessKey = bedrockConfig.accessKeyId;
      config.awsSecretKey = bedrockConfig.secretAccessKey;
      if (bedrockConfig.sessionToken) {
        config.awsSessionToken = bedrockConfig.sessionToken;
      }
    }

    return new AnthropicBedrock(config);
  }

  if (provider === "openai") {
    return new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  // Default to Anthropic API
  return new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });
}

/**
 * Resolve model ID for the given provider
 */
function resolveModel(model: string | undefined, provider: Provider): string {
  if (!model) {
    return DEFAULT_MODELS[provider];
  }

  // For Bedrock, check if we need to map the model name
  if (provider === "bedrock") {
    // If it's already a full ARN, use it
    if (model.includes("anthropic.claude")) {
      return model;
    }
    // Try to map short name to full ARN
    const mapped = BEDROCK_MODEL_MAP[model];
    if (mapped) {
      return mapped;
    }
    // If not found, assume it's a valid model ID
    return model;
  }

  return model;
}

/**
 * Execute a single tool call
 */
async function executeTool(
  ctx: RunContext,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: string; isError?: boolean }> {
  const tool = ctx.tools.find((t) => t.name === toolName);

  if (!tool) {
    return {
      content: `Error: Unknown tool "${toolName}"`,
      isError: true,
    };
  }

  ctx.onToolExecution?.(toolName, args);

  try {
    const result = await tool.execute(args, ctx.toolContext);
    ctx.onToolResult?.(toolName, result.content);
    return result;
  } catch (error) {
    const err = error as Error;
    const errorMessage = `Error executing tool ${toolName}: ${err.message}`;
    ctx.onToolResult?.(toolName, errorMessage);
    return { content: errorMessage, isError: true };
  }
}

/**
 * Convert our Message format to Anthropic message format
 */
function toAnthropicMessages(
  messages: Message[]
): Anthropic.Messages.MessageParam[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        // Assistant message with tool calls
        const content: Anthropic.Messages.ContentBlockParam[] = [];

        if (m.content) {
          content.push({ type: "text", text: m.content });
        }

        for (const toolCall of m.toolCalls) {
          content.push({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.arguments,
          });
        }

        return { role: "assistant" as const, content };
      }

      if (m.role === "user" && m.toolResults && m.toolResults.length > 0) {
        // User message with tool results
        const content: Anthropic.Messages.ToolResultBlockParam[] = m.toolResults.map(
          (tr) => ({
            type: "tool_result" as const,
            tool_use_id: tr.toolCallId,
            content: tr.content,
            is_error: tr.isError,
          })
        );

        return { role: "user" as const, content };
      }

      // Regular text message
      return {
        role: m.role as "user" | "assistant",
        content: m.content,
      };
    });
}

/**
 * Convert our Message format to OpenAI message format
 */
function toOpenAIMessages(
  messages: Message[],
  systemPrompt: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const m of messages) {
    if (m.role === "system") continue;

    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      // Assistant message with tool calls
      result.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      });
    } else if (m.role === "user" && m.toolResults && m.toolResults.length > 0) {
      // Tool results
      for (const tr of m.toolResults) {
        result.push({
          role: "tool",
          tool_call_id: tr.toolCallId,
          content: tr.content,
        });
      }
    } else {
      // Regular text message
      result.push({
        role: m.role as "user" | "assistant",
        content: m.content,
      });
    }
  }

  return result;
}

/**
 * Convert our Tool format to OpenAI tool format
 */
function toOpenAITools(tools: Tool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    },
  }));
}

/**
 * Run a single agent turn with OpenAI
 */
async function runOpenAIAgentTurn(
  ctx: RunContext,
  systemPrompt: string,
  messages: Message[]
): Promise<{
  response: string;
  newMessages: Message[];
  usage: { inputTokens: number; outputTokens: number };
}> {
  const client = ctx.client as OpenAI;
  const openaiTools = toOpenAITools(ctx.tools);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const newMessages: Message[] = [];
  let finalResponse = "";
  let iterations = 0;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const allMessages = toOpenAIMessages([...messages, ...newMessages], systemPrompt);

    // Make API call with streaming
    const stream = await client.chat.completions.create({
      model: ctx.model,
      max_tokens: 8192,
      messages: allMessages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      stream: true,
      stream_options: { include_usage: true },
    });

    let currentText = "";
    const toolCalls: Array<{
      id: string;
      name: string;
      arguments: string;
    }> = [];
    let currentToolCallIndex = -1;

    // Handle streaming events
    for await (const chunk of stream) {
      // Handle usage data
      if (chunk.usage) {
        totalInputTokens += chunk.usage.prompt_tokens || 0;
        totalOutputTokens += chunk.usage.completion_tokens || 0;
      }

      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Handle text content
      if (delta.content) {
        currentText += delta.content;
        ctx.onPartialReply?.(delta.content);
      }

      // Handle tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.index !== undefined && tc.index !== currentToolCallIndex) {
            currentToolCallIndex = tc.index;
            toolCalls[tc.index] = {
              id: tc.id || "",
              name: tc.function?.name || "",
              arguments: tc.function?.arguments || "",
            };
          } else if (tc.index !== undefined) {
            if (tc.id) toolCalls[tc.index].id = tc.id;
            if (tc.function?.name) toolCalls[tc.index].name += tc.function.name;
            if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments;
          }
        }
      }
    }

    // Parse tool call arguments
    const parsedToolCalls = toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments ? JSON.parse(tc.arguments) : {},
    }));

    // Add assistant message
    newMessages.push({
      role: "assistant",
      content: currentText,
      toolCalls: parsedToolCalls.length > 0 ? parsedToolCalls : undefined,
    });

    // If no tool calls, we're done
    if (parsedToolCalls.length === 0) {
      finalResponse = currentText;
      break;
    }

    // Execute tool calls
    const toolResults: Array<{
      toolCallId: string;
      content: string;
      isError?: boolean;
    }> = [];

    for (const toolCall of parsedToolCalls) {
      const result = await executeTool(ctx, toolCall.name, toolCall.arguments);
      toolResults.push({
        toolCallId: toolCall.id,
        content: result.content,
        isError: result.isError,
      });
    }

    // Add tool results as user message
    newMessages.push({
      role: "user",
      content: "",
      toolResults,
    });
  }

  return {
    response: finalResponse,
    newMessages,
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  };
}

/**
 * Run a single agent turn with Anthropic (may involve multiple tool calls)
 */
async function runAnthropicAgentTurn(
  ctx: RunContext,
  systemPrompt: string,
  messages: Message[]
): Promise<{
  response: string;
  newMessages: Message[];
  usage: { inputTokens: number; outputTokens: number };
}> {
  const client = ctx.client as AnthropicClient;
  const anthropicMessages = toAnthropicMessages(messages);
  const anthropicTools = toAnthropicTools(ctx.tools);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const newMessages: Message[] = [];
  let finalResponse = "";
  let iterations = 0;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    // Make API call with streaming
    const stream = client.messages.stream({
      model: ctx.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [...anthropicMessages, ...toAnthropicMessages(newMessages)],
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
    });

    let currentText = "";
    const toolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }> = [];

    // Handle streaming events
    stream.on("text", (text) => {
      currentText += text;
      ctx.onPartialReply?.(text);
    });

    // Wait for completion
    const response = await stream.finalMessage();

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Extract tool calls from response
    for (const block of response.content) {
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    // Add assistant message
    newMessages.push({
      role: "assistant",
      content: currentText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    });

    // If no tool calls, we're done
    if (toolCalls.length === 0) {
      finalResponse = currentText;
      break;
    }

    // Execute tool calls
    const toolResults: Array<{
      toolCallId: string;
      content: string;
      isError?: boolean;
    }> = [];

    for (const toolCall of toolCalls) {
      const result = await executeTool(ctx, toolCall.name, toolCall.arguments);
      toolResults.push({
        toolCallId: toolCall.id,
        content: result.content,
        isError: result.isError,
      });
    }

    // Add tool results as user message
    newMessages.push({
      role: "user",
      content: "",
      toolResults,
    });

    // Check stop reason - if end_turn, we're done even with tool calls
    if (response.stop_reason === "end_turn") {
      finalResponse = currentText;
      break;
    }
  }

  return {
    response: finalResponse,
    newMessages,
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  };
}

/**
 * Main agent runner function
 *
 * This orchestrates the full agent execution:
 * 1. Load or create session
 * 2. Build system prompt with tools and context
 * 3. Run agent turn (may involve multiple tool iterations)
 * 4. Save session and return result
 *
 * Supports multiple providers:
 * - "anthropic" (default): Direct Anthropic API
 * - "bedrock": AWS Bedrock
 */
export async function runAgent(params: AgentRunParams): Promise<AgentRunResult> {
  const {
    sessionId,
    prompt,
    workspaceDir,
    provider = "anthropic",
    apiKey,
    bedrockConfig,
    tools: customTools,
    onPartialReply,
    onToolExecution,
    onToolResult,
    abortSignal,
  } = params;

  // Resolve model for the provider
  const model = resolveModel(params.model, provider);

  // Create appropriate client
  const client = createClient(provider, apiKey, bedrockConfig);

  // Resolve session file
  const sessionsDir = `${workspaceDir}/.agent/sessions`;
  const sessionFile = params.sessionFile || resolveSessionFile(sessionsDir, sessionId);

  // Load or create session
  let session = await loadSession(sessionFile);
  if (!session) {
    session = createSession({ sessionId, model, provider });
  }

  // Create tools
  const tools = customTools || createCodingTools();

  // Load context files
  const contextFiles = await loadContextFiles(workspaceDir, fs);

  // Build system prompt
  const systemPrompt = buildSystemPrompt({
    workspaceDir,
    tools,
    contextFiles,
    agentId: sessionId,
  });

  // Limit history to prevent context overflow
  const limitedHistory = limitHistoryTurns(session.messages, MAX_HISTORY_TURNS);

  // Add user message
  const userMessage: Message = { role: "user", content: prompt };
  const messages = [...limitedHistory, userMessage];

  // Create run context
  const ctx: RunContext = {
    client,
    tools,
    toolContext: {
      workspaceDir,
      abortSignal,
    },
    sessionId,
    model,
    provider,
    onPartialReply,
    onToolExecution,
    onToolResult,
  };

  try {
    // Run agent turn (dispatch to appropriate provider)
    const result = provider === "openai"
      ? await runOpenAIAgentTurn(ctx, systemPrompt, messages)
      : await runAnthropicAgentTurn(ctx, systemPrompt, messages);

    // Update session with new messages
    session.messages = [
      ...limitedHistory,
      userMessage,
      ...result.newMessages,
    ];
    session.metadata.updatedAt = new Date().toISOString();
    session.metadata.model = model;

    // Save session
    await saveSession(sessionFile, session);

    return {
      response: result.response,
      messages: session.messages,
      usage: result.usage,
    };
  } catch (error) {
    const err = error as Error;

    // Check for specific error types
    if (err.message.includes("context_length_exceeded") || err.message.includes("too many tokens")) {
      return {
        response: "",
        messages: session.messages,
        error: {
          kind: "context_overflow",
          message: "Context length exceeded. Try starting a new session or using a smaller prompt.",
        },
      };
    }

    if (err.message.includes("rate_limit") || err.message.includes("ThrottlingException")) {
      return {
        response: "",
        messages: session.messages,
        error: {
          kind: "rate_limit",
          message: "Rate limit exceeded. Please wait before trying again.",
        },
      };
    }

    if (err.message.includes("AccessDeniedException") || err.message.includes("UnauthorizedException")) {
      return {
        response: "",
        messages: session.messages,
        error: {
          kind: "auth_error",
          message: `Authentication failed for ${provider}. Check your credentials.`,
        },
      };
    }

    if (err.message.includes("ResourceNotFoundException") || err.message.includes("model not found")) {
      return {
        response: "",
        messages: session.messages,
        error: {
          kind: "model_not_found",
          message: `Model "${model}" not found or not enabled for ${provider}.`,
        },
      };
    }

    return {
      response: "",
      messages: session.messages,
      error: {
        kind: "unknown",
        message: err.message,
      },
    };
  }
}

/**
 * Get list of available Bedrock model shortcuts
 */
export function getBedrockModelShortcuts(): Record<string, string> {
  return { ...BEDROCK_MODEL_MAP };
}
