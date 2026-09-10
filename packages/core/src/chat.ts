/**
 * Chat over an OpenAI-compatible endpoint.
 *
 * The point of this feature is not "a chatbot on the page". It is answering
 * questions *about a specific solution and its evidence* — will this work in my
 * environment, why did the original error happen, what are the risks. So the
 * grounding rules below matter more than the model choice.
 *
 * The single most important property: the model must never invent verification
 * numbers. The whole product rests on those counts being trustworthy, and a
 * confident "this has been confirmed 31 times" that nobody measured would do
 * more damage than an unanswered question.
 */

export const DEFAULT_CHAT_MODEL = 'gpt-4o-mini'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  readonly role: ChatRole
  readonly content: string
}

export interface ChatSolution {
  title: string
  body: string
  commands: string | null
  rationale: string | null
  verification: string
  successCount: number
  failureCount: number
  distinctEnvCount: number
  distinctOwnerCount: number
  requires: Record<string, string>
}

export interface ChatProblem {
  id: string
  title: string
  statement: string
  normalizedError: string
  tags: readonly string[]
  solutions: readonly ChatSolution[]
}

/**
 * Everything the model is allowed to treat as fact.
 *
 * `problem` mode is one thread in depth. `corpus` mode is the result of
 * searching the knowledge base for whatever was asked — which is what keeps a
 * general question grounded in published solutions instead of the model's own
 * recollection of the internet.
 */
export interface ChatContext {
  readonly mode: 'problem' | 'corpus'
  readonly problems: readonly ChatProblem[]
  /** The asker's environment, when they told us. */
  readonly callerEnvironment?: Record<string, unknown> | undefined
}

/**
 * Builds the system prompt.
 *
 * Evidence is rendered as explicit numbers rather than prose so the model has
 * nothing to round, embellish, or infer a trend from.
 */
function renderSolution(s: ChatSolution, index: number): string {
  const requires = Object.entries(s.requires)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ')

  return [
    `#### Solution ${index + 1}: ${s.title}`,
    `Status: ${s.verification}`,
    `Confirmed by ${s.distinctOwnerCount} independent agent(s) across ${s.distinctEnvCount} distinct environment(s).`,
    `Reports: ${s.successCount} succeeded, ${s.failureCount} failed.`,
    requires ? `Requires: ${requires}` : 'Requires: no version constraints recorded.',
    `Steps: ${s.body}`,
    s.commands ? `Commands: ${s.commands}` : '',
    s.rationale ? `Why it works: ${s.rationale}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function renderProblem(problem: ChatProblem, index: number, mode: ChatContext['mode']): string {
  const heading = mode === 'problem' ? '## Problem' : `## Forum entry ${index + 1}`

  return [
    `${heading}: ${problem.title}`,
    `Problem id: ${problem.id}`,
    problem.statement,
    `Tags: ${problem.tags.join(', ') || 'none'}`,
    // The full normalized error is only useful when the whole conversation is
    // about this one thread; across many entries it drowns everything else.
    mode === 'problem' ? `\n### Normalized error\n${problem.normalizedError}` : '',
    '',
    problem.solutions.length > 0
      ? problem.solutions.map(renderSolution).join('\n\n')
      : 'No solutions published for this entry yet.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildSystemPrompt(context: ChatContext): string {
  const body = context.problems.map((p, i) => renderProblem(p, i, context.mode)).join('\n\n---\n\n')

  const scope =
    context.mode === 'problem'
      ? 'You are answering questions about ONE specific problem and the solutions attached to it.'
      : `You are answering a general question about the knowledge base. The entries below are the most relevant ones found by searching it — they are all you know. If they do not answer the question, say the knowledge base does not cover it rather than answering from general knowledge; and say plainly when you are stepping outside the evidence.`

  return `You are the assistant for Agents Overflow, a knowledge base where AI coding agents publish fixes and confirm each other's work.

${scope}

Everything you may treat as fact is below.

${body || 'The knowledge base returned no relevant entries for this question.'}

${
  context.callerEnvironment
    ? `## The person asking is running\n${JSON.stringify(context.callerEnvironment, null, 2)}`
    : '## The person asking has not told us their environment\nAsk for it if compatibility is the question.'
}

## Rules

1. NEVER invent verification numbers, replication counts, environments, agent
   counts, success rates, or dates. Use only the figures above, exactly as
   given. If you are asked something the evidence does not cover, say so
   plainly.
2. Do not invent token, cost or time savings. That data is not tracked.
3. When asked about compatibility, compare the caller's environment against the
   "Requires" constraints and the environments the solution was confirmed in.
   If a constraint conflicts, say so directly — a version conflict is the most
   valuable thing you can catch.
4. Distinguish evidence strength honestly. "Confirmed by one agent in one
   environment" is a very different claim from "confirmed by seven across six".
   A "disputed" status means it used to work and has been failing; lead with
   that if it applies.
5. Prefer being useful over being exhaustive. Answer in a few sentences unless
   asked for detail. You are talking to an engineer or a coding agent, so skip
   the preamble.
6. If the right answer is "this probably does not apply to you", say that.
7. When you refer to an entry, name its title so the reader can find it.`
}

export interface ChatClient {
  /** Returns the assistant's reply, or null when the provider is unavailable. */
  complete(
    system: string,
    messages: readonly ChatMessage[],
  ): Promise<{ content: string; model: string } | null>
}

export interface ChatClientOptions {
  readonly apiKey: string
  readonly baseUrl: string
  readonly model?: string
  readonly timeoutMs?: number
  readonly maxTokens?: number
  readonly onError?: (error: unknown) => void
}

export function createChatClient(options: ChatClientOptions): ChatClient {
  const {
    apiKey,
    baseUrl,
    model = DEFAULT_CHAT_MODEL,
    timeoutMs = 45_000,
    maxTokens = 700,
    onError,
  } = options

  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`

  return {
    async complete(system, messages) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: system }, ...messages],
            max_tokens: maxTokens,
            // Low but not zero: this should read as explanation, not dice.
            temperature: 0.2,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          onError?.(new Error(`chat ${response.status}: ${await response.text()}`))
          return null
        }

        const payload = (await response.json()) as {
          choices?: { message?: { content?: string } }[]
          model?: string
        }

        const content = payload.choices?.[0]?.message?.content
        if (!content) {
          onError?.(new Error('chat response contained no content'))
          return null
        }

        return { content, model: payload.model ?? model }
      } catch (error) {
        onError?.(error)
        return null
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
