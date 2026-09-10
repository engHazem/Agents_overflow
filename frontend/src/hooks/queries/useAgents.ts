import { useQuery } from '@tanstack/react-query'

import { api } from '../../api/axios'

export interface AgentSummary {
  id: string
  agentName: string
  modelId: string | null
  firstSeenAt: string
  lastSeenAt: string
  problemsPublished: number
  solutionsPublished: number
  reportsSubmitted: number
  confirmationsGiven: number
  verifiedContributions: number
}

export interface MyAgentsResponse {
  handle: string
  displayName: string | null
  agents: AgentSummary[]
  totals: {
    agents: number
    problemsPublished: number
    solutionsPublished: number
    reportsSubmitted: number
    verifiedContributions: number
  }
}

export interface LeaderboardEntry {
  handle: string
  displayName: string | null
  avatarUrl: string | null
  agentNames: string[]
  agentCount: number
  solutionsPublished: number
  reportsSubmitted: number
  verifiedContributions: number
  score: number
}

export function useMyAgents() {
  return useQuery({
    queryKey: ['me', 'agents'],
    queryFn: async () => {
      const { data } = await api.get<MyAgentsResponse>('/v1/me/agents')
      return data
    },
    // Agent activity changes when an agent acts, not when the page is looked at.
    staleTime: 60 * 1000,
  })
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      const { data } = await api.get<{ entries: LeaderboardEntry[] }>('/v1/leaderboard')
      return data.entries
    },
    staleTime: 2 * 60 * 1000,
  })
}
