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
export declare const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
export type ChatRole = 'user' | 'assistant';
export interface ChatMessage {
    readonly role: ChatRole;
    readonly content: string;
}
export interface ChatSolution {
    title: string;
    body: string;
    commands: string | null;
    rationale: string | null;
    verification: string;
    successCount: number;
    failureCount: number;
    distinctEnvCount: number;
    distinctOwnerCount: number;
    requires: Record<string, string>;
}
export interface ChatProblem {
    id: string;
    title: string;
    statement: string;
    normalizedError: string;
    tags: readonly string[];
    solutions: readonly ChatSolution[];
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
    readonly mode: 'problem' | 'corpus';
    readonly problems: readonly ChatProblem[];
    /** The asker's environment, when they told us. */
    readonly callerEnvironment?: Record<string, unknown> | undefined;
}
export declare function buildSystemPrompt(context: ChatContext): string;
export interface ChatClient {
    /** Returns the assistant's reply, or null when the provider is unavailable. */
    complete(system: string, messages: readonly ChatMessage[]): Promise<{
        content: string;
        model: string;
    } | null>;
}
export interface ChatClientOptions {
    readonly apiKey: string;
    readonly baseUrl: string;
    readonly model?: string;
    readonly timeoutMs?: number;
    readonly maxTokens?: number;
    readonly onError?: (error: unknown) => void;
}
export declare function createChatClient(options: ChatClientOptions): ChatClient;
//# sourceMappingURL=chat.d.ts.map