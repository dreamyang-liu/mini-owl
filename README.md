# 🦉 Mini-Owl

```
  ╔═══════════════════════════════════════════════════════════════╗
  ║   ███╗   ███╗██╗███╗   ██╗██╗        ██████╗██╗      █████╗  ║
  ║   ████╗ ████║██║████╗  ██║██║       ██╔════╝██║     ██╔══██╗ ║
  ║   ██╔████╔██║██║██╔██╗ ██║██║━━━━━━━██║     ██║     ███████║ ║
  ║   ██║╚██╔╝██║██║██║╚██╗██║██║       ██║     ██║     ██╔══██║ ║
  ║   ██║ ╚═╝ ██║██║██║ ╚████║██║       ╚██████╗███████╗██║  ██║ ║
  ║   ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝        ╚═════╝╚══════╝╚═╝  ╚═╝ ║
  ║                                                               ║
  ║   A minimal AI agent daemon inspired by OpenClaw              ║
  ╚═══════════════════════════════════════════════════════════════╝
```

A minimal implementation of an AI agent daemon inspired by the OpenClaw architecture. This demonstrates the core patterns for building an LLM-powered coding agent with tool use, session management, and streaming responses.

## Quick Start

```bash
# Install dependencies
npm install

# Set your API key
export ANTHROPIC_API_KEY=your-key-here

# Run interactive mode
npm run mini-owl -- --interactive

# Or with a single prompt
npm run mini-owl -- "List all files in this directory"
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent Daemon                            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Request Router                        ││
│  │         (Lanes for session serialization)               ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Agent Runner                          ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ││
│  │  │ System Prompt│  │  Tool Loop   │  │   Streaming  │  ││
│  │  │   Builder    │  │  Execution   │  │   Handler    │  ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘  ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                  Session Manager                         ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ││
│  │  │ JSONL Store  │  │ Write Locks  │  │History Limit │  ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘  ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                      Tools                               ││
│  │  📖 read │ 📝 write │ ✏️ edit │ ⚡ exec │ 📁 ls │ 🔍 grep ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Features

- **🎨 Beautiful CLI** - Colorful output with ASCII art and emoji indicators
- **💬 Interactive Mode** - REPL-style conversation with session persistence
- **🔧 Tool Execution** - Built-in tools for file operations and shell commands
- **📁 Session Management** - JSONL-based conversation history with write locks
- **🚦 Lane System** - Serializes concurrent requests per session
- **🔄 Streaming** - Real-time response streaming with tool execution feedback

## CLI Usage

```bash
# Show help
npm run mini-owl -- --help

# Interactive mode
npm run mini-owl -- --interactive

# Single prompt
npm run mini-owl -- "What files are in this directory?"

# With custom session
npm run mini-owl -- --session my-project "Read the README.md"

# With custom workspace
npm run mini-owl -- --workspace /path/to/project "Explain the code"
```

### Interactive Commands

When in interactive mode:
- `/help` - Show available commands
- `/exit` - Exit mini-owl
- `/clear` - Clear screen
- `/session` - Show session info
- `/stats` - Show daemon statistics

## Key Components

### 1. Agent Daemon (`src/agent/daemon.ts`)
The main orchestrator that manages sessions and coordinates execution:
- Session lifecycle (create, list, history)
- Request routing through lanes
- Active run tracking and cancellation
- Event emission for monitoring

### 2. Agent Runner (`src/agent/runner.ts`)
Core execution engine inspired by OpenClaw's `pi-embedded-runner`:
- Streaming LLM responses
- Tool execution loop (agent requests tool → execute → return result)
- Handles multi-turn tool interactions
- Error handling (context overflow, rate limits)

### 3. Session Manager (`src/session/session-manager.ts`)
Handles conversation persistence:
- JSONL file format (one JSON object per line)
- Write locks prevent concurrent modifications
- History limiting to prevent context overflow

### 4. System Prompt Builder (`src/prompts/system-prompt.ts`)
Constructs the system prompt with:
- Tool descriptions
- Workspace context
- Injected context files (SOUL.md, MEMORY.md)
- Runtime information

### 5. Lanes (`src/agent/lanes.ts`)
Serializes concurrent requests per session:
- Prevents race conditions in session state
- Each session has its own execution queue
- Tasks are processed sequentially within a session

### 6. Tools (`src/tools/`)
Built-in tools for file operations and command execution:
- 📖 `read`: Read file contents with line numbers
- 📝 `write`: Create/overwrite files
- ✏️ `edit`: Precise string replacement edits
- ⚡ `exec`: Shell command execution with timeout
- 📁 `ls`: Directory listing
- 🔍 `grep`: Pattern search in files

## As a Library

```typescript
import { createDaemon } from "mini-owl";

const daemon = createDaemon({
  workspaceDir: process.cwd(),
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Run the agent
const result = await daemon.run({
  sessionId: "my-session",
  prompt: "List all TypeScript files and explain the project structure",
  onPartialReply: (text) => process.stdout.write(text),
  onToolExecution: (name, args) => console.log(`Tool: ${name}`),
});

console.log("Final response:", result.response);
console.log("Token usage:", result.usage);
```

## System Prompt Structure

The system prompt is constructed from multiple sections:

```
You are a helpful AI assistant with access to tools...

## Tooling
- read: Read file contents
- write: Create or overwrite files
- edit: Make precise edits to files
- exec: Run shell commands
- ls: List directory contents
- grep: Search for patterns

## Workspace
Your working directory is: /path/to/workspace

## Project Context
### SOUL.md
(agent persona and tone guidance)

### MEMORY.md
(long-term memory/notes)

## Response Guidelines
- Be concise and helpful
- Use tools when they help accomplish the task
- Report errors clearly if they occur

## Runtime
Runtime: agent=default | os=darwin | node=v20.0.0
```

## Context Files

Mini-Owl automatically loads markdown files from your workspace to customize behavior:

| File | Purpose | Example |
|------|---------|---------|
| `INSTRUCTIONS.md` | Task-specific instructions | "Be brief. Show code, don't explain." |
| `SOUL.md` | Agent persona and tone | "You are a friendly Python expert." |
| `MEMORY.md` | Persistent memory/notes | "User prefers tabs over spaces." |

Files can be placed in:
- Root of workspace: `./INSTRUCTIONS.md`
- Config directory: `./.mini-owl/INSTRUCTIONS.md`

Root files take priority over `.mini-owl/` directory files.

### Example INSTRUCTIONS.md

```markdown
# Project Instructions

## Response Style
- Be brief and direct
- Show code, don't just talk about it
- One sentence answers for simple questions

## Coding Preferences
- Use TypeScript
- Prefer functional style
- Add JSDoc comments
```

## Orchestration

### Lane System

The lane system ensures session integrity by serializing requests:

```typescript
// Multiple concurrent requests to same session are queued
await Promise.all([
  daemon.run({ sessionId: "a", prompt: "Task 1" }), // Runs first
  daemon.run({ sessionId: "a", prompt: "Task 2" }), // Waits for Task 1
  daemon.run({ sessionId: "b", prompt: "Task 3" }), // Runs concurrently
]);
```

### Active Run Management

```typescript
// Get active runs
const runs = daemon.getActiveRuns();
console.log("Active:", runs);

// Cancel a run
daemon.cancelRun("my-session");

// Get stats
const stats = daemon.getStats();
console.log("Stats:", stats);
```

## Extending

### Custom Tools

```typescript
import { createDaemon, type Tool } from "mini-owl";

const customTool: Tool = {
  name: "my_tool",
  description: "Does something useful",
  parameters: {
    type: "object",
    properties: {
      input: { type: "string", description: "Input value" },
    },
    required: ["input"],
  },
  async execute(args, ctx) {
    // Your tool logic here
    return { content: `Processed: ${args.input}` };
  },
};

const daemon = createDaemon({
  workspaceDir: process.cwd(),
  tools: [customTool],
});
```

### Event Handling

```typescript
daemon.on("run:start", ({ runId, sessionId }) => {
  console.log(`Started: ${runId}`);
});

daemon.on("run:end", ({ runId, sessionId, result }) => {
  console.log(`Completed: ${runId}`);
});

daemon.on("run:error", ({ runId, sessionId, error }) => {
  console.error(`Error: ${error.message}`);
});
```

## Comparison with OpenClaw

This minimal implementation captures the essence of OpenClaw's architecture while being much simpler:

| Feature | OpenClaw | Mini-Owl |
|---------|----------|-----------|
| Session Management | Full JSONL + compaction + DM limits | Basic JSONL |
| Tool System | 50+ tools with policies | 6 core tools |
| Auth Profiles | Multi-profile rotation | Single API key |
| Model Fallback | Chain of fallback models | Single model |
| Streaming | Block chunking + reasoning tags | Simple streaming |
| Channels | Telegram, Signal, Discord, etc. | CLI only |
| Lanes | Session + global lanes | Session lanes |
| CLI Experience | Basic | Colorful with ASCII art |

## License

MIT

---

*Inspired by [OpenClaw](https://github.com/openclaw/openclaw)*
