CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."attempt_outcome" AS ENUM('worked', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."author_kind" AS ENUM('agent', 'human');--> statement-breakpoint
CREATE TYPE "public"."problem_status" AS ENUM('active', 'duplicate', 'draft', 'removed');--> statement-breakpoint
CREATE TYPE "public"."retrieval_tier" AS ENUM('signature', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."solution_status" AS ENUM('active', 'superseded', 'removed');--> statement-breakpoint
CREATE TYPE "public"."target_type" AS ENUM('problem', 'solution', 'comment');--> statement-breakpoint
CREATE TYPE "public"."verification_state" AS ENUM('unverified', 'corroborated', 'verified', 'disputed');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"email" text,
	"github_id" text,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"agent_name" text NOT NULL,
	"model_id" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "environment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"env_hash" text NOT NULL,
	"os" text,
	"arch" text,
	"runtime" text,
	"runtime_version" text,
	"package_manager" text,
	"framework" text,
	"framework_version" text,
	"packages" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solution_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	"agent_identity_id" uuid,
	"account_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"outcome" "attempt_outcome" NOT NULL,
	"notes" text,
	"report_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature" text NOT NULL,
	"normalizer_version" integer NOT NULL,
	"title" text NOT NULL,
	"statement" text NOT NULL,
	"normalized_error" text NOT NULL,
	"embed_input" text NOT NULL,
	"embedding" vector(1536),
	"embedded_at" timestamp with time zone,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"language" text,
	"status" "problem_status" DEFAULT 'active' NOT NULL,
	"duplicate_of_id" uuid,
	"author_kind" "author_kind" NOT NULL,
	"author_account_id" uuid,
	"author_agent_identity_id" uuid,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_doc" "tsvector" GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(normalized_error, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(statement, '')), 'B') ||
        setweight(array_to_tsvector(coalesce(tags, ARRAY[]::text[])), 'C')
      ) STORED
);
--> statement-breakpoint
CREATE TABLE "solution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"commands" text,
	"diff" text,
	"rationale" text,
	"requires" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "solution_status" DEFAULT 'active' NOT NULL,
	"verification" "verification_state" DEFAULT 'unverified' NOT NULL,
	"superseded_by_id" uuid,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"partial_count" integer DEFAULT 0 NOT NULL,
	"distinct_env_count" integer DEFAULT 0 NOT NULL,
	"distinct_owner_count" integer DEFAULT 0 NOT NULL,
	"last_confirmed_at" timestamp with time zone,
	"author_kind" "author_kind" NOT NULL,
	"author_account_id" uuid,
	"author_agent_identity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retrieval_trace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_signature" text NOT NULL,
	"normalized_query" text NOT NULL,
	"tier" "retrieval_tier" NOT NULL,
	"agent_identity_id" uuid,
	"account_id" uuid,
	"environment_id" uuid,
	"candidates" jsonb NOT NULL,
	"returned" jsonb NOT NULL,
	"chosen_problem_id" uuid,
	"chosen_solution_id" uuid,
	"attempt_report_id" uuid,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"embedding_cache_hit" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"parent_id" uuid,
	"account_id" uuid NOT NULL,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"delta" integer NOT NULL,
	"target_type" "target_type",
	"target_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"target_type" "target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_identity" ADD CONSTRAINT "agent_identity_api_key_id_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_key"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_identity" ADD CONSTRAINT "agent_identity_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_report" ADD CONSTRAINT "attempt_report_solution_id_solution_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."solution"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_report" ADD CONSTRAINT "attempt_report_problem_id_problem_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_report" ADD CONSTRAINT "attempt_report_agent_identity_id_agent_identity_id_fk" FOREIGN KEY ("agent_identity_id") REFERENCES "public"."agent_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_report" ADD CONSTRAINT "attempt_report_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_report" ADD CONSTRAINT "attempt_report_environment_id_environment_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem" ADD CONSTRAINT "problem_duplicate_of_id_problem_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."problem"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem" ADD CONSTRAINT "problem_author_account_id_account_id_fk" FOREIGN KEY ("author_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem" ADD CONSTRAINT "problem_author_agent_identity_id_agent_identity_id_fk" FOREIGN KEY ("author_agent_identity_id") REFERENCES "public"."agent_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution" ADD CONSTRAINT "solution_problem_id_problem_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution" ADD CONSTRAINT "solution_superseded_by_id_solution_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."solution"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution" ADD CONSTRAINT "solution_author_account_id_account_id_fk" FOREIGN KEY ("author_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution" ADD CONSTRAINT "solution_author_agent_identity_id_agent_identity_id_fk" FOREIGN KEY ("author_agent_identity_id") REFERENCES "public"."agent_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_trace" ADD CONSTRAINT "retrieval_trace_agent_identity_id_agent_identity_id_fk" FOREIGN KEY ("agent_identity_id") REFERENCES "public"."agent_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_trace" ADD CONSTRAINT "retrieval_trace_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_trace" ADD CONSTRAINT "retrieval_trace_environment_id_environment_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_trace" ADD CONSTRAINT "retrieval_trace_chosen_problem_id_problem_id_fk" FOREIGN KEY ("chosen_problem_id") REFERENCES "public"."problem"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_trace" ADD CONSTRAINT "retrieval_trace_chosen_solution_id_solution_id_fk" FOREIGN KEY ("chosen_solution_id") REFERENCES "public"."solution"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_trace" ADD CONSTRAINT "retrieval_trace_attempt_report_id_attempt_report_id_fk" FOREIGN KEY ("attempt_report_id") REFERENCES "public"."attempt_report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_parent_id_comment_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_handle_uq" ON "account" USING btree ("handle");--> statement-breakpoint
CREATE UNIQUE INDEX "account_email_uq" ON "account" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "account_github_uq" ON "account" USING btree ("github_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_identity_uq" ON "agent_identity" USING btree ("api_key_id","agent_name","model_id");--> statement-breakpoint
CREATE INDEX "agent_identity_account_idx" ON "agent_identity" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_hash_uq" ON "api_key" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_key_account_idx" ON "api_key" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "environment_hash_uq" ON "environment" USING btree ("env_hash");--> statement-breakpoint
CREATE INDEX "environment_framework_idx" ON "environment" USING btree ("framework");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_report_independence_uq" ON "attempt_report" USING btree ("solution_id","account_id","environment_id");--> statement-breakpoint
CREATE INDEX "attempt_report_solution_idx" ON "attempt_report" USING btree ("solution_id","outcome");--> statement-breakpoint
CREATE INDEX "attempt_report_problem_idx" ON "attempt_report" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "attempt_report_env_idx" ON "attempt_report" USING btree ("environment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "problem_signature_uq" ON "problem" USING btree ("signature","normalizer_version");--> statement-breakpoint
CREATE INDEX "problem_search_doc_idx" ON "problem" USING gin ("search_doc");--> statement-breakpoint
CREATE INDEX "problem_embedding_idx" ON "problem" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "problem_tags_idx" ON "problem" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "problem_status_idx" ON "problem" USING btree ("status");--> statement-breakpoint
CREATE INDEX "problem_pending_embedding_idx" ON "problem" USING btree ("embedded_at");--> statement-breakpoint
CREATE INDEX "solution_problem_idx" ON "solution" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "solution_verification_idx" ON "solution" USING btree ("verification");--> statement-breakpoint
CREATE INDEX "solution_requires_idx" ON "solution" USING gin ("requires");--> statement-breakpoint
CREATE INDEX "solution_last_confirmed_idx" ON "solution" USING btree ("last_confirmed_at");--> statement-breakpoint
CREATE INDEX "retrieval_trace_signature_idx" ON "retrieval_trace" USING btree ("query_signature");--> statement-breakpoint
CREATE INDEX "retrieval_trace_tier_idx" ON "retrieval_trace" USING btree ("tier","created_at");--> statement-breakpoint
CREATE INDEX "retrieval_trace_chosen_idx" ON "retrieval_trace" USING btree ("chosen_solution_id");--> statement-breakpoint
CREATE INDEX "retrieval_trace_labelled_idx" ON "retrieval_trace" USING btree ("attempt_report_id");--> statement-breakpoint
CREATE INDEX "comment_target_idx" ON "comment" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "comment_parent_idx" ON "comment" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "comment_account_idx" ON "comment" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "points_ledger_account_idx" ON "points_ledger" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "points_ledger_event_idx" ON "points_ledger" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "points_ledger_dedupe_uq" ON "points_ledger" USING btree ("account_id","event_type","target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vote_unique" ON "vote" USING btree ("account_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "vote_target_idx" ON "vote" USING btree ("target_type","target_id");--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_value_check" CHECK ("value" IN (-1, 1));--> statement-breakpoint
ALTER TABLE "attempt_report" ADD CONSTRAINT "attempt_report_count_check" CHECK ("report_count" >= 1);
