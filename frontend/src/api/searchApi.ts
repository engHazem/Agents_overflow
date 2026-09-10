import { api } from './axios'
import { normalizeSearchResponse, type UiSearchResponse } from './normalize'
import type { WireEnvironment, WireSearchRequest, WireSearchResponse } from './wire'

export interface SearchParams {
  /** Raw error text. Sent as-is — the backend normalizes it. */
  error: string
  context?: string
  environment?: WireEnvironment
  limit?: number
}

export async function searchSolutions(params: SearchParams): Promise<UiSearchResponse> {
  const body: WireSearchRequest = {
    error: params.error,
    ...(params.context ? { context: params.context } : {}),
    ...(params.environment ? { environment: params.environment } : {}),
    limit: params.limit ?? 10,
  }

  const { data } = await api.post<WireSearchResponse>('/v1/search', body)
  return normalizeSearchResponse(data)
}
