import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date as pgDate,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const geographyPoint = customType<{ data: { lat: number; lng: number }; driverData: string }>({
  dataType() {
    return "geography";
  },
  toDriver(value) {
    return `SRID=4326;POINT(${value.lng} ${value.lat})`;
  },
});

export const roleEnum = pgEnum("role", ["user", "admin", "organizer", "sponsor"]);
export const hackathonFormatEnum = pgEnum("hackathon_format", ["online", "in_person"]);
export const hackathonStatusEnum = pgEnum("hackathon_status", ["draft", "upcoming", "live", "completed", "archived"]);
export const applicationStatusEnum = pgEnum("application_status", ["interested", "applied", "accepted", "attended", "won"]);
export const reminderTypeEnum = pgEnum("reminder_type", [
  "application_open",
  "application_close",
  "acceptance_date",
  "hackathon_start",
  "hackathon_week_before",
  "hackathon_day_before",
  "check_in",
  "submission_deadline",
  "follow_up",
  "add_to_profile",
  "attendance_check",
  "application_week_before",
  "application_day_before",
]);
export const notificationChannelEnum = pgEnum("notification_channel", ["email", "discord", "in_app"]);
export const importStatusEnum = pgEnum("import_status", ["pending", "approved", "rejected", "merged"]);
export const sourceTypeEnum = pgEnum("source_type", ["devpost", "mlh", "organizer_site", "manual", "other"]);
export const leadStatusEnum = pgEnum("lead_status", ["new", "contacted", "qualified", "closed"]);
export const attendanceSourceEnum = pgEnum("attendance_source", [
  "inferred",
  "manual",
  "system_verified",
  "organizer_verified",
  "admin_verified",
]);
export const organizationMembershipRoleEnum = pgEnum("organization_membership_role", ["owner", "admin", "editor"]);
export const organizationMembershipStatusEnum = pgEnum("organization_membership_status", ["pending", "approved", "rejected"]);
export const submissionStatusEnum = pgEnum("submission_status", ["pending", "approved", "rejected", "merged", "withdrawn"]);
export const submitterTypeEnum = pgEnum("submitter_type", ["organizer", "community"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    email: text("email").notNull().unique(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    imageUrl: text("image_url"),
    role: roleEnum("role").notNull().default("user"),
    // Global email opt-out (CAN-SPAM/CASL). Set via the signed unsubscribe link
    // in every outgoing email; null means the user still receives email.
    emailUnsubscribedAt: timestamp("email_unsubscribed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("users_role_idx").on(table.role)]
);

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  headline: varchar("headline", { length: 160 }),
  bio: text("bio"),
  locationCity: varchar("location_city", { length: 120 }),
  locationRegion: varchar("location_region", { length: 120 }),
  countryCode: varchar("country_code", { length: 2 }),
  school: varchar("school", { length: 160 }),
  githubUrl: text("github_url"),
  linkedinUrl: text("linkedin_url"),
  instagramUrl: text("instagram_url"),
  xUrl: text("x_url"),
  devpostUrl: text("devpost_url"),
  portfolioUrl: text("portfolio_url"),
  skills: jsonb("skills").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 160 }).notNull().unique(),
  websiteUrl: text("website_url"),
  logoUrl: text("logo_url"),
  description: text("description"),
  isVerified: boolean("is_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const hackathonSeries = pgTable(
  "hackathon_series",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 180 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull().unique(),
    websiteUrl: text("website_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("hackathon_series_slug_idx").on(table.slug)]
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: organizationMembershipRoleEnum("role").notNull().default("editor"),
    status: organizationMembershipStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    index("organization_memberships_user_idx").on(table.userId),
    index("organization_memberships_status_idx").on(table.status),
  ]
);

export const hackathons = pgTable(
  "hackathons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    seriesId: uuid("series_id").references(() => hackathonSeries.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    name: varchar("name", { length: 180 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull().unique(),
    shortDescription: text("short_description"),
    websiteUrl: text("website_url"),
    imageUrl: text("image_url"),
    applicationUrl: text("application_url"),
    venue: varchar("venue", { length: 160 }),
    format: hackathonFormatEnum("format").notNull().default("in_person"),
    status: hackathonStatusEnum("status").notNull().default("draft"),
    beginnerFriendly: boolean("beginner_friendly").notNull().default(false),
    travelReimbursement: boolean("travel_reimbursement").notNull().default(false),
    prizeAmountUsd: integer("prize_amount_usd"),
    voteScore: integer("vote_score").notNull().default(0),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    dataConfidenceScore: numeric("data_confidence_score", { precision: 5, scale: 2 }).default("0"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("hackathons_series_idx").on(table.seriesId),
    index("hackathons_status_idx").on(table.status),
    index("hackathons_format_idx").on(table.format),
    index("hackathons_name_trgm_idx").using("gin", sql`${table.name} gin_trgm_ops`),
    uniqueIndex("hackathons_name_slug_idx").on(table.name, table.slug),
  ]
);

export const hackathonLocations = pgTable(
  "hackathon_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    city: varchar("city", { length: 120 }),
    region: varchar("region", { length: 120 }),
    country: varchar("country", { length: 120 }).notNull(),
    countryCode: varchar("country_code", { length: 2 }),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    coordinates: geographyPoint("coordinates"),
  },
  (table) => [
    index("hackathon_locations_hackathon_idx").on(table.hackathonId),
    uniqueIndex("hackathon_locations_hackathon_unique_idx").on(table.hackathonId),
    index("hackathon_locations_country_idx").on(table.country),
    index("hackathon_locations_coordinates_idx").using("gist", table.coordinates),
  ]
);

export const hackathonDates = pgTable(
  "hackathon_dates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    applicationOpensAt: timestamp("application_opens_at", { withTimezone: true }),
    applicationClosesAt: timestamp("application_closes_at", { withTimezone: true }),
    acceptanceAt: timestamp("acceptance_at", { withTimezone: true }),
  },
  (table) => [
    index("hackathon_dates_hackathon_idx").on(table.hackathonId),
    uniqueIndex("hackathon_dates_hackathon_unique_idx").on(table.hackathonId),
    index("hackathon_dates_start_idx").on(table.startsAt),
  ]
);

export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const hackathonTags = pgTable(
  "hackathon_tags",
  {
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.hackathonId, table.tagId] })]
);

export const userHackathons = pgTable(
  "user_hackathons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    applicationStatus: applicationStatusEnum("application_status").notNull().default("interested"),
    isSaved: boolean("is_saved").notNull().default(true),
    isPinned: boolean("is_pinned").notNull().default(false),
    awardName: varchar("award_name", { length: 180 }),
    devpostUrl: text("devpost_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("user_hackathons_user_event_idx").on(table.userId, table.hackathonId)]
);

export const userHackathonAttendanceDays = pgTable(
  "user_hackathon_attendance_days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    attendedOn: pgDate("attended_on", { mode: "date" }).notNull(),
    source: attendanceSourceEnum("source").notNull().default("inferred"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_hackathon_attendance_unique_idx").on(table.userId, table.hackathonId, table.attendedOn),
    index("user_hackathon_attendance_user_day_idx").on(table.userId, table.attendedOn),
  ]
);

export const hackathonCheckinCodes = pgTable(
  "hackathon_checkin_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 20 }).notNull().unique(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("hackathon_checkin_codes_hackathon_idx").on(table.hackathonId)]
);

export const userHackathonVotes = pgTable(
  "user_hackathon_votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    vote: integer("vote").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_hackathon_votes_user_event_idx").on(table.userId, table.hackathonId),
    index("user_hackathon_votes_hackathon_idx").on(table.hackathonId),
  ]
);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    type: reminderTypeEnum("type").notNull(),
    channel: notificationChannelEnum("channel").notNull().default("email"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("reminders_due_idx").on(table.scheduledFor),
    index("reminders_pending_due_idx")
      .on(table.channel, table.scheduledFor)
      .where(sql`${table.sentAt} is null`),
    index("reminders_user_hackathon_idx").on(table.userId, table.hackathonId),
    uniqueIndex("reminders_pending_delivery_unique_idx")
      .on(table.userId, table.hackathonId, table.type, table.channel, table.scheduledFor)
      .where(sql`${table.sentAt} is null`),
  ]
);

export const userHackathonNotificationPreferences = pgTable(
  "user_hackathon_notification_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    type: reminderTypeEnum("type").notNull(),
    channel: notificationChannelEnum("channel").notNull().default("email"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_hackathon_notification_preferences_unique_idx").on(
      table.userId,
      table.hackathonId,
      table.type,
      table.channel
    ),
    index("user_hackathon_notification_preferences_user_idx").on(table.userId),
    index("user_hackathon_notification_preferences_hackathon_idx").on(table.hackathonId),
  ]
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: reminderTypeEnum("type").notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("notifications_user_idx").on(table.userId)]
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id").references(() => hackathons.id, { onDelete: "cascade" }),
    sourceType: sourceTypeEnum("source_type").notNull(),
    sourceUrl: text("source_url").notNull(),
    reliabilityScore: numeric("reliability_score", { precision: 5, scale: 2 }).default("0"),
    importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("sources_hackathon_idx").on(table.hackathonId)]
);

export const importBatches = pgTable("import_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceName: varchar("source_name", { length: 120 }).notNull(),
  runId: varchar("run_id", { length: 120 }).notNull().unique(),
  rawPayloadUrl: text("raw_payload_url"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const importItems = pgTable(
  "import_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importBatchId: uuid("import_batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    matchedHackathonId: uuid("matched_hackathon_id").references(() => hackathons.id, { onDelete: "set null" }),
    externalId: varchar("external_id", { length: 200 }),
    payload: jsonb("payload").notNull(),
    status: importStatusEnum("status").notNull().default("pending"),
    duplicateScore: numeric("duplicate_score", { precision: 5, scale: 2 }).default("0"),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("import_items_batch_idx").on(table.importBatchId)]
);

export const hackathonSubmissions = pgTable(
  "hackathon_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submittedByUserId: uuid("submitted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    submitterType: submitterTypeEnum("submitter_type").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    matchedHackathonId: uuid("matched_hackathon_id").references(() => hackathons.id, { onDelete: "set null" }),
    approvedHackathonId: uuid("approved_hackathon_id").references(() => hackathons.id, { onDelete: "set null" }),
    status: submissionStatusEnum("status").notNull().default("pending"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    normalizedName: varchar("normalized_name", { length: 180 }).notNull(),
    websiteUrl: text("website_url").notNull(),
    sourceUrl: text("source_url").notNull(),
    duplicateScore: numeric("duplicate_score", { precision: 5, scale: 2 }).default("0"),
    reviewerNotes: text("reviewer_notes"),
    rejectionReason: text("rejection_reason"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("hackathon_submissions_status_idx").on(table.status),
    index("hackathon_submissions_submitter_idx").on(table.submittedByUserId),
    index("hackathon_submissions_organization_idx").on(table.organizationId),
  ]
);

export const organizerClaims = pgTable(
  "organizer_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    message: text("message"),
    status: importStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("organizer_claims_user_status_hackathon_idx").on(table.userId, table.status, table.hackathonId)]
);

export const sponsorLeads = pgTable("sponsor_leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyName: varchar("company_name", { length: 180 }).notNull(),
  contactName: varchar("contact_name", { length: 180 }).notNull(),
  email: text("email").notNull(),
  websiteUrl: text("website_url"),
  message: text("message"),
  budgetUsd: integer("budget_usd"),
  status: leadStatusEnum("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizerLeads = pgTable("organizer_leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationName: varchar("organization_name", { length: 180 }).notNull(),
  contactName: varchar("contact_name", { length: 180 }).notNull(),
  email: text("email").notNull(),
  eventName: varchar("event_name", { length: 180 }),
  websiteUrl: text("website_url"),
  message: text("message"),
  status: leadStatusEnum("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id").references(() => hackathons.id, { onDelete: "set null" }),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    demoUrl: text("demo_url"),
    repoUrl: text("repo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("projects_user_hackathon_idx").on(table.userId, table.hackathonId)]
);

export const achievements = pgTable(
  "achievements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    awarder: varchar("awarder", { length: 180 }),
    awardedAt: timestamp("awarded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("achievements_user_idx").on(table.userId)]
);

export const hackathonResults = pgTable(
  "hackathon_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    placement: varchar("placement", { length: 120 }),
    awardName: varchar("award_name", { length: 180 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("hackathon_results_user_hackathon_idx").on(table.userId, table.hackathonId),
    index("hackathon_results_hackathon_idx").on(table.hackathonId),
  ]
);

export const discordGuilds = pgTable("discord_guilds", {
  id: uuid("id").defaultRandom().primaryKey(),
  guildSnowflake: text("guild_snowflake").notNull().unique(),
  hackathonId: uuid("hackathon_id").references(() => hackathons.id, { onDelete: "set null" }),
  name: varchar("name", { length: 180 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const discordChannels = pgTable("discord_channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  guildId: uuid("guild_id")
    .notNull()
    .references(() => discordGuilds.id, { onDelete: "cascade" }),
  seriesId: uuid("series_id").references(() => hackathonSeries.id, { onDelete: "set null" }),
  hackathonId: uuid("hackathon_id").references(() => hackathons.id, { onDelete: "set null" }),
  channelSnowflake: text("channel_snowflake").notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  category: varchar("category", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("discord_channels_guild_series_idx").on(table.guildId, table.seriesId),
  index("discord_channels_hackathon_idx").on(table.hackathonId),
  index("discord_channels_series_idx").on(table.seriesId),
]);

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
  userHackathons: many(userHackathons),
  notificationPreferences: many(userHackathonNotificationPreferences),
  reminders: many(reminders),
  notifications: many(notifications),
  projects: many(projects),
  achievements: many(achievements),
  organizationMemberships: many(organizationMemberships),
  hackathonSubmissions: many(hackathonSubmissions),
  attendanceDays: many(userHackathonAttendanceDays),
  hackathonVotes: many(userHackathonVotes),
}));

export const hackathonsRelations = relations(hackathons, ({ one, many }) => ({
  series: one(hackathonSeries, {
    fields: [hackathons.seriesId],
    references: [hackathonSeries.id],
  }),
  organization: one(organizations, {
    fields: [hackathons.organizationId],
    references: [organizations.id],
  }),
  location: one(hackathonLocations, {
    fields: [hackathons.id],
    references: [hackathonLocations.hackathonId],
  }),
  dates: one(hackathonDates, {
    fields: [hackathons.id],
    references: [hackathonDates.hackathonId],
  }),
  sources: many(sources),
  tags: many(hackathonTags),
  attendanceDays: many(userHackathonAttendanceDays),
  notificationPreferences: many(userHackathonNotificationPreferences),
  votes: many(userHackathonVotes),
}));

export const hackathonSeriesRelations = relations(hackathonSeries, ({ many }) => ({
  hackathons: many(hackathons),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(organizationMemberships),
  submissions: many(hackathonSubmissions),
}));

export type InsertUser = typeof users.$inferInsert;
export type SelectHackathonSeries = typeof hackathonSeries.$inferSelect;
export type SelectHackathon = typeof hackathons.$inferSelect;
export type SelectUser = typeof users.$inferSelect;
export type SelectHackathonSubmission = typeof hackathonSubmissions.$inferSelect;
