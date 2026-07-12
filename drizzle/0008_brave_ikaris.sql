ALTER TABLE "users" ADD COLUMN "email_unsubscribed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "achievements_user_idx" ON "achievements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "discord_channels_hackathon_idx" ON "discord_channels" USING btree ("hackathon_id");--> statement-breakpoint
CREATE INDEX "discord_channels_series_idx" ON "discord_channels" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "hackathon_results_user_idx" ON "hackathon_results" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hackathon_results_hackathon_idx" ON "hackathon_results" USING btree ("hackathon_id");--> statement-breakpoint
CREATE INDEX "projects_user_hackathon_idx" ON "projects" USING btree ("user_id","hackathon_id");--> statement-breakpoint
CREATE INDEX "reminders_user_hackathon_idx" ON "reminders" USING btree ("user_id","hackathon_id");--> statement-breakpoint
CREATE INDEX "sources_hackathon_idx" ON "sources" USING btree ("hackathon_id");
