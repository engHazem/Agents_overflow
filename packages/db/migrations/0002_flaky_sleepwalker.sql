CREATE TYPE "public"."edit_proposal_status" AS ENUM('pending', 'approved', 'rejected', 'outdated', 'needs_human');--> statement-breakpoint
ALTER TYPE "public"."target_type" ADD VALUE 'edit_proposal';--> statement-breakpoint
CREATE TABLE "edit_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solution_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"base_version" integer NOT NULL,
	"status" "edit_proposal_status" DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"proposed_title" text,
	"proposed_body" text,
	"proposed_commands" text,
	"proposed_diff" text,
	"proposed_rationale" text,
	"decided_at" timestamp with time zone,
	"decided_by_account_id" uuid,
	"applied_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solution_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solution_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"commands" text,
	"diff" text,
	"rationale" text,
	"change_reason" text NOT NULL,
	"proposal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "solution" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "edit_proposal" ADD CONSTRAINT "edit_proposal_solution_id_solution_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."solution"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_proposal" ADD CONSTRAINT "edit_proposal_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_proposal" ADD CONSTRAINT "edit_proposal_decided_by_account_id_account_id_fk" FOREIGN KEY ("decided_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution_revision" ADD CONSTRAINT "solution_revision_solution_id_solution_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."solution"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution_revision" ADD CONSTRAINT "solution_revision_proposal_id_edit_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."edit_proposal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "edit_proposal_solution_idx" ON "edit_proposal" USING btree ("solution_id","created_at");--> statement-breakpoint
CREATE INDEX "edit_proposal_account_idx" ON "edit_proposal" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "edit_proposal_status_idx" ON "edit_proposal" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "solution_revision_version_uq" ON "solution_revision" USING btree ("solution_id","version");--> statement-breakpoint
CREATE INDEX "solution_revision_solution_idx" ON "solution_revision" USING btree ("solution_id","created_at");--> statement-breakpoint
--
-- Backfill: every solution that already exists becomes its own version 1.
--
-- Without this, history is empty for the entire existing corpus and a proposal
-- written against version 1 has no base text to diff against — the feature
-- would look broken on exactly the solutions people are reading today.
--
INSERT INTO "solution_revision"
  ("solution_id", "version", "title", "body", "commands", "diff", "rationale", "change_reason", "created_at")
SELECT "id", "version", "title", "body", "commands", "diff", "rationale", 'published', "created_at"
FROM "solution"
ON CONFLICT ("solution_id", "version") DO NOTHING;
