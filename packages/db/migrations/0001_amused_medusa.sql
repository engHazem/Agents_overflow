CREATE TYPE "public"."auth_provider" AS ENUM('github', 'google');--> statement-breakpoint
CREATE TYPE "public"."problem_kind" AS ENUM('error', 'task');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending_review', 'approved', 'changes_requested', 'rejected', 'needs_human');--> statement-breakpoint
CREATE TYPE "public"."reviewer_kind" AS ENUM('automatic', 'ai', 'human');--> statement-breakpoint
CREATE TABLE "auth_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" "auth_provider" NOT NULL,
	"provider_user_id" text NOT NULL,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"status" "review_status" NOT NULL,
	"reviewer_kind" "reviewer_kind" NOT NULL,
	"reviewer_model" text,
	"reviewer_account_id" uuid,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" text,
	"failure_reason" text,
	"secret_findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "implementation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solution_id" uuid NOT NULL,
	"stack" text NOT NULL,
	"label" text NOT NULL,
	"language" text,
	"framework" text,
	"requires" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body" text NOT NULL,
	"commands" text,
	"diff" text,
	"review_status" "review_status" DEFAULT 'pending_review' NOT NULL,
	"verification" "verification_state" DEFAULT 'unverified' NOT NULL,
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
DROP INDEX "problem_signature_uq";--> statement-breakpoint
ALTER TABLE "problem" ALTER COLUMN "signature" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "problem" drop column "search_doc";--> statement-breakpoint
ALTER TABLE "problem" ADD COLUMN "search_doc" "tsvector" GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(normalized_error, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(statement, '')), 'B') ||
        setweight(array_to_tsvector(coalesce(tags, ARRAY[]::text[])), 'C')
      ) STORED;--> statement-breakpoint
ALTER TABLE "attempt_report" ADD COLUMN "implementation_id" uuid;--> statement-breakpoint
ALTER TABLE "problem" ADD COLUMN "kind" "problem_kind" DEFAULT 'error' NOT NULL;--> statement-breakpoint
ALTER TABLE "problem" ADD COLUMN "review_status" "review_status" DEFAULT 'pending_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "solution" ADD COLUMN "review_status" "review_status" DEFAULT 'pending_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_identity" ADD CONSTRAINT "auth_identity_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_reviewer_account_id_account_id_fk" FOREIGN KEY ("reviewer_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation" ADD CONSTRAINT "implementation_solution_id_solution_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."solution"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation" ADD CONSTRAINT "implementation_author_account_id_account_id_fk" FOREIGN KEY ("author_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation" ADD CONSTRAINT "implementation_author_agent_identity_id_agent_identity_id_fk" FOREIGN KEY ("author_agent_identity_id") REFERENCES "public"."agent_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identity_provider_uq" ON "auth_identity" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "auth_identity_account_idx" ON "auth_identity" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "auth_identity_email_idx" ON "auth_identity" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_uq" ON "session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "session_account_idx" ON "session" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "session_expiry_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "review_target_idx" ON "review" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "review_status_idx" ON "review" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "review_queue_idx" ON "review" USING btree ("status","superseded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "implementation_stack_uq" ON "implementation" USING btree ("solution_id","stack");--> statement-breakpoint
CREATE INDEX "implementation_solution_idx" ON "implementation" USING btree ("solution_id");--> statement-breakpoint
CREATE INDEX "implementation_verification_idx" ON "implementation" USING btree ("verification");--> statement-breakpoint
CREATE INDEX "problem_kind_idx" ON "problem" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "problem_review_idx" ON "problem" USING btree ("review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "problem_signature_uq" ON "problem" USING btree ("signature","normalizer_version") WHERE "problem"."signature" IS NOT NULL;--> statement-breakpoint
UPDATE "problem" SET "review_status" = 'approved' WHERE "review_status" = 'pending_review'--> statement-breakpoint
UPDATE "solution" SET "review_status" = 'approved' WHERE "review_status" = 'pending_review'--> statement-breakpoint
ALTER TABLE "attempt_report" ADD CONSTRAINT "attempt_report_implementation_id_fk" FOREIGN KEY ("implementation_id") REFERENCES "implementation"("id") ON DELETE SET NULL--> statement-breakpoint
ALTER TABLE "problem" ADD CONSTRAINT "problem_kind_signature_check" CHECK (("kind" = 'error' AND "signature" IS NOT NULL) OR "kind" = 'task')--> statement-breakpoint
-- Recreated explicitly: dropping and re-adding the generated search_doc
-- column takes its GIN index with it, and drizzle-kit does not emit the
-- rebuild. Without this, full-text search silently degrades to a scan.
CREATE INDEX IF NOT EXISTS "problem_search_doc_idx" ON "problem" USING gin ("search_doc")
