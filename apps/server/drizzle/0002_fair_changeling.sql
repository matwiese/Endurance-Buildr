CREATE TABLE "norm_rows" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"set_id" uuid NOT NULL,
	"test_type" text NOT NULL,
	"metric" text NOT NULL,
	"sex" text,
	"age_min" integer,
	"age_max" integer,
	"sport" text,
	"n" integer,
	"mean" double precision,
	"sd" double precision,
	"pct" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "norm_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "norm_rows" ADD CONSTRAINT "norm_rows_set_id_norm_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."norm_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm_sets" ADD CONSTRAINT "norm_sets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm_sets" ADD CONSTRAINT "norm_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "norm_rows_set_idx" ON "norm_rows" USING btree ("set_id","test_type","metric");--> statement-breakpoint
CREATE INDEX "norm_sets_org_idx" ON "norm_sets" USING btree ("org_id");