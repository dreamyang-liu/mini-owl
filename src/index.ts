/**
 * Mini-Owl - A Minimal Agent Daemon
 *
 * A minimal implementation of an AI agent daemon.
 */

// Main exports
export { AgentDaemon, createDaemon, type DaemonConfig, type RunOptions } from "./agent/daemon.js";
export { runAgent } from "./agent/runner.js";
export { enqueueInLane, enqueueInSessionLane, getLaneStats } from "./agent/lanes.js";

export {
  loadSession,
  saveSession,
  createSession,
  resolveSessionFile,
  limitHistoryTurns,
  type SessionData,
} from "./session/session-manager.js";

export { buildSystemPrompt, loadContextFiles } from "./prompts/system-prompt.js";

export {
  allTools,
  createCodingTools,
  toAnthropicTools,
  readTool,
  writeTool,
  editTool,
  execTool,
  lsTool,
  grepTool,
} from "./tools/index.js";

export type {
  Message,
  MessageRole,
  Tool,
  ToolCall,
  ToolResult,
  ToolParameter,
  ToolContext,
  ToolExecutionResult,
  SessionConfig,
  AgentRunParams,
  AgentRunResult,
  AgentEvent,
  AgentEventHandler,
  SystemPromptParams,
  Provider,
  BedrockConfig,
} from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// CLI Visual Components
// ═══════════════════════════════════════════════════════════════════════════════

const VERSION = "0.1.0";

// ANSI escape codes
const ESC = "\x1b";
const c = {
  reset: `${ESC}[0m`,
  bold: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  italic: `${ESC}[3m`,
  underline: `${ESC}[4m`,
  blink: `${ESC}[5m`,
  inverse: `${ESC}[7m`,
  hidden: `${ESC}[8m`,

  // Colors
  black: `${ESC}[30m`,
  red: `${ESC}[31m`,
  green: `${ESC}[32m`,
  yellow: `${ESC}[33m`,
  blue: `${ESC}[34m`,
  magenta: `${ESC}[35m`,
  cyan: `${ESC}[36m`,
  white: `${ESC}[37m`,
  gray: `${ESC}[90m`,

  // Bright colors
  brightRed: `${ESC}[91m`,
  brightGreen: `${ESC}[92m`,
  brightYellow: `${ESC}[93m`,
  brightBlue: `${ESC}[94m`,
  brightMagenta: `${ESC}[95m`,
  brightCyan: `${ESC}[96m`,
  brightWhite: `${ESC}[97m`,

  // Background
  bgBlack: `${ESC}[40m`,
  bgRed: `${ESC}[41m`,
  bgGreen: `${ESC}[42m`,
  bgYellow: `${ESC}[43m`,
  bgBlue: `${ESC}[44m`,
  bgMagenta: `${ESC}[45m`,
  bgCyan: `${ESC}[46m`,
  bgWhite: `${ESC}[47m`,

  // Cursor
  cursorHide: `${ESC}[?25l`,
  cursorShow: `${ESC}[?25h`,
  cursorUp: (n = 1) => `${ESC}[${n}A`,
  cursorDown: (n = 1) => `${ESC}[${n}B`,
  cursorForward: (n = 1) => `${ESC}[${n}C`,
  cursorBack: (n = 1) => `${ESC}[${n}D`,
  cursorTo: (x: number, y?: number) => y ? `${ESC}[${y};${x}H` : `${ESC}[${x}G`,
  clearLine: `${ESC}[2K`,
  clearScreen: `${ESC}[2J`,
};

// Gradient colors for rainbow effects
const gradient = [
  `${ESC}[38;5;196m`, // red
  `${ESC}[38;5;208m`, // orange
  `${ESC}[38;5;226m`, // yellow
  `${ESC}[38;5;46m`,  // green
  `${ESC}[38;5;51m`,  // cyan
  `${ESC}[38;5;21m`,  // blue
  `${ESC}[38;5;201m`, // magenta
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════════
// ASCII Art & Graphics
// ═══════════════════════════════════════════════════════════════════════════════

const MAIN_LOGO = `
${c.brightCyan}  ╔═══════════════════════════════════════════════════════════════════╗
  ║          ${c.brightYellow}███╗   ███╗${c.white}██╗${c.brightYellow}███╗   ██╗${c.white}██╗${c.brightCyan}━━${c.yellow} ██████╗ ${c.brightYellow}██╗    ██╗${c.yellow}██╗     ${c.brightCyan} ║
  ║  ${c.yellow},___,${c.brightCyan}  ${c.brightYellow} ████╗ ████║${c.white}██║${c.brightYellow}████╗  ██║${c.white}██║${c.brightCyan}  ${c.yellow}██╔═══██╗${c.brightYellow}██║    ██║${c.yellow}██║     ${c.brightCyan} ║
  ║ ${c.yellow}[${c.brightCyan} O${c.white}.${c.brightCyan}O${c.yellow} ]${c.brightCyan} ${c.brightYellow} ██╔████╔██║${c.white}██║${c.brightYellow}██╔██╗ ██║${c.white}██║${c.brightCyan}  ${c.yellow}██║   ██║${c.brightYellow}██║ █╗ ██║${c.yellow}██║     ${c.brightCyan} ║
  ║  ${c.yellow}/)__)${c.brightCyan}  ${c.brightYellow} ██║╚██╔╝██║${c.white}██║${c.brightYellow}██║╚██╗██║${c.white}██║${c.brightCyan}  ${c.yellow}██║   ██║${c.brightYellow}██║███╗██║${c.yellow}██║     ${c.brightCyan} ║
  ║ ${c.yellow}-''--''-${c.brightCyan}${c.brightYellow} ██║ ╚═╝ ██║${c.white}██║${c.brightYellow}██║ ╚████║${c.white}██║${c.brightCyan}  ${c.yellow}╚██████╔╝${c.brightYellow}╚███╔███╔╝${c.yellow}███████╗${c.brightCyan} ║
  ║          ${c.gray} ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝   ╚═════╝  ╚══╝╚══╝ ╚══════╝${c.brightCyan}║
  ╚═══════════════════════════════════════════════════════════════════╝${c.reset}
`;

const COMPACT_LOGO = `${c.brightCyan}
  ╭──────────────────────────────────────────────────────╮
  │  ${c.brightYellow}┏┳┓┳┏┓╻┳  ${c.yellow}┏━┓╻ ╻╻  ${c.brightCyan}  ${c.gray}v${VERSION}${c.brightCyan}                       │
  │  ${c.brightYellow}┃┃┃┃┃┗┫┃  ${c.yellow}┃ ┃┃╻┃┃  ${c.brightCyan}  ${c.dim}minimal agent daemon${c.reset}${c.brightCyan}      │
  │  ${c.brightYellow}╹ ╹╹╹ ╹╹  ${c.yellow}┗━┛┗┻┛┗━╸${c.brightCyan}                           │
  ╰──────────────────────────────────────────────────────╯
${c.reset}`;

// ═══════════════════════════════════════════════════════════════════════════════
// Animation & Visual Effects
// ═══════════════════════════════════════════════════════════════════════════════

async function typewriterEffect(text: string, delay: number = 20): Promise<void> {
  for (const char of text) {
    process.stdout.write(char);
    await sleep(delay);
  }
}

async function progressBar(label: string, duration: number = 500): Promise<void> {
  const width = 30;
  const steps = 20;
  const stepTime = duration / steps;

  process.stdout.write(c.cursorHide);

  for (let i = 0; i <= steps; i++) {
    const filled = Math.round((i / steps) * width);
    const empty = width - filled;
    const percent = Math.round((i / steps) * 100);

    const bar = `${c.brightCyan}${'█'.repeat(filled)}${c.gray}${'░'.repeat(empty)}${c.reset}`;
    process.stdout.write(`\r  ${c.dim}${label}${c.reset} ${bar} ${c.brightWhite}${percent}%${c.reset}`);

    await sleep(stepTime);
  }

  process.stdout.write(`\r${c.clearLine}`);
  process.stdout.write(c.cursorShow);
}

async function spinnerWithMessage(message: string, duration: number = 1000): Promise<void> {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const colors = [c.brightCyan, c.brightBlue, c.brightMagenta, c.brightCyan];
  const startTime = Date.now();
  let i = 0;

  process.stdout.write(c.cursorHide);

  while (Date.now() - startTime < duration) {
    const color = colors[Math.floor(i / 2) % colors.length];
    process.stdout.write(`\r  ${color}${frames[i % frames.length]}${c.reset} ${c.dim}${message}${c.reset}`);
    await sleep(80);
    i++;
  }

  process.stdout.write(`\r${c.clearLine}`);
  process.stdout.write(c.cursorShow);
}

function rainbowText(text: string): string {
  let result = '';
  let colorIndex = 0;

  for (const char of text) {
    if (char !== ' ' && char !== '\n') {
      result += gradient[colorIndex % gradient.length] + char;
      colorIndex++;
    } else {
      result += char;
    }
  }

  return result + c.reset;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Startup Sequence
// ═══════════════════════════════════════════════════════════════════════════════

async function runStartupSequence(sessionId: string, workspaceDir: string, model?: string, providerDisplay?: string): Promise<void> {
  console.clear();

  // Show logo (with integrated owl mascot)
  console.log(MAIN_LOGO);

  process.stdout.write(`  ${c.dim}`);
  await typewriterEffect('A minimal AI agent daemon', 15);
  console.log(c.reset);
  console.log();

  // Loading sequence
  await spinnerWithMessage('Initializing systems...', 400);
  await progressBar('Loading tools', 300);
  await progressBar('Preparing workspace', 300);
  const connectMsg = providerDisplay?.includes('Bedrock')
    ? 'Connecting to AWS Bedrock...'
    : providerDisplay?.includes('OpenAI')
      ? 'Connecting to OpenAI API...'
      : 'Connecting to Anthropic API...';
  await spinnerWithMessage(connectMsg, 300);

  // Success indicators
  console.log(`  ${c.brightGreen}✓${c.reset} ${c.dim}Systems initialized${c.reset}`);
  console.log(`  ${c.brightGreen}✓${c.reset} ${c.dim}Tools loaded${c.reset} ${c.gray}(read, write, edit, exec, ls, grep)${c.reset}`);
  console.log(`  ${c.brightGreen}✓${c.reset} ${c.dim}Provider connected${c.reset}`);
  console.log();

  // Session info box
  const boxWidth = 62;
  console.log(`  ${c.brightCyan}┌${'─'.repeat(boxWidth)}┐${c.reset}`);
  console.log(`  ${c.brightCyan}│${c.reset} ${c.bold}${c.brightWhite}SESSION INFO${c.reset}${' '.repeat(boxWidth - 13)}${c.brightCyan}│${c.reset}`);
  console.log(`  ${c.brightCyan}├${'─'.repeat(boxWidth)}┤${c.reset}`);
  console.log(`  ${c.brightCyan}│${c.reset}  ${c.cyan}ID:${c.reset}        ${c.brightGreen}${sessionId}${c.reset}${' '.repeat(Math.max(0, boxWidth - 14 - sessionId.length))}${c.brightCyan}│${c.reset}`);

  const displayWorkspace = workspaceDir.length > 45 ? '...' + workspaceDir.slice(-42) : workspaceDir;
  console.log(`  ${c.brightCyan}│${c.reset}  ${c.cyan}Workspace:${c.reset} ${c.yellow}${displayWorkspace}${c.reset}${' '.repeat(Math.max(0, boxWidth - 14 - displayWorkspace.length))}${c.brightCyan}│${c.reset}`);

  const displayModel = model || 'claude-sonnet-4-20250514';
  console.log(`  ${c.brightCyan}│${c.reset}  ${c.cyan}Model:${c.reset}     ${c.magenta}${displayModel}${c.reset}${' '.repeat(Math.max(0, boxWidth - 14 - displayModel.length))}${c.brightCyan}│${c.reset}`);

  if (providerDisplay) {
    // Strip ANSI codes for length calculation
    const plainProvider = providerDisplay.replace(/\x1b\[[0-9;]*m/g, '');
    console.log(`  ${c.brightCyan}│${c.reset}  ${c.cyan}Provider:${c.reset}  ${providerDisplay}${' '.repeat(Math.max(0, boxWidth - 14 - plainProvider.length))}${c.brightCyan}│${c.reset}`);
  }
  console.log(`  ${c.brightCyan}└${'─'.repeat(boxWidth)}┘${c.reset}`);
  console.log();

  // Tools showcase
  console.log(`  ${c.bold}${c.brightWhite}AVAILABLE TOOLS${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(40)}${c.reset}`);

  const tools = [
    { icon: '📖', name: 'read', desc: 'Read file contents', color: c.brightBlue },
    { icon: '📝', name: 'write', desc: 'Create/overwrite files', color: c.brightGreen },
    { icon: '✏️ ', name: 'edit', desc: 'Make precise edits', color: c.brightYellow },
    { icon: '⚡', name: 'exec', desc: 'Run shell commands', color: c.brightMagenta },
    { icon: '📁', name: 'ls', desc: 'List directories', color: c.brightCyan },
    { icon: '🔍', name: 'grep', desc: 'Search patterns', color: c.brightRed },
  ];

  for (const tool of tools) {
    await sleep(50);
    console.log(`  ${tool.icon} ${tool.color}${tool.name.padEnd(8)}${c.reset} ${c.dim}${tool.desc}${c.reset}`);
  }

  console.log();
  console.log(`  ${c.dim}Type ${c.yellow}/help${c.dim} for commands, ${c.yellow}/exit${c.dim} to quit${c.reset}`);
  console.log(`  ${c.dim}${'═'.repeat(62)}${c.reset}`);
  console.log();
}

async function runQuickStartup(sessionId: string, workspaceDir: string, model?: string, providerDisplay?: string): Promise<void> {
  console.log(COMPACT_LOGO);

  // Quick loading
  await spinnerWithMessage('Initializing...', 300);

  console.log(`  ${c.brightGreen}✓${c.reset} ${c.cyan}Session:${c.reset}   ${c.brightGreen}${sessionId}${c.reset}`);
  console.log(`  ${c.brightGreen}✓${c.reset} ${c.cyan}Workspace:${c.reset} ${c.yellow}${workspaceDir}${c.reset}`);
  if (providerDisplay) {
    console.log(`  ${c.brightGreen}✓${c.reset} ${c.cyan}Provider:${c.reset}  ${providerDisplay}`);
  }
  console.log(`  ${c.brightGreen}✓${c.reset} ${c.cyan}Model:${c.reset}     ${c.magenta}${model || 'claude-sonnet-4-20250514'}${c.reset}`);
  console.log();
  console.log(`  ${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Print Functions
// ═══════════════════════════════════════════════════════════════════════════════

function printToolExecution(toolName: string, _args?: Record<string, unknown>) {
  const icons: Record<string, string> = {
    read: '📖',
    write: '📝',
    edit: '✏️',
    exec: '⚡',
    ls: '📁',
    grep: '🔍',
  };
  const colors: Record<string, string> = {
    read: c.brightBlue,
    write: c.brightGreen,
    edit: c.brightYellow,
    exec: c.brightMagenta,
    ls: c.brightCyan,
    grep: c.brightRed,
  };

  const icon = icons[toolName] || '🔧';
  const color = colors[toolName] || c.white;

  console.log(`\n  ${c.dim}├─${c.reset} ${icon} ${c.bold}${color}${toolName}${c.reset}`);
}

function printToolResult(toolName: string, result: string) {
  const maxLen = 80;
  const firstLine = result.split('\n')[0];
  const preview = firstLine.length > maxLen ? firstLine.slice(0, maxLen) + '...' : firstLine;
  const isError = result.toLowerCase().includes('error');

  if (isError) {
    console.log(`  ${c.dim}│  ${c.red}✗${c.reset} ${c.dim}${preview}${c.reset}`);
  } else {
    console.log(`  ${c.dim}│  ${c.green}✓${c.reset} ${c.dim}${preview}${c.reset}`);
  }
}

function printHelp() {
  console.log(MAIN_LOGO);
  console.log(`
  ${c.bold}${c.brightWhite}USAGE${c.reset}
    ${c.cyan}$${c.reset} ${c.green}mini-owl${c.reset} ${c.yellow}[options]${c.reset} ${c.white}<prompt>${c.reset}
    ${c.cyan}$${c.reset} ${c.green}mini-owl${c.reset} ${c.yellow}--interactive${c.reset}

  ${c.bold}${c.brightWhite}OPTIONS${c.reset}
    ${c.yellow}--session${c.reset} ${c.dim}<id>${c.reset}      Session ID ${c.dim}(default: "default")${c.reset}
    ${c.yellow}--workspace${c.reset} ${c.dim}<dir>${c.reset}   Workspace directory ${c.dim}(default: cwd)${c.reset}
    ${c.yellow}--model${c.reset} ${c.dim}<name>${c.reset}      Model to use
    ${c.yellow}--provider${c.reset} ${c.dim}<name>${c.reset}   Provider: anthropic, openai, or bedrock ${c.dim}(auto-detect)${c.reset}
    ${c.yellow}--region${c.reset} ${c.dim}<region>${c.reset}   AWS region for Bedrock ${c.dim}(default: AWS_REGION env)${c.reset}
    ${c.yellow}--interactive${c.reset}       Start interactive REPL mode
    ${c.yellow}--quick${c.reset}             Skip startup animation
    ${c.yellow}--help${c.reset}, ${c.yellow}-h${c.reset}          Show this help message

  ${c.bold}${c.brightWhite}PROVIDERS${c.reset} ${c.dim}(auto-detected in priority order)${c.reset}
    ${c.brightCyan}anthropic${c.reset}  Direct Anthropic API ${c.dim}(requires ANTHROPIC_API_KEY)${c.reset}
    ${c.brightGreen}openai${c.reset}     OpenAI API ${c.dim}(requires OPENAI_API_KEY)${c.reset}
    ${c.brightYellow}bedrock${c.reset}    AWS Bedrock ${c.dim}(uses AWS credentials from env/profile)${c.reset}

  ${c.bold}${c.brightWhite}ENVIRONMENT${c.reset}
    ${c.magenta}ANTHROPIC_API_KEY${c.reset}   Anthropic API key ${c.dim}(for anthropic provider)${c.reset}
    ${c.magenta}OPENAI_API_KEY${c.reset}      OpenAI API key ${c.dim}(for openai provider)${c.reset}
    ${c.magenta}AWS_REGION${c.reset}          AWS region ${c.dim}(for bedrock provider)${c.reset}
    ${c.magenta}AWS_PROFILE${c.reset}         AWS profile ${c.dim}(for bedrock provider)${c.reset}
    ${c.magenta}AWS_ACCESS_KEY_ID${c.reset}   AWS access key ${c.dim}(for bedrock provider)${c.reset}
    ${c.magenta}AWS_SECRET_ACCESS_KEY${c.reset} AWS secret key ${c.dim}(for bedrock provider)${c.reset}

  ${c.bold}${c.brightWhite}BEDROCK MODELS${c.reset} ${c.dim}(shortcuts)${c.reset}
    ${c.gray}claude-sonnet-4${c.reset}     → us.anthropic.claude-sonnet-4-20250514-v1:0
    ${c.gray}claude-opus-4${c.reset}       → us.anthropic.claude-opus-4-20250514-v1:0
    ${c.gray}claude-3.5-sonnet${c.reset}   → us.anthropic.claude-3-5-sonnet-20241022-v2:0
    ${c.gray}claude-3.5-haiku${c.reset}    → us.anthropic.claude-3-5-haiku-20241022-v1:0

  ${c.bold}${c.brightWhite}EXAMPLES${c.reset}
    ${c.dim}# Interactive mode (auto-detects provider)${c.reset}
    ${c.cyan}$${c.reset} mini-owl --interactive

    ${c.dim}# Interactive mode with OpenAI${c.reset}
    ${c.cyan}$${c.reset} mini-owl --provider openai --interactive

    ${c.dim}# Interactive mode with AWS Bedrock${c.reset}
    ${c.cyan}$${c.reset} mini-owl --provider bedrock --region us-east-1 --interactive

    ${c.dim}# Single prompt (auto-detects provider)${c.reset}
    ${c.cyan}$${c.reset} mini-owl "List all files"

    ${c.dim}# Quick start (skip animation)${c.reset}
    ${c.cyan}$${c.reset} mini-owl --interactive --quick

    ${c.dim}# With custom session${c.reset}
    ${c.cyan}$${c.reset} mini-owl --session my-project "Read the README.md"

  ${c.bold}${c.brightWhite}INTERACTIVE COMMANDS${c.reset}
    ${c.yellow}/help${c.reset}       Show commands
    ${c.yellow}/exit${c.reset}       Exit mini-owl
    ${c.yellow}/clear${c.reset}      Clear screen
    ${c.yellow}/session${c.reset}    Show session info
    ${c.yellow}/stats${c.reset}      Show daemon stats

  ${c.bold}${c.brightWhite}TOOLS${c.reset}
    📖 ${c.brightBlue}read${c.reset}    Read file contents
    📝 ${c.brightGreen}write${c.reset}   Create/overwrite files
    ✏️  ${c.brightYellow}edit${c.reset}    Make precise edits
    ⚡ ${c.brightMagenta}exec${c.reset}    Run shell commands
    📁 ${c.brightCyan}ls${c.reset}      List directories
    🔍 ${c.brightRed}grep${c.reset}    Search patterns

  ${c.dim}${'─'.repeat(65)}${c.reset}
  ${c.dim}Mini-Owl • A minimal AI agent daemon${c.reset}
`);
}

function formatAssistantPrefix(): string {
  return `\n  ${c.brightMagenta}◆${c.reset} `;
}

function printGoodbye() {
  console.log(`
  ${c.dim}┌────────────────────────────────────┐${c.reset}
  ${c.dim}│${c.reset}                                    ${c.dim}│${c.reset}
  ${c.dim}│${c.reset}    ${c.yellow}Thanks for using Mini-Owl!${c.reset}      ${c.dim}│${c.reset}
  ${c.dim}│${c.reset}                                    ${c.dim}│${c.reset}
  ${c.dim}│${c.reset}         ${c.brightYellow}See you soon! 👋${c.reset}           ${c.dim}│${c.reset}
  ${c.dim}│${c.reset}                                    ${c.dim}│${c.reset}
  ${c.dim}└────────────────────────────────────┘${c.reset}
`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI Entry Point
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  const { createDaemon } = await import('./agent/daemon.js');
  const readline = await import('node:readline');
  type Provider = "anthropic" | "openai" | "bedrock";

  // Parse arguments
  let sessionId = 'default';
  let workspaceDir = process.cwd();
  let model: string | undefined;
  let provider: Provider | undefined;
  let region: string | undefined;
  let interactive = false;
  let quick = false;
  const promptParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--session' && args[i + 1]) {
      sessionId = args[++i];
    } else if (args[i] === '--workspace' && args[i + 1]) {
      workspaceDir = args[++i];
    } else if (args[i] === '--model' && args[i + 1]) {
      model = args[++i];
    } else if (args[i] === '--provider' && args[i + 1]) {
      const p = args[++i].toLowerCase();
      if (p === 'anthropic' || p === 'openai' || p === 'bedrock') {
        provider = p;
      } else {
        console.log(COMPACT_LOGO);
        console.error(`  ${c.red}✗${c.reset} ${c.bold}Invalid provider:${c.reset} ${p}`);
        console.error(`    Use ${c.yellow}anthropic${c.reset}, ${c.yellow}openai${c.reset}, or ${c.yellow}bedrock${c.reset}\n`);
        process.exit(1);
      }
    } else if (args[i] === '--region' && args[i + 1]) {
      region = args[++i];
    } else if (args[i] === '--interactive') {
      interactive = true;
    } else if (args[i] === '--quick') {
      quick = true;
    } else {
      promptParts.push(args[i]);
    }
  }

  // Auto-detect provider if not specified
  // Priority: anthropic > openai > bedrock
  if (!provider) {
    if (process.env.ANTHROPIC_API_KEY) {
      provider = 'anthropic';
    } else if (process.env.OPENAI_API_KEY) {
      provider = 'openai';
    } else if (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || region) {
      provider = 'bedrock';
    } else {
      // Default to anthropic, will show error about missing key
      provider = 'anthropic';
    }
  }

  // Check credentials based on provider
  if (provider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log(COMPACT_LOGO);
      console.error(`  ${c.red}✗${c.reset} ${c.bold}Missing API Key${c.reset}`);
      console.error(`    Set ${c.yellow}ANTHROPIC_API_KEY${c.reset} environment variable\n`);
      process.exit(1);
    }
  } else if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      console.log(COMPACT_LOGO);
      console.error(`  ${c.red}✗${c.reset} ${c.bold}Missing API Key${c.reset}`);
      console.error(`    Set ${c.yellow}OPENAI_API_KEY${c.reset} environment variable\n`);
      process.exit(1);
    }
  } else if (provider === 'bedrock') {
    // Bedrock uses AWS credentials - check if region is available
    const awsRegion = region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
    if (!awsRegion) {
      console.log(COMPACT_LOGO);
      console.error(`  ${c.red}✗${c.reset} ${c.bold}Missing AWS Region${c.reset}`);
      console.error(`    Set ${c.yellow}--region${c.reset} or ${c.yellow}AWS_REGION${c.reset} environment variable\n`);
      process.exit(1);
    }
  }

  // Create daemon with appropriate config
  const daemon = createDaemon({
    workspaceDir,
    defaultModel: model,
    provider,
    apiKey: provider === 'anthropic'
      ? process.env.ANTHROPIC_API_KEY
      : provider === 'openai'
        ? process.env.OPENAI_API_KEY
        : undefined,
    bedrockConfig: provider === 'bedrock' ? { region } : undefined,
  });

  // Display provider info
  const providerDisplay = provider === 'bedrock'
    ? `${c.brightYellow}AWS Bedrock${c.reset} ${c.dim}(${region || process.env.AWS_REGION || 'default region'})${c.reset}`
    : provider === 'openai'
      ? `${c.brightGreen}OpenAI${c.reset}`
      : `${c.brightCyan}Anthropic API${c.reset}`;

  if (interactive) {
    // Run startup sequence
    if (quick) {
      await runQuickStartup(sessionId, workspaceDir, model, providerDisplay);
    } else {
      await runStartupSequence(sessionId, workspaceDir, model, providerDisplay);
    }

    // Interactive REPL mode
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const askQuestion = () => {
      rl.question(`  ${c.brightGreen}❯${c.reset} `, async (input) => {
        const trimmed = input.trim();

        // Handle commands
        if (trimmed === '/exit' || trimmed === '/quit' || trimmed === 'exit' || trimmed === 'quit') {
          printGoodbye();
          rl.close();
          process.exit(0);
        }

        if (trimmed === '/help') {
          console.log(`
  ${c.bold}${c.brightWhite}COMMANDS${c.reset}
  ${c.dim}${'─'.repeat(40)}${c.reset}
    ${c.yellow}/help${c.reset}       Show this help
    ${c.yellow}/exit${c.reset}       Exit mini-owl
    ${c.yellow}/clear${c.reset}      Clear and show startup
    ${c.yellow}/session${c.reset}    Show session info
    ${c.yellow}/stats${c.reset}      Show daemon stats
    ${c.yellow}/tools${c.reset}      List available tools
`);
          askQuestion();
          return;
        }

        if (trimmed === '/clear') {
          if (quick) {
            await runQuickStartup(sessionId, workspaceDir, model, providerDisplay);
          } else {
            await runStartupSequence(sessionId, workspaceDir, model, providerDisplay);
          }
          askQuestion();
          return;
        }

        if (trimmed === '/session') {
          console.log(`
  ${c.cyan}┌─ Session Info ──────────────────────┐${c.reset}
  ${c.cyan}│${c.reset}  ID:        ${c.brightGreen}${sessionId}${c.reset}
  ${c.cyan}│${c.reset}  Workspace: ${c.yellow}${workspaceDir}${c.reset}
  ${c.cyan}│${c.reset}  Model:     ${c.magenta}${model || 'claude-sonnet-4-20250514'}${c.reset}
  ${c.cyan}│${c.reset}  Provider:  ${providerDisplay}
  ${c.cyan}└──────────────────────────────────────┘${c.reset}
`);
          askQuestion();
          return;
        }

        if (trimmed === '/stats') {
          const stats = daemon.getStats();
          console.log(`
  ${c.cyan}┌─ Daemon Stats ──────────────────────┐${c.reset}
  ${c.cyan}│${c.reset}  Provider:     ${providerDisplay}
  ${c.cyan}│${c.reset}  Active Runs:  ${c.brightWhite}${stats.activeRuns}${c.reset}
  ${c.cyan}│${c.reset}  Active Lanes: ${c.brightWhite}${stats.activeLanes}${c.reset}
  ${c.cyan}│${c.reset}  Queued Tasks: ${c.brightWhite}${stats.totalQueuedTasks}${c.reset}
  ${c.cyan}└──────────────────────────────────────┘${c.reset}
`);
          askQuestion();
          return;
        }

        if (trimmed === '/tools') {
          console.log(`
  ${c.bold}${c.brightWhite}AVAILABLE TOOLS${c.reset}
  ${c.dim}${'─'.repeat(40)}${c.reset}
    📖 ${c.brightBlue}read${c.reset}    Read file contents
    📝 ${c.brightGreen}write${c.reset}   Create/overwrite files
    ✏️  ${c.brightYellow}edit${c.reset}    Make precise edits
    ⚡ ${c.brightMagenta}exec${c.reset}    Run shell commands
    📁 ${c.brightCyan}ls${c.reset}      List directories
    🔍 ${c.brightRed}grep${c.reset}    Search patterns
`);
          askQuestion();
          return;
        }

        if (!trimmed) {
          askQuestion();
          return;
        }

        process.stdout.write(formatAssistantPrefix());

        try {
          const startTime = Date.now();

          await daemon.run({
            sessionId,
            prompt: trimmed,
            onPartialReply: (text) => process.stdout.write(text),
            onToolExecution: (name, args) => {
              printToolExecution(name, args);
            },
            onToolResult: (name, result) => {
              printToolResult(name, result);
            },
          });

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`\n\n  ${c.dim}─ ${elapsed}s ${c.gray}│${c.dim} tokens used${c.reset}\n`);
        } catch (error) {
          console.error(`\n\n  ${c.red}✗ Error:${c.reset} ${(error as Error).message}\n`);
        }

        askQuestion();
      });
    };

    // Handle Ctrl+C gracefully
    rl.on('close', () => {
      printGoodbye();
      process.exit(0);
    });

    askQuestion();
  } else {
    // Single prompt mode
    const prompt = promptParts.join(' ');

    if (!prompt) {
      console.log(COMPACT_LOGO);
      console.error(`  ${c.red}✗${c.reset} ${c.bold}No prompt provided${c.reset}\n`);
      console.log(`  ${c.dim}Usage: mini-owl "your prompt here"${c.reset}\n`);
      process.exit(1);
    }

    console.log(COMPACT_LOGO);
    await spinnerWithMessage('Initializing...', 200);

    console.log(`  ${c.cyan}Session:${c.reset}   ${c.brightGreen}${sessionId}${c.reset}`);
    console.log(`  ${c.cyan}Provider:${c.reset}  ${providerDisplay}`);
    console.log(`  ${c.cyan}Workspace:${c.reset} ${c.yellow}${workspaceDir}${c.reset}`);
    console.log(`  ${c.cyan}Prompt:${c.reset}    ${c.white}${prompt}${c.reset}`);
    console.log(`\n  ${c.dim}${'─'.repeat(60)}${c.reset}`);
    process.stdout.write(formatAssistantPrefix());

    try {
      const startTime = Date.now();

      await daemon.run({
        sessionId,
        prompt,
        onPartialReply: (text) => process.stdout.write(text),
        onToolExecution: (name, args) => {
          printToolExecution(name, args);
        },
        onToolResult: (name, result) => {
          printToolResult(name, result);
        },
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n\n  ${c.dim}─ Completed in ${elapsed}s${c.reset}\n`);
    } catch (error) {
      console.error(`\n\n  ${c.red}✗ Error:${c.reset} ${(error as Error).message}\n`);
      process.exit(1);
    }
  }
}

// Run main if this is the entry point
const isMain =
  process.argv[1]?.endsWith('index.ts') ||
  process.argv[1]?.endsWith('index.js');

if (isMain) {
  main().catch((error) => {
    console.error(`${c.red}Fatal error:${c.reset}`, error);
    process.exit(1);
  });
}
