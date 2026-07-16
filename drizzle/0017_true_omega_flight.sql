CREATE TYPE "public"."country_alert_frequency" AS ENUM('instant', 'daily', 'weekly');--> statement-breakpoint
CREATE TABLE "country_alert_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"country" varchar(120) NOT NULL,
	"frequency" "country_alert_frequency" DEFAULT 'daily' NOT NULL,
	"last_notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_alert_subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "country_alert_subscriptions" ADD CONSTRAINT "country_alert_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "country_alert_subscriptions_country_idx" ON "country_alert_subscriptions" USING btree ("country");