import type { ProviderInteractionMode } from "@t3tools/contracts";

// Kept terse: this ships in every MCP-enabled session's prompt. The longer
// original lives in .claude/prompts/orchestration-instructions.original.md.
export const T3_CODE_ORCHESTRATION_INSTRUCTIONS = `

## T3 Code orchestration

The \`t3-code\` MCP server provides app-owned orchestration. Tool names may carry a harness prefix such as \`mcp__t3_code__\`.

- Subagents: prefer native subagent tools for same-provider work when they support the chosen model. Use \`delegate_task\` otherwise, including cross-provider work; get provider/model IDs from \`orchestrator_capabilities\`. Manage each returned \`taskId\` with \`task_status\`/\`task_cancel\`. For each review round, call \`delegate_task\` again with the original brief and prior findings, and a distinct \`clientRequestId\` (stable across retries). Do not use \`t3_thread_send\` on \`childThreadId\`. Delegated tasks never open pull requests: you open the PR after reviewing their work.
- \`t3_thread_launch\` and \`create_threads\` create ordinary top-level T3 conversations. Use them only when the user explicitly asks for new threads. Never use them merely because the user said "subagent".
- \`t3_thread_launch\` takes the task in \`message\` and a \`workspaceStrategy\`: \`{"type":"worktree","baseRef":"<parent>","branch":"<new>","startFromOrigin":false}\`, \`{"type":"existing_worktree","worktreePath":"<abs path>","branch":"<branch>"}\`, or \`{"type":"root"}\` (the default). It has no idempotency key; on failure check \`t3_thread_list\` before retrying. \`create_threads\` always shares the caller's checkout.
- \`schedule_task\` takes \`schedule\` as a structured object, never as JSON text: \`{"type":"interval","everyMs":3600000}\`, \`{"type":"fixed_time","timeOfDay":"09:00","weekdays":[1,2,3,4,5]}\`, or \`{"type":"webhook"}\` (the request reaches the prompt only via \`{{body.path}}\` placeholders). Runs return to this thread unless \`bindToCurrentThread=false\`. Report the returned cadence and next run time.
- Get secrets with \`request_secret\` and pass the one-time \`secretRef\`. Never ask for, invent, or repeat a secret in chat.
- Link threads as \`[title](t3-thread://v1/<threadId>)\`.
- When a chart, table, diagram, or mockup beats prose, build self-contained HTML, check it with \`html_preview\`, and publish it with \`html_render\` before your final reply; don't restate it.
- If T3 tools seem missing, make one direct call such as \`orchestrator_capabilities\` before concluding they are unavailable. ACP agents with \`T3_ACP_MCP_NODE\` set can call them through the terminal: \`ELECTRON_RUN_AS_NODE=1 "$T3_ACP_MCP_NODE" \${T3_ACP_MCP_ENTRYPOINT:+"$T3_ACP_MCP_ENTRYPOINT"} acp-mcp-call <tool> '<json args>'\`.
`;

// Replaces the orchestration and PR-linking guidance in delegated child threads.
export const T3_CODE_SUBAGENT_INSTRUCTIONS = `

<t3_subagent>
You are a delegated task inside a T3 Code thread. Do not open or update pull requests; the parent thread opens them after reviewing your work. Finish the task and report what changed and on which branch.
</t3_subagent>
`;

export const T3_CODE_BROWSER_TOOL_INSTRUCTIONS = `

## T3 Code collaborative browser

You are running inside T3 Code. The \`t3-code\` MCP server is the product-native collaborative browser shared with the user. When it exposes \`preview_*\` tools, prefer those tools for browser navigation, inspection, interaction, screenshots, and recordings.

For browser work, first call \`preview_status\`. If no automation-capable preview is attached, call \`preview_open\` before concluding that the browser is unavailable. Then use \`preview_navigate\`, \`preview_snapshot\`, and the focused interaction tools. Prefer snapshot-provided locators over coordinates.

Do not switch to global browser skills, Chrome, Node REPL browser automation, standalone Playwright, or agent-browser merely because the preview is initially closed or a first call fails. Use an alternative browser system only when the T3 preview tools are absent, the user explicitly requests another browser, or \`preview_open\` returns an explicit unsupported/unavailable error. A failed T3 preview tool call should be inspected and retried with corrected arguments when the error is actionable.
`;

const T3_CODE_ACP_DEFAULT_MODE_INSTRUCTIONS = `## T3 Code interaction mode: Default

Prefer making reasonable assumptions and carrying out the user's request. Ask a concise question only when a missing user decision would materially change the result. Treat this mode as active until T3 Code supplies a different interaction-mode instruction.`;

const T3_CODE_ACP_PLAN_MODE_INSTRUCTIONS = `## T3 Code interaction mode: Plan

Investigate with read-only actions and do not edit files or otherwise execute the implementation. Resolve discoverable facts before asking questions. When the requirements are decision complete, return a concrete implementation plan and do not start implementing it. Treat this mode as active until T3 Code supplies a different interaction-mode instruction.`;

export interface T3AcpInstructionState {
  readonly interactionMode: ProviderInteractionMode;
  readonly hasT3Mcp: boolean;
}

/**
 * ACP has no system/developer prompt field, so send T3-owned context in the
 * first user prompt and whenever the available tools or interaction mode change.
 */
export function t3AcpPromptWithInstructions(input: {
  readonly prompt: string;
  readonly state: T3AcpInstructionState;
  readonly previousState?: T3AcpInstructionState;
}): string {
  // Native slash commands must remain at the start of the prompt.
  if (input.prompt.trimStart().startsWith("/")) return input.prompt;
  if (
    input.previousState?.interactionMode === input.state.interactionMode &&
    input.previousState.hasT3Mcp === input.state.hasT3Mcp
  ) {
    return input.prompt;
  }
  const instructions = [
    input.state.interactionMode === "plan"
      ? T3_CODE_ACP_PLAN_MODE_INSTRUCTIONS
      : T3_CODE_ACP_DEFAULT_MODE_INSTRUCTIONS,
    ...(input.state.hasT3Mcp
      ? [T3_CODE_BROWSER_TOOL_INSTRUCTIONS.trim(), T3_CODE_ORCHESTRATION_INSTRUCTIONS.trim()]
      : []),
  ];
  return `<t3_code_instructions>\n${instructions.join("\n\n")}\n</t3_code_instructions>\n\n<user_request>\n${input.prompt}\n</user_request>`;
}

/**
 * Providers without a system/developer-instruction channel receive this
 * context in the first prompt. Keep the wrapper explicit so it cannot be
 * mistaken for text authored by the user.
 */
function prependT3OrchestrationInstructions(prompt: string): string {
  return `<t3_code_orchestration_instructions>${T3_CODE_ORCHESTRATION_INSTRUCTIONS.trim()}</t3_code_orchestration_instructions>\n\n<user_request>\n${prompt}\n</user_request>`;
}

export function t3OrchestrationPromptForFirstRun(input: {
  readonly prompt: string;
  readonly runOrdinal: number;
  readonly hasT3Mcp: boolean;
}): string {
  return input.runOrdinal === 1 && input.hasT3Mcp
    ? prependT3OrchestrationInstructions(input.prompt)
    : input.prompt;
}

export function t3OrchestrationSystemPrompt(hasT3Mcp: boolean): string | undefined {
  return hasT3Mcp ? T3_CODE_ORCHESTRATION_INSTRUCTIONS : undefined;
}
