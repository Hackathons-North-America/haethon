-- Rename the enum label in place so saved selections and the default stay intact.
DO $$
BEGIN
  IF 'attending' <> ALL (enum_range(NULL::"public"."application_status")::text[]) THEN
    ALTER TYPE "public"."application_status" RENAME VALUE 'accepted' TO 'attending';
  END IF;
END;
$$;
