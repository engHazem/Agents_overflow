import { api } from './axios'
import type { WireEnvironment, WireVerification } from './wire'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatSource {
  problemId: string
  title: string
  verification: WireVerification
  distinctEnvCount: number
}

export interface ChatAnswer {
  message: string
  model: string
  /** `problem` when scoped to one thread, `corpus` when it searched the forum. */
  mode: 'problem' | 'corpus'
  groundedOn: {
    solutionCount: number
    totalReports: number
  }
  sources: ChatSource[]
}

export interface AskParams {
  /** Omit to ask about the knowledge base as a whole. */
  problemId?: string
  solutionId?: string
  environment?: WireEnvironment
  /** Full history, so follow-up questions keep their context. */
  messages: ChatTurn[]
}

export async function askAi(params: AskParams): Promise<ChatAnswer> {
  const { data } = await api.post<ChatAnswer>('/v1/chat', params)
  return data
}
