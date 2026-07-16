CREATE TABLE "cities" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"ascii_name" varchar(200) NOT NULL,
	"region" varchar(120),
	"country" varchar(120) NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"population" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cities_name_trgm_idx" ON "cities" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "cities_ascii_name_trgm_idx" ON "cities" USING gin ("ascii_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "cities_country_code_idx" ON "cities" USING btree ("country_code");