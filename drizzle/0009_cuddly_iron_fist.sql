DROP INDEX "hackathon_results_user_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "hackathon_dates_hackathon_unique_idx" ON "hackathon_dates" USING btree ("hackathon_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hackathon_locations_hackathon_unique_idx" ON "hackathon_locations" USING btree ("hackathon_id");--> statement-breakpoint
CREATE INDEX "hackathon_locations_country_idx" ON "hackathon_locations" USING btree ("country");--> statement-breakpoint
CREATE INDEX "hackathon_results_user_hackathon_idx" ON "hackathon_results" USING btree ("user_id","hackathon_id");--> statement-breakpoint
CREATE INDEX "hackathons_name_trgm_idx" ON "hackathons" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "organizer_claims_user_status_hackathon_idx" ON "organizer_claims" USING btree ("user_id","status","hackathon_id");--> statement-breakpoint
CREATE INDEX "reminders_pending_due_idx" ON "reminders" USING btree ("channel","scheduled_for") WHERE "reminders"."sent_at" is null;