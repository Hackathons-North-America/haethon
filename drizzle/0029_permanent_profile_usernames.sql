ALTER TABLE "user_profiles" DROP CONSTRAINT "user_profiles_share_token_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" varchar(48);--> statement-breakpoint
DO $$
DECLARE
	"user_row" record;
	"base_username" text;
	"candidate_username" text;
	"suffix_number" integer;
BEGIN
	FOR "user_row" IN
		SELECT "id", "email"
		FROM "users"
		ORDER BY "created_at", "id"
	LOOP
		"base_username" := coalesce(
			nullif(
				left(
					trim(both '-_' from regexp_replace(lower(split_part("user_row"."email", '@', 1)), '[^a-z0-9_-]+', '-', 'g')),
					48
				),
				''
			),
			'hacker'
		);
		"candidate_username" := "base_username";
		"suffix_number" := 1;

		WHILE EXISTS (SELECT 1 FROM "users" WHERE "username" = "candidate_username") LOOP
			"suffix_number" := "suffix_number" + 1;
			"candidate_username" :=
				left("base_username", 47 - length("suffix_number"::text))
				|| '-'
				|| "suffix_number"::text;
		END LOOP;

		UPDATE "users"
		SET "username" = "candidate_username"
		WHERE "id" = "user_row"."id";
	END LOOP;
END
$$;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "share_token";--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "share_token_created_at";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");
