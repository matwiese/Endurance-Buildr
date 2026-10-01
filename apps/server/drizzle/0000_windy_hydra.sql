CREATE SEQUENCE "public"."sync_rev_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"user_email" text,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_definitions" (
	"key" text PRIMARY KEY NOT NULL,
	"families" text[] NOT NULL,
	"kind" text NOT NULL,
	"unit" text NOT NULL,
	"label_de" text NOT NULL,
	"label_en" text NOT NULL,
	"higher_is_better" boolean,
	"definition" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_groups" (
	"profile_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "profile_groups_profile_id_group_id_pk" PRIMARY KEY("profile_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"date_of_birth" date,
	"sex" text,
	"height_cm" double precision,
	"weight_kg" double precision,
	"sport" text,
	"email" text,
	"notes" text,
	"external_id" text,
	"allow_photo_video" boolean DEFAULT false NOT NULL,
	"guardian_consent" boolean DEFAULT false NOT NULL,
	"health_consent_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"profile_id" uuid,
	"hz" integer NOT NULL,
	"n_samples" integer NOT NULL,
	"compression" integer NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rep_metrics" (
	"rep_id" uuid NOT NULL,
	"metric_key" text NOT NULL,
	"value" double precision NOT NULL,
	CONSTRAINT "rep_metrics_rep_id_metric_key_pk" PRIMARY KEY("rep_id","metric_key")
);
--> statement-breakpoint
CREATE TABLE "reps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"test_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"start_idx" integer NOT NULL,
	"end_idx" integer NOT NULL,
	"included" boolean DEFAULT true NOT NULL,
	"type" text NOT NULL,
	"confidence" real,
	"side" text DEFAULT 'both' NOT NULL,
	"events" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lead_in" boolean DEFAULT false NOT NULL,
	"hop_index" integer
);
--> statement-breakpoint
CREATE TABLE "tag_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"tag_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_tags" (
	"test_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "test_tags_test_id_tag_id_pk" PRIMARY KEY("test_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"profile_id" uuid,
	"session_id" uuid,
	"test_type" text NOT NULL,
	"detected_type" text,
	"body_mass_kg" double precision,
	"external_load_kg" double precision DEFAULT 0 NOT NULL,
	"sampling_hz" integer NOT NULL,
	"device_serial" text,
	"created_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"recording_id" uuid,
	"zero_left" double precision DEFAULT 0 NOT NULL,
	"zero_right" double precision DEFAULT 0 NOT NULL,
	"notes" text,
	"analysis_version" text NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tombstones" (
	"org_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	CONSTRAINT "tombstones_entity_entity_id_pk" PRIMARY KEY("entity","entity_id")
);
--> statement-breakpoint
CREATE TABLE "user_group_access" (
	"user_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"access" text NOT NULL,
	CONSTRAINT "user_group_access_user_id_group_id_pk" PRIMARY KEY("user_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"group_scope" text DEFAULT 'all' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_groups" ADD CONSTRAINT "profile_groups_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_groups" ADD CONSTRAINT "profile_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rep_metrics" ADD CONSTRAINT "rep_metrics_rep_id_reps_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."reps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rep_metrics" ADD CONSTRAINT "rep_metrics_metric_key_metric_definitions_key_fk" FOREIGN KEY ("metric_key") REFERENCES "public"."metric_definitions"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reps" ADD CONSTRAINT "reps_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_types" ADD CONSTRAINT "tag_types_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_tag_type_id_tag_types_id_fk" FOREIGN KEY ("tag_type_id") REFERENCES "public"."tag_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_tags" ADD CONSTRAINT "test_tags_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_tags" ADD CONSTRAINT "test_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tombstones" ADD CONSTRAINT "tombstones_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group_access" ADD CONSTRAINT "user_group_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group_access" ADD CONSTRAINT "user_group_access_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_org_at_idx" ON "audit_log" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "categories_org_idx" ON "categories" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "groups_org_idx" ON "groups" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "profile_groups_group_idx" ON "profile_groups" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "profiles_org_idx" ON "profiles" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_external_uq" ON "profiles" USING btree ("org_id","external_id") WHERE "profiles"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "recordings_org_idx" ON "recordings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "recordings_profile_idx" ON "recordings" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "rep_metrics_key_idx" ON "rep_metrics" USING btree ("metric_key");--> statement-breakpoint
CREATE INDEX "reps_test_idx" ON "reps" USING btree ("test_id","idx");--> statement-breakpoint
CREATE INDEX "tag_types_org_idx" ON "tag_types" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "tags_org_idx" ON "tags" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "tests_org_created_idx" ON "tests" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "tests_profile_idx" ON "tests" USING btree ("profile_id","test_type","created_at");--> statement-breakpoint
CREATE INDEX "tests_recording_idx" ON "tests" USING btree ("recording_id");--> statement-breakpoint
CREATE INDEX "tombstones_org_rev_idx" ON "tombstones" USING btree ("org_id","rev");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("org_id");