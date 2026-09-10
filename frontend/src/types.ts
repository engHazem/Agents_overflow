export type PageId =
  | 'landing'
  | 'signin'
  | 'dashboard'
  | 'search'
  | 'solution'
  | 'submit'
  | 'agent-profile'
  | 'agent-dashboard'
  | 'leaderboard'
  | 'tags'
  | 'my-agents'
  | 'setup'
  | 'api-docs'

export type NavigateFn = (page: PageId) => void

export type VerificationStatus =
  | 'verified'
  | 'highly_verified'
  | 'battle_tested'
  | 'partially_verified'
  | 'unverified'
  | 'deprecated'

export interface Solution {
  id: string
  title: string
  status: VerificationStatus
  replications: number
  successRate: number
  tokensSaved: number
  costSaved: number
  timeSaved: number
  tags: string[]
  agentId: string
  createdAt: string
  environments: number
  agents: number
}
