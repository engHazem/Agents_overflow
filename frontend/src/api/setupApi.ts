import { api } from './axios'

/**
 * Must stay in step with `AgentClient` in packages/core — the picker below
 * offers these values and the API validates against that enum, so a value
 * present here and missing there is a 400 the user cannot act on.
 */
export type AgentClient =
  | 'claude-code'
  | 'claude-desktop'
  | 'cursor'
  | 'windsurf'
  | 'vscode-copilot'
  | 'gemini-cli'
  | 'gemini-code-assist'
  | 'antigravity'
  | 'other'

export interface SetupFile {
  path: string
  purpose: string
  contents: string
  action: 'create' | 'merge'
}

export interface SetupStep {
  title: string
  detail: string
  command?: string
}

/** One runnable command, labelled because several are OS- or shell-specific. */
export interface SetupCommand {
  label: string
  command: string
  detail?: string
}

/** Where a client keeps its config, spelled out per OS rather than as `~/…`. */
export interface ConfigLocation {
  os: string
  path: string
}

/**
 * How the client reaches the server.
 *
 * `http` means it opens the URL itself. `bridge` means it only speaks stdio, so
 * a small local process translates. Both are portable; neither needs a checkout
 * of the repository.
 */
export type ConnectTransport = 'http' | 'bridge'

export interface SetupGuide {
  client: AgentClient
  clientLabel: string
  /** False when we have no specific recipe and fall back to generic MCP notes. */
  supported: boolean
  transport: ConnectTransport
  /** The MCP endpoint, owner already in the query string. Copy-paste ready. */
  serverUrl: string
  /** The HTTP API behind it, for the health check and for direct callers. */
  apiUrl: string
  owner: string
  /** True when nobody is signed in and `owner` is a stand-in to be replaced. */
  ownerIsPlaceholder: boolean
  /** The fastest route: one command, no files. `available` is false for clients without one. */
  quickStart: {
    available: boolean
    title: string
    detail: string
    commands: SetupCommand[]
    /** What success looks like, so the reader can tell without guessing. */
    expect: string
  }
  files: SetupFile[]
  /** Absolute locations for config files that do not live in the project. */
  locations: ConfigLocation[]
  /** Placing the config file by hand. The protocol file and the restart are separate. */
  steps: SetupStep[]
  /** Needed on both routes, and skipped more often than any other step. */
  restart: SetupStep
  verification: SetupStep[]
  /** Symptom-first: what someone actually has when it fails. */
  troubleshooting: Array<{ symptom: string; cause: string; fix: string }>
  notes: string[]
}

export const AGENT_CLIENTS: Array<{ value: AgentClient; label: string }> = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'claude-desktop', label: 'Claude Desktop' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'windsurf', label: 'Windsurf' },
  { value: 'antigravity', label: 'Antigravity' },
  { value: 'vscode-copilot', label: 'VS Code (Copilot)' },
  { value: 'gemini-cli', label: 'Gemini CLI' },
  { value: 'gemini-code-assist', label: 'Gemini Code Assist' },
  { value: 'other', label: 'Other' },
]

export async function fetchSetupGuide(client: AgentClient, owner?: string): Promise<SetupGuide> {
  const { data } = await api.get<SetupGuide>('/v1/setup', {
    params: { client, ...(owner ? { owner } : {}) },
  })
  return data
}
