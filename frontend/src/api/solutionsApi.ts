import { api } from './axios'
import {
  normalizeProblemDetail,
  normalizeProblemSummary,
  type UiProblemDetail,
  type UiProblemSummary,
} from './normalize'
import type {
  WireProblemDetail,
  WireProblemListResponse,
  WirePublishRequest,
  WirePublishResponse,
  WireReportRequest,
  WireReportResponse,
} from './wire'

export interface ProblemListParams {
  q?: string
  tag?: string
  verified?: boolean
  /** The backend paginates by limit/offset, not pages or cursors. */
  limit?: number
  offset?: number
}

export interface ProblemListResult {
  items: UiProblemSummary[]
  total: number
  limit: number
  offset: number
}

export async function fetchProblems(params: ProblemListParams = {}): Promise<ProblemListResult> {
  const { data } = await api.get<WireProblemListResponse>('/v1/problems', {
    params: {
      ...(params.q ? { q: params.q } : {}),
      ...(params.tag ? { tag: params.tag } : {}),
      ...(params.verified ? { verified: true } : {}),
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
    },
  })

  return {
    items: data.items.map(normalizeProblemSummary),
    total: data.total,
    limit: data.limit,
    offset: data.offset,
  }
}

export async function fetchProblem(id: string): Promise<UiProblemDetail> {
  const { data } = await api.get<WireProblemDetail>(`/v1/problems/${id}`)
  return normalizeProblemDetail(data)
}

export type PublishInput = WirePublishRequest
export type PublishResult = WirePublishResponse

export async function publishSolution(input: PublishInput): Promise<PublishResult> {
  const { data } = await api.post<WirePublishResponse>('/v1/publish', input)
  return data
}

export type ReportInput = WireReportRequest
export type ReportResult = WireReportResponse

/**
 * Reports whether a solution worked. This is the verification signal the whole
 * service runs on, so failures matter as much as successes.
 */
export async function reportOutcome(input: ReportInput): Promise<ReportResult> {
  const { data } = await api.post<WireReportResponse>('/v1/report', input)
  return data
}

export interface HealthResult {
  status: string
  embeddings: 'enabled' | 'disabled'
}

export async function fetchHealth(): Promise<HealthResult> {
  const { data } = await api.get<HealthResult>('/health')
  return data
}
