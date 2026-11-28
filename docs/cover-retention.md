# Cover retention and "HNA approved"

Hackathons keep every field forever, but cover images cost UploadThing
storage. So a hackathon that is not **HNA approved** (Hackathons North
America: worth keeping in full) loses its cover 30 days after it ends.
Approved hackathons keep everything.

## What happens

Once a day the cron `app/api/cron/cleanup-hackathons` picks up to 100
hackathons that:

- have `hna_approved = false`,
- have a `hackathon_dates` row with `ends_at` more than 30 days ago (no dates
  row: skipped), and
- still have at least one of `image_url`, `image_thumb_small_url` or
  `image_thumb_large_url`.

For each one, longest-ended first, four at a time:

1. It deletes our UploadThing files: both thumbnails, plus `image_url` only
   when that is an UploadThing URL (`uploadThingFileKey`). An organizer's own
   image URL is never deleted, only cleared from the row.
2. It nulls the three columns, only while they still hold what it read
   (`IS NOT DISTINCT FROM`). An admin edit made in between is kept.
3. If the delete fails, it leaves the row as it is, reports to Sentry
   (`feature: cover-retention`), and goes on. The next run retries.

The card then shows its initials placeholder. Name, text, dates, links and
votes are untouched. The cron JSON reports `data.covers` (`expired`,
`selected`, `cleared`, `changed`, `failed`, `deferred`, `deletedFiles`). It
stops starting rows after 40 s, so the run stays under its 60 s limit. Any
failure makes the run return 500.

Code: `lib/hackathons/cover-retention.ts`.

### What keeps it from coming back

- Thumbnail generation (`generateCoverThumbnails`, so imports, edits, feed
  updates and `pnpm backfill:cover-thumbnails`) skips a hackathon past
  retention (`skipped: expired`). The backfill leaves these hackathons out of
  its count.
- A feed re-import that sends the **same** image URL changes nothing. The
  feed diff (`hackathon_external_ids.last_payload`) sees no change, so a
  cleared image stays cleared.
- A feed that sends a **different** image URL, or a duplicate merge into a
  hackathon whose image is now empty, stores that organizer URL again. No
  thumbnails are made for it. The next cron run clears the column again,
  and no UploadThing file is involved.

### Approving

HNA approval is also what gives a Canadian or US hackathon its Discord channel
(README, "HNA approval and Discord channels"). The Discord review card's
**HNA approved** answer, the `/admin/import` queue and the edit dialog all
set the same flags. A returning edition inherits its series' approval.

In `/admin/hackathons`, use **Edit**, then **HNA approved**, then save. The
card shows an "HNA approved" mark. `hna_approved_at` records the first
approval, and un-approving clears it and records "not HNA approved", so that
hackathon gets no new channel. Approving an expired hackathon whose
thumbnails were held back makes them right away. A cover the cleanup already
deleted is gone. Re-enter an image URL to restore one.

## Deploy order

Do these steps in order. Code on `main` deletes files on its first daily run
(12:12 UTC).

1. **Migrate every database, then check the column exists.** Drizzle has
   silently skipped migrations here before.

   ```sh
   pnpm db:migrate
   ```

   ```sql
   select column_name, data_type, is_nullable, column_default
   from information_schema.columns
   where table_name = 'hackathons' and column_name like 'hna_approved%';
   -- expect hna_approved (boolean, NO, false) and hna_approved_at
   select max(created_at) from drizzle.__drizzle_migrations;
   -- expect 1795719607736 (0043_hna_approved)
   ```

   If the column is missing but the journal row exists, apply
   `drizzle/0043_hna_approved.sql` by hand.

2. **Approve the keepers.** The deployed site doesn't have the toggle yet,
   so use either option:
   - Run this branch locally (`pnpm dev`) against the migrated database and
     toggle them in `/admin/hackathons`.
   - Run SQL:

     ```sql
     update hackathons set hna_approved = true, hna_approved_at = now()
     where id in ('…', '…');
     ```

3. **Dry run.** This lists exactly what the next run would clear: name, end
   date and the UploadThing files. It changes nothing.

   ```sh
   pnpm cleanup:covers --dry-run
   ```

   Approve anything you still want to keep and run it again until the list
   is right.

4. **Deploy.** The next daily cron clears the rest. To clear right away,
   run `pnpm cleanup:covers` (it needs `UPLOADTHING_TOKEN`) instead of waiting
   for the cron.
