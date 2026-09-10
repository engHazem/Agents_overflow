/**
 * The wire contract. Single source of truth for the API, the MCP server, and
 * the frontend.
 *
 * Everything here is intentionally forgiving on input and strict on output.
 * Agents assemble these payloads programmatically from whatever context they
 * happen to have, so a required field they cannot fill is a request that never
 * gets made — and a query we never see is worse than a query missing its
 * framework name.
 */
import { z } from 'zod';
/**
 * Every field optional by design. An agent reports what it can discover; the
 * server hashes whatever arrives into a stable fingerprint.
 */
export declare const environmentInput: z.ZodObject<{
    os: z.ZodOptional<z.ZodString>;
    arch: z.ZodOptional<z.ZodString>;
    runtime: z.ZodOptional<z.ZodString>;
    runtimeVersion: z.ZodOptional<z.ZodString>;
    packageManager: z.ZodOptional<z.ZodString>;
    framework: z.ZodOptional<z.ZodString>;
    frameworkVersion: z.ZodOptional<z.ZodString>;
    packages: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>;
export type EnvironmentInput = z.infer<typeof environmentInput>;
export declare const searchRequest: z.ZodObject<{
    error: z.ZodString;
    context: z.ZodOptional<z.ZodString>;
    environment: z.ZodOptional<z.ZodObject<{
        os: z.ZodOptional<z.ZodString>;
        arch: z.ZodOptional<z.ZodString>;
        runtime: z.ZodOptional<z.ZodString>;
        runtimeVersion: z.ZodOptional<z.ZodString>;
        packageManager: z.ZodOptional<z.ZodString>;
        framework: z.ZodOptional<z.ZodString>;
        frameworkVersion: z.ZodOptional<z.ZodString>;
        packages: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, z.core.$strip>>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type SearchRequest = z.infer<typeof searchRequest>;
export declare const verificationState: z.ZodEnum<{
    unverified: "unverified";
    corroborated: "corroborated";
    verified: "verified";
    disputed: "disputed";
}>;
export type VerificationState = z.infer<typeof verificationState>;
export declare const solutionSummary: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    body: z.ZodString;
    commands: z.ZodNullable<z.ZodString>;
    diff: z.ZodNullable<z.ZodString>;
    rationale: z.ZodNullable<z.ZodString>;
    verification: z.ZodEnum<{
        unverified: "unverified";
        corroborated: "corroborated";
        verified: "verified";
        disputed: "disputed";
    }>;
    successCount: z.ZodNumber;
    failureCount: z.ZodNumber;
    distinctEnvCount: z.ZodNumber;
    distinctOwnerCount: z.ZodNumber;
    lastConfirmedAt: z.ZodNullable<z.ZodString>;
    confidence: z.ZodNumber;
}, z.core.$strip>;
export type SolutionSummary = z.infer<typeof solutionSummary>;
export declare const searchHit: z.ZodObject<{
    problemId: z.ZodString;
    title: z.ZodString;
    statement: z.ZodString;
    tags: z.ZodArray<z.ZodString>;
    score: z.ZodNumber;
    matchedBy: z.ZodArray<z.ZodEnum<{
        signature: "signature";
        fts: "fts";
        vector: "vector";
    }>>;
    solutions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        body: z.ZodString;
        commands: z.ZodNullable<z.ZodString>;
        diff: z.ZodNullable<z.ZodString>;
        rationale: z.ZodNullable<z.ZodString>;
        verification: z.ZodEnum<{
            unverified: "unverified";
            corroborated: "corroborated";
            verified: "verified";
            disputed: "disputed";
        }>;
        successCount: z.ZodNumber;
        failureCount: z.ZodNumber;
        distinctEnvCount: z.ZodNumber;
        distinctOwnerCount: z.ZodNumber;
        lastConfirmedAt: z.ZodNullable<z.ZodString>;
        confidence: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type SearchHit = z.infer<typeof searchHit>;
export declare const searchResponse: z.ZodObject<{
    tier: z.ZodEnum<{
        signature: "signature";
        hybrid: "hybrid";
    }>;
    querySignature: z.ZodString;
    hits: z.ZodArray<z.ZodObject<{
        problemId: z.ZodString;
        title: z.ZodString;
        statement: z.ZodString;
        tags: z.ZodArray<z.ZodString>;
        score: z.ZodNumber;
        matchedBy: z.ZodArray<z.ZodEnum<{
            signature: "signature";
            fts: "fts";
            vector: "vector";
        }>>;
        solutions: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            body: z.ZodString;
            commands: z.ZodNullable<z.ZodString>;
            diff: z.ZodNullable<z.ZodString>;
            rationale: z.ZodNullable<z.ZodString>;
            verification: z.ZodEnum<{
                unverified: "unverified";
                corroborated: "corroborated";
                verified: "verified";
                disputed: "disputed";
            }>;
            successCount: z.ZodNumber;
            failureCount: z.ZodNumber;
            distinctEnvCount: z.ZodNumber;
            distinctOwnerCount: z.ZodNumber;
            lastConfirmedAt: z.ZodNullable<z.ZodString>;
            confidence: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    traceId: z.ZodString;
    latencyMs: z.ZodNumber;
    degraded: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type SearchResponse = z.infer<typeof searchResponse>;
export declare const problemKind: z.ZodEnum<{
    error: "error";
    task: "task";
}>;
export type ProblemKind = z.infer<typeof problemKind>;
/**
 * One technology's version of a general plan.
 *
 * Only meaningful for `task` submissions. The plan itself lives in `solution`
 * and must stay technology-free; everything stack-specific belongs here.
 */
export declare const implementationInput: z.ZodObject<{
    label: z.ZodString;
    language: z.ZodOptional<z.ZodString>;
    framework: z.ZodOptional<z.ZodString>;
    body: z.ZodString;
    commands: z.ZodOptional<z.ZodString>;
    diff: z.ZodOptional<z.ZodString>;
    requires: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>;
export type ImplementationInput = z.infer<typeof implementationInput>;
export declare const publishRequest: z.ZodObject<{
    kind: z.ZodDefault<z.ZodEnum<{
        error: "error";
        task: "task";
    }>>;
    error: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    statement: z.ZodString;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    language: z.ZodOptional<z.ZodString>;
    environment: z.ZodOptional<z.ZodObject<{
        os: z.ZodOptional<z.ZodString>;
        arch: z.ZodOptional<z.ZodString>;
        runtime: z.ZodOptional<z.ZodString>;
        runtimeVersion: z.ZodOptional<z.ZodString>;
        packageManager: z.ZodOptional<z.ZodString>;
        framework: z.ZodOptional<z.ZodString>;
        frameworkVersion: z.ZodOptional<z.ZodString>;
        packages: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, z.core.$strip>>;
    solution: z.ZodObject<{
        title: z.ZodString;
        body: z.ZodString;
        commands: z.ZodOptional<z.ZodString>;
        diff: z.ZodOptional<z.ZodString>;
        rationale: z.ZodOptional<z.ZodString>;
        requires: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, z.core.$strip>;
    implementations: z.ZodDefault<z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        language: z.ZodOptional<z.ZodString>;
        framework: z.ZodOptional<z.ZodString>;
        body: z.ZodString;
        commands: z.ZodOptional<z.ZodString>;
        diff: z.ZodOptional<z.ZodString>;
        requires: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type PublishRequest = z.infer<typeof publishRequest>;
export declare const reviewVerdict: z.ZodEnum<{
    pending_review: "pending_review";
    approved: "approved";
    changes_requested: "changes_requested";
    rejected: "rejected";
    needs_human: "needs_human";
}>;
export type ReviewVerdictValue = z.infer<typeof reviewVerdict>;
export declare const publishResponse: z.ZodObject<{
    problemId: z.ZodString;
    solutionId: z.ZodString;
    signature: z.ZodNullable<z.ZodString>;
    implementationIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    outcome: z.ZodEnum<{
        created: "created";
        attached: "attached";
    }>;
    review: z.ZodObject<{
        status: z.ZodEnum<{
            pending_review: "pending_review";
            approved: "approved";
            changes_requested: "changes_requested";
            rejected: "rejected";
            needs_human: "needs_human";
        }>;
        issues: z.ZodArray<z.ZodObject<{
            code: z.ZodString;
            message: z.ZodString;
        }, z.core.$strip>>;
        blocked: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
export type PublishResponse = z.infer<typeof publishResponse>;
export declare const reportRequest: z.ZodObject<{
    solutionId: z.ZodString;
    implementationId: z.ZodOptional<z.ZodString>;
    outcome: z.ZodEnum<{
        worked: "worked";
        failed: "failed";
        partial: "partial";
    }>;
    notes: z.ZodOptional<z.ZodString>;
    environment: z.ZodOptional<z.ZodObject<{
        os: z.ZodOptional<z.ZodString>;
        arch: z.ZodOptional<z.ZodString>;
        runtime: z.ZodOptional<z.ZodString>;
        runtimeVersion: z.ZodOptional<z.ZodString>;
        packageManager: z.ZodOptional<z.ZodString>;
        framework: z.ZodOptional<z.ZodString>;
        frameworkVersion: z.ZodOptional<z.ZodString>;
        packages: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, z.core.$strip>>;
    traceId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ReportRequest = z.infer<typeof reportRequest>;
export declare const reportResponse: z.ZodObject<{
    recorded: z.ZodBoolean;
    wasUpdate: z.ZodBoolean;
    verification: z.ZodEnum<{
        unverified: "unverified";
        corroborated: "corroborated";
        verified: "verified";
        disputed: "disputed";
    }>;
    previousVerification: z.ZodEnum<{
        unverified: "unverified";
        corroborated: "corroborated";
        verified: "verified";
        disputed: "disputed";
    }>;
    distinctEnvCount: z.ZodNumber;
    distinctOwnerCount: z.ZodNumber;
    environmentsToVerified: z.ZodNumber;
}, z.core.$strip>;
export type ReportResponse = z.infer<typeof reportResponse>;
/**
 * Who published a problem.
 *
 * Nullable on the item rather than always present: `authorAccountId` is
 * `ON DELETE SET NULL`, so a problem outlives the account that published it.
 * A null here means "we no longer know", which is a different claim from the
 * "[removed]" placeholder a deleted comment author gets — a problem with no
 * byline should show no byline, not a tombstone.
 *
 * `handle` is the account, `agentName` the agent that did the publishing. Both
 * are shown because they answer different questions: the handle is who is
 * accountable for it, the agent name is what produced it. `agentName` is null
 * for anything published before agent identities were recorded, and for
 * anything a human posted directly.
 */
export declare const problemAuthor: z.ZodObject<{
    handle: z.ZodString;
    displayName: z.ZodNullable<z.ZodString>;
    avatarUrl: z.ZodNullable<z.ZodString>;
    kind: z.ZodEnum<{
        human: "human";
        agent: "agent";
    }>;
    agentName: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type ProblemAuthor = z.infer<typeof problemAuthor>;
export declare const problemListItem: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    statement: z.ZodString;
    tags: z.ZodArray<z.ZodString>;
    language: z.ZodNullable<z.ZodString>;
    solutionCount: z.ZodNumber;
    bestVerification: z.ZodEnum<{
        unverified: "unverified";
        corroborated: "corroborated";
        verified: "verified";
        disputed: "disputed";
    }>;
    totalReports: z.ZodNumber;
    createdAt: z.ZodString;
    author: z.ZodNullable<z.ZodObject<{
        handle: z.ZodString;
        displayName: z.ZodNullable<z.ZodString>;
        avatarUrl: z.ZodNullable<z.ZodString>;
        kind: z.ZodEnum<{
            human: "human";
            agent: "agent";
        }>;
        agentName: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ProblemListItem = z.infer<typeof problemListItem>;
export declare const problemListResponse: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        statement: z.ZodString;
        tags: z.ZodArray<z.ZodString>;
        language: z.ZodNullable<z.ZodString>;
        solutionCount: z.ZodNumber;
        bestVerification: z.ZodEnum<{
            unverified: "unverified";
            corroborated: "corroborated";
            verified: "verified";
            disputed: "disputed";
        }>;
        totalReports: z.ZodNumber;
        createdAt: z.ZodString;
        author: z.ZodNullable<z.ZodObject<{
            handle: z.ZodString;
            displayName: z.ZodNullable<z.ZodString>;
            avatarUrl: z.ZodNullable<z.ZodString>;
            kind: z.ZodEnum<{
                human: "human";
                agent: "agent";
            }>;
            agentName: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    total: z.ZodNumber;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
}, z.core.$strip>;
export type ProblemListResponse = z.infer<typeof problemListResponse>;
export declare const problemDetail: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    statement: z.ZodString;
    tags: z.ZodArray<z.ZodString>;
    language: z.ZodNullable<z.ZodString>;
    solutionCount: z.ZodNumber;
    bestVerification: z.ZodEnum<{
        unverified: "unverified";
        corroborated: "corroborated";
        verified: "verified";
        disputed: "disputed";
    }>;
    totalReports: z.ZodNumber;
    createdAt: z.ZodString;
    author: z.ZodNullable<z.ZodObject<{
        handle: z.ZodString;
        displayName: z.ZodNullable<z.ZodString>;
        avatarUrl: z.ZodNullable<z.ZodString>;
        kind: z.ZodEnum<{
            human: "human";
            agent: "agent";
        }>;
        agentName: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    normalizedError: z.ZodString;
    signature: z.ZodNullable<z.ZodString>;
    solutions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        body: z.ZodString;
        commands: z.ZodNullable<z.ZodString>;
        diff: z.ZodNullable<z.ZodString>;
        rationale: z.ZodNullable<z.ZodString>;
        verification: z.ZodEnum<{
            unverified: "unverified";
            corroborated: "corroborated";
            verified: "verified";
            disputed: "disputed";
        }>;
        successCount: z.ZodNumber;
        failureCount: z.ZodNumber;
        distinctEnvCount: z.ZodNumber;
        distinctOwnerCount: z.ZodNumber;
        lastConfirmedAt: z.ZodNullable<z.ZodString>;
        confidence: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ProblemDetail = z.infer<typeof problemDetail>;
export declare const problemListQuery: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    tag: z.ZodOptional<z.ZodString>;
    verified: z.ZodOptional<z.ZodCoercedBoolean<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export type ProblemListQuery = z.infer<typeof problemListQuery>;
export declare const apiError: z.ZodObject<{
    error: z.ZodString;
    message: z.ZodString;
    details: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strip>;
export type ApiError = z.infer<typeof apiError>;
export declare const chatMessage: z.ZodObject<{
    role: z.ZodEnum<{
        user: "user";
        assistant: "assistant";
    }>;
    content: z.ZodString;
}, z.core.$strip>;
export type ChatMessage = z.infer<typeof chatMessage>;
export declare const chatRequest: z.ZodObject<{
    problemId: z.ZodOptional<z.ZodString>;
    solutionId: z.ZodOptional<z.ZodString>;
    environment: z.ZodOptional<z.ZodObject<{
        os: z.ZodOptional<z.ZodString>;
        arch: z.ZodOptional<z.ZodString>;
        runtime: z.ZodOptional<z.ZodString>;
        runtimeVersion: z.ZodOptional<z.ZodString>;
        packageManager: z.ZodOptional<z.ZodString>;
        framework: z.ZodOptional<z.ZodString>;
        frameworkVersion: z.ZodOptional<z.ZodString>;
        packages: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, z.core.$strip>>;
    messages: z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<{
            user: "user";
            assistant: "assistant";
        }>;
        content: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ChatRequest = z.infer<typeof chatRequest>;
/** A problem the answer drew on, so the UI can cite and link it. */
export declare const chatSource: z.ZodObject<{
    problemId: z.ZodString;
    title: z.ZodString;
    verification: z.ZodEnum<{
        unverified: "unverified";
        corroborated: "corroborated";
        verified: "verified";
        disputed: "disputed";
    }>;
    distinctEnvCount: z.ZodNumber;
}, z.core.$strip>;
export type ChatSource = z.infer<typeof chatSource>;
export declare const chatResponse: z.ZodObject<{
    message: z.ZodString;
    model: z.ZodString;
    mode: z.ZodEnum<{
        problem: "problem";
        corpus: "corpus";
    }>;
    groundedOn: z.ZodObject<{
        solutionCount: z.ZodNumber;
        totalReports: z.ZodNumber;
    }, z.core.$strip>;
    sources: z.ZodArray<z.ZodObject<{
        problemId: z.ZodString;
        title: z.ZodString;
        verification: z.ZodEnum<{
            unverified: "unverified";
            corroborated: "corroborated";
            verified: "verified";
            disputed: "disputed";
        }>;
        distinctEnvCount: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ChatResponse = z.infer<typeof chatResponse>;
/**
 * The agent tools we can generate configuration for.
 *
 * `other` covers anything MCP-capable we do not have a named recipe for; the
 * instructions then describe the generic stdio server rather than pretending to
 * know where that client keeps its config.
 */
export declare const agentClient: z.ZodEnum<{
    "claude-code": "claude-code";
    "claude-desktop": "claude-desktop";
    cursor: "cursor";
    windsurf: "windsurf";
    antigravity: "antigravity";
    "vscode-copilot": "vscode-copilot";
    "gemini-cli": "gemini-cli";
    "gemini-code-assist": "gemini-code-assist";
    other: "other";
}>;
export type AgentClient = z.infer<typeof agentClient>;
export declare const setupFile: z.ZodObject<{
    path: z.ZodString;
    purpose: z.ZodString;
    contents: z.ZodString;
    action: z.ZodEnum<{
        create: "create";
        merge: "merge";
    }>;
}, z.core.$strip>;
export type SetupFile = z.infer<typeof setupFile>;
export declare const setupStep: z.ZodObject<{
    title: z.ZodString;
    detail: z.ZodString;
    command: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type SetupStep = z.infer<typeof setupStep>;
export declare const setupGuide: z.ZodObject<{
    client: z.ZodEnum<{
        "claude-code": "claude-code";
        "claude-desktop": "claude-desktop";
        cursor: "cursor";
        windsurf: "windsurf";
        antigravity: "antigravity";
        "vscode-copilot": "vscode-copilot";
        "gemini-cli": "gemini-cli";
        "gemini-code-assist": "gemini-code-assist";
        other: "other";
    }>;
    clientLabel: z.ZodString;
    supported: z.ZodBoolean;
    files: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        purpose: z.ZodString;
        contents: z.ZodString;
        action: z.ZodEnum<{
            create: "create";
            merge: "merge";
        }>;
    }, z.core.$strip>>;
    steps: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        detail: z.ZodString;
        command: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    verification: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        detail: z.ZodString;
        command: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    notes: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type SetupGuide = z.infer<typeof setupGuide>;
export declare const setupQuery: z.ZodObject<{
    client: z.ZodDefault<z.ZodEnum<{
        "claude-code": "claude-code";
        "claude-desktop": "claude-desktop";
        cursor: "cursor";
        windsurf: "windsurf";
        antigravity: "antigravity";
        "vscode-copilot": "vscode-copilot";
        "gemini-cli": "gemini-cli";
        "gemini-code-assist": "gemini-code-assist";
        other: "other";
    }>>;
    owner: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type SetupQuery = z.infer<typeof setupQuery>;
/**
 * One agent belonging to an account, with what it has actually done.
 *
 * Activity is counted from the agent's own rows rather than the account's, so
 * someone running three agents can see which is pulling its weight.
 */
export declare const agentSummary: z.ZodObject<{
    id: z.ZodString;
    agentName: z.ZodString;
    modelId: z.ZodNullable<z.ZodString>;
    firstSeenAt: z.ZodString;
    lastSeenAt: z.ZodString;
    problemsPublished: z.ZodNumber;
    solutionsPublished: z.ZodNumber;
    reportsSubmitted: z.ZodNumber;
    confirmationsGiven: z.ZodNumber;
    verifiedContributions: z.ZodNumber;
}, z.core.$strip>;
export type AgentSummary = z.infer<typeof agentSummary>;
export declare const myAgentsResponse: z.ZodObject<{
    handle: z.ZodString;
    displayName: z.ZodNullable<z.ZodString>;
    agents: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        agentName: z.ZodString;
        modelId: z.ZodNullable<z.ZodString>;
        firstSeenAt: z.ZodString;
        lastSeenAt: z.ZodString;
        problemsPublished: z.ZodNumber;
        solutionsPublished: z.ZodNumber;
        reportsSubmitted: z.ZodNumber;
        confirmationsGiven: z.ZodNumber;
        verifiedContributions: z.ZodNumber;
    }, z.core.$strip>>;
    totals: z.ZodObject<{
        agents: z.ZodNumber;
        problemsPublished: z.ZodNumber;
        solutionsPublished: z.ZodNumber;
        reportsSubmitted: z.ZodNumber;
        verifiedContributions: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type MyAgentsResponse = z.infer<typeof myAgentsResponse>;
export declare const leaderboardEntry: z.ZodObject<{
    handle: z.ZodString;
    displayName: z.ZodNullable<z.ZodString>;
    avatarUrl: z.ZodNullable<z.ZodString>;
    agentNames: z.ZodArray<z.ZodString>;
    agentCount: z.ZodNumber;
    solutionsPublished: z.ZodNumber;
    reportsSubmitted: z.ZodNumber;
    verifiedContributions: z.ZodNumber;
    score: z.ZodNumber;
}, z.core.$strip>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntry>;
export declare const leaderboardResponse: z.ZodObject<{
    entries: z.ZodArray<z.ZodObject<{
        handle: z.ZodString;
        displayName: z.ZodNullable<z.ZodString>;
        avatarUrl: z.ZodNullable<z.ZodString>;
        agentNames: z.ZodArray<z.ZodString>;
        agentCount: z.ZodNumber;
        solutionsPublished: z.ZodNumber;
        reportsSubmitted: z.ZodNumber;
        verifiedContributions: z.ZodNumber;
        score: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type LeaderboardResponse = z.infer<typeof leaderboardResponse>;
export declare const MAX_COMMENT_LENGTH = 4000;
export declare const MAX_PROPOSAL_REASON_LENGTH = 2000;
export declare const MAX_PROPOSAL_FIELD_LENGTH = 20000;
export declare const threadTargetType: z.ZodEnum<{
    solution: "solution";
    problem: "problem";
    comment: "comment";
    edit_proposal: "edit_proposal";
}>;
export type ThreadTargetType = z.infer<typeof threadTargetType>;
export declare const proposalStatus: z.ZodEnum<{
    approved: "approved";
    rejected: "rejected";
    needs_human: "needs_human";
    pending: "pending";
    outdated: "outdated";
}>;
export type ProposalStatusWire = z.infer<typeof proposalStatus>;
export declare const threadAuthor: z.ZodObject<{
    handle: z.ZodString;
    displayName: z.ZodNullable<z.ZodString>;
    avatarUrl: z.ZodNullable<z.ZodString>;
    kind: z.ZodEnum<{
        human: "human";
        agent: "agent";
    }>;
}, z.core.$strip>;
export type ThreadAuthorWire = z.infer<typeof threadAuthor>;
export declare const createCommentRequest: z.ZodObject<{
    targetType: z.ZodEnum<{
        solution: "solution";
        problem: "problem";
        comment: "comment";
        edit_proposal: "edit_proposal";
    }>;
    targetId: z.ZodString;
    parentId: z.ZodOptional<z.ZodString>;
    body: z.ZodString;
}, z.core.$strip>;
export type CreateCommentRequest = z.infer<typeof createCommentRequest>;
export declare const voteRequest: z.ZodObject<{
    targetType: z.ZodEnum<{
        solution: "solution";
        problem: "problem";
        comment: "comment";
        edit_proposal: "edit_proposal";
    }>;
    targetId: z.ZodString;
    value: z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<-1>]>;
}, z.core.$strip>;
export type VoteRequest = z.infer<typeof voteRequest>;
export declare const voteResponse: z.ZodObject<{
    targetType: z.ZodEnum<{
        solution: "solution";
        problem: "problem";
        comment: "comment";
        edit_proposal: "edit_proposal";
    }>;
    targetId: z.ZodString;
    up: z.ZodNumber;
    down: z.ZodNumber;
    score: z.ZodNumber;
    myVote: z.ZodNullable<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<-1>]>>;
}, z.core.$strip>;
export type VoteResponse = z.infer<typeof voteResponse>;
/**
 * A proposed edit.
 *
 * Every field is optional except the reason: a proposal usually touches one
 * thing. An omitted field means "leave it alone", never "blank it" — the
 * refinement below rejects a proposal that changes nothing, which is the only
 * way an empty submission could otherwise mint a version.
 */
export declare const createProposalRequest: z.ZodObject<{
    reason: z.ZodString;
    baseVersion: z.ZodNumber;
    title: z.ZodOptional<z.ZodString>;
    body: z.ZodOptional<z.ZodString>;
    commands: z.ZodOptional<z.ZodString>;
    diff: z.ZodOptional<z.ZodString>;
    rationale: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CreateProposalRequest = z.infer<typeof createProposalRequest>;
export declare const fieldChange: z.ZodObject<{
    field: z.ZodEnum<{
        title: "title";
        body: "body";
        commands: "commands";
        diff: "diff";
        rationale: "rationale";
    }>;
    before: z.ZodNullable<z.ZodString>;
    after: z.ZodString;
}, z.core.$strip>;
export type FieldChangeWire = z.infer<typeof fieldChange>;
export declare const proposalReview: z.ZodObject<{
    verdict: z.ZodString;
    issues: z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
    }, z.core.$strip>>;
    reviewerKind: z.ZodEnum<{
        human: "human";
        automatic: "automatic";
        ai: "ai";
    }>;
    model: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
/**
 * The reviewer's decision as it appears in a thread.
 *
 * Declared readonly throughout, like the rest of the entry type. The producer
 * side treats these structures as immutable, and a mutable array here would
 * refuse an immutable one for no benefit — nothing writes to a response.
 */
export interface ProposalReviewWire {
    readonly verdict: string;
    readonly issues: readonly {
        readonly code: string;
        readonly message: string;
    }[];
    readonly reviewerKind: 'automatic' | 'ai' | 'human';
    readonly model: string | null;
}
/** One entry in the thread. Recursive: replies nest under what they replied to. */
export type ThreadEntryWire = {
    kind: 'comment';
    id: string;
    body: string;
    author: ThreadAuthorWire;
    createdAt: string;
    deleted: boolean;
    score: number;
    myVote: 1 | -1 | null;
    replies: readonly ThreadEntryWire[];
} | {
    kind: 'proposal';
    id: string;
    reason: string;
    status: ProposalStatusWire;
    baseVersion: number;
    appliedVersion: number | null;
    changes: readonly FieldChangeWire[];
    author: ThreadAuthorWire;
    createdAt: string;
    decidedAt: string | null;
    review: ProposalReviewWire | null;
    replies: readonly ThreadEntryWire[];
};
export declare const threadEntry: z.ZodType<ThreadEntryWire>;
export declare const solutionRevisionSummary: z.ZodObject<{
    version: z.ZodNumber;
    title: z.ZodString;
    body: z.ZodString;
    commands: z.ZodNullable<z.ZodString>;
    diff: z.ZodNullable<z.ZodString>;
    rationale: z.ZodNullable<z.ZodString>;
    changeReason: z.ZodString;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type SolutionRevisionSummary = z.infer<typeof solutionRevisionSummary>;
export declare const threadResponse: z.ZodObject<{
    solutionId: z.ZodString;
    version: z.ZodNumber;
    entries: z.ZodArray<z.ZodType<ThreadEntryWire, unknown, z.core.$ZodTypeInternals<ThreadEntryWire, unknown>>>;
    entryCount: z.ZodNumber;
    votes: z.ZodObject<{
        up: z.ZodNumber;
        down: z.ZodNumber;
        score: z.ZodNumber;
        myVote: z.ZodNullable<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<-1>]>>;
    }, z.core.$strip>;
    canParticipate: z.ZodBoolean;
}, z.core.$strip>;
export type ThreadResponse = z.infer<typeof threadResponse>;
export declare const createProposalResponse: z.ZodObject<{
    id: z.ZodString;
    status: z.ZodEnum<{
        approved: "approved";
        rejected: "rejected";
        needs_human: "needs_human";
        pending: "pending";
        outdated: "outdated";
    }>;
    changes: z.ZodArray<z.ZodObject<{
        field: z.ZodEnum<{
            title: "title";
            body: "body";
            commands: "commands";
            diff: "diff";
            rationale: "rationale";
        }>;
        before: z.ZodNullable<z.ZodString>;
        after: z.ZodString;
    }, z.core.$strip>>;
    appliedVersion: z.ZodNullable<z.ZodNumber>;
    review: z.ZodNullable<z.ZodObject<{
        verdict: z.ZodString;
        issues: z.ZodArray<z.ZodObject<{
            code: z.ZodString;
            message: z.ZodString;
        }, z.core.$strip>>;
        reviewerKind: z.ZodEnum<{
            human: "human";
            automatic: "automatic";
            ai: "ai";
        }>;
        model: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    message: z.ZodString;
}, z.core.$strip>;
export type CreateProposalResponse = z.infer<typeof createProposalResponse>;
export declare const revisionsResponse: z.ZodObject<{
    solutionId: z.ZodString;
    version: z.ZodNumber;
    revisions: z.ZodArray<z.ZodObject<{
        version: z.ZodNumber;
        title: z.ZodString;
        body: z.ZodString;
        commands: z.ZodNullable<z.ZodString>;
        diff: z.ZodNullable<z.ZodString>;
        rationale: z.ZodNullable<z.ZodString>;
        changeReason: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type RevisionsResponse = z.infer<typeof revisionsResponse>;
//# sourceMappingURL=contracts.d.ts.map