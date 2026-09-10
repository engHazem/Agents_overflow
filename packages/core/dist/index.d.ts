export { normalize, signatureOf, NORMALIZER_VERSION, extractCore, extractVersions, isErrorLine, isStackFrame, collapseRepeatedFrames, redact, REDACT_RULES, type NormalizeResult, type DetectedVersion, type RedactRule, type RedactResult, } from './normalize/index.js';
export { wilsonLowerBound, confidenceScore, verificationStateFor, environmentsToVerified, VERIFIED_ENV_THRESHOLD, CORROBORATED_ENV_THRESHOLD, type VerificationInput, type VerificationState, } from './verification.js';
export { reciprocalRankFusion, normalizeRrfScores, RRF_K, type FusedCandidate, type MatchSource, } from './fusion.js';
export { environmentHash, environmentSimilarity, type EnvironmentInput, } from './environment.js';
export { createOpenAIEmbedder, createCachingEmbedder, nullEmbedder, buildEmbedInput, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, type Embedder, type CachingEmbedder, type OpenAIEmbedderOptions, } from './embedding.js';
export { buildTsQuery, tokenizeForTsQuery } from './fts.js';
export { createChatClient, buildSystemPrompt, DEFAULT_CHAT_MODEL, type ChatClient, type ChatClientOptions, type ChatContext, type ChatMessage, type ChatRole, } from './chat.js';
export { PROVIDERS, SESSION_COOKIE, SESSION_TTL_DAYS, createSessionToken, createState, hashSessionToken, isSafeReturnTo, normalizeIdentity, suggestHandle, verifyState, type OAuthProvider, type ProviderConfig, type ProviderIdentity, type SessionToken, type StatePayload, } from './auth/oauth.js';
export { scanForSecrets, redactSecrets, shannonEntropy, type ScanResult, type SecretFinding, type SecretSeverity, } from './review/secrets.js';
export { blocksPublication, buildReviewPrompt, parseReviewReply, reviewSubmission, staticChecks, type ReviewIssue, type ReviewResult, type ReviewSubmission, type ReviewVerdict, type ReviewerClient, } from './review/reviewer.js';
export { buildSetupGuide, type AgentClient, type SetupFile, type SetupGuide, type SetupOptions, type SetupStep, } from './onboarding.js';
export { EDITABLE_FIELDS, applyProposal, changedFields, isOpen, isStale, statusForVerdict, summarizeChanges, type EditableField, type FieldChange, type ProposalStatus, type ProposedChange, type SolutionContent, } from './community/proposals.js';
export { nextVote, tally, type VoteTally, type VoteValue } from './community/votes.js';
export { buildThread, countEntries, type CommentInput, type ProposalInput, type ThreadAuthor, type ThreadEntry, } from './community/threads.js';
//# sourceMappingURL=index.d.ts.map