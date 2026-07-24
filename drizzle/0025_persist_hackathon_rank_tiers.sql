DROP FUNCTION IF EXISTS record_hackathon_faceoff_vote(uuid, uuid, uuid, varchar, uuid);--> statement-breakpoint
DROP TABLE "hackathon_faceoff_matchups" CASCADE;--> statement-breakpoint
DROP TABLE "hackathon_faceoff_votes" CASCADE;--> statement-breakpoint

/* Face Off stores current state only. Pair selection happens in the browser,
   and one aggregate rate-limit bucket replaces per-matchup and per-vote logs. */
CREATE OR REPLACE FUNCTION record_hackathon_faceoff_vote(
	p_winner_id uuid,
	p_loser_id uuid,
	p_voter_fingerprint varchar
)
RETURNS TABLE (
	outcome text,
	winner_id uuid,
	loser_id uuid,
	winner_elo_before integer,
	winner_elo_after integer,
	loser_elo_before integer,
	loser_elo_after integer,
	upset boolean,
	retry_after_ms integer
)
LANGUAGE plpgsql
AS $$
DECLARE
	v_bucket_count integer;
	v_bucket_expires_at timestamptz;
	v_eligible_count integer;
	v_winner_wins integer;
	v_winner_losses integer;
	v_loser_wins integer;
	v_loser_losses integer;
	v_k integer;
	v_winner_expected double precision;
BEGIN
	IF p_winner_id = p_loser_id THEN
		outcome := 'invalid_pair';
		retry_after_ms := 0;
		RETURN NEXT;
		RETURN;
	END IF;

	/* One row per voter, reused every day. This bounds write volume while still
	   preventing a single browser identity from hammering Elo continuously. */
	INSERT INTO rate_limit_buckets AS bucket (
		key,
		count,
		window_started_at,
		expires_at
	)
	VALUES (
		'faceoff-vote:' || p_voter_fingerprint,
		1,
		clock_timestamp(),
		clock_timestamp() + interval '24 hours'
	)
	ON CONFLICT (key) DO UPDATE
	SET
		count = CASE
			WHEN bucket.expires_at <= clock_timestamp() THEN 1
			ELSE bucket.count + 1
		END,
		window_started_at = CASE
			WHEN bucket.expires_at <= clock_timestamp() THEN clock_timestamp()
			ELSE bucket.window_started_at
		END,
		expires_at = CASE
			WHEN bucket.expires_at <= clock_timestamp() THEN clock_timestamp() + interval '24 hours'
			ELSE bucket.expires_at
		END
	RETURNING bucket.count, bucket.expires_at
	INTO v_bucket_count, v_bucket_expires_at;

	IF v_bucket_count > 50 THEN
		outcome := 'daily_limit';
		retry_after_ms := GREATEST(
			1,
			CEIL(EXTRACT(epoch FROM (v_bucket_expires_at - clock_timestamp())) * 1000)::integer
		);
		RETURN NEXT;
		RETURN;
	END IF;

	SELECT count(*)::integer
	INTO v_eligible_count
	FROM hackathons h
	WHERE h.id IN (p_winner_id, p_loser_id)
	  AND h.published_at IS NOT NULL
	  AND h.status IN ('upcoming', 'live', 'completed');

	IF v_eligible_count <> 2 THEN
		outcome := 'ineligible_pair';
		retry_after_ms := 0;
		RETURN NEXT;
		RETURN;
	END IF;

	/* Deterministic row order permits unrelated matchups to update concurrently
	   without a global lock or a full-population tier rewrite. */
	PERFORM r.hackathon_id
	FROM hackathon_faceoff_ratings r
	WHERE r.hackathon_id IN (p_winner_id, p_loser_id)
	ORDER BY r.hackathon_id
	FOR UPDATE;

	SELECT r.elo_rating, r.faceoff_wins, r.faceoff_losses
	INTO winner_elo_before, v_winner_wins, v_winner_losses
	FROM hackathon_faceoff_ratings r
	WHERE r.hackathon_id = p_winner_id;

	SELECT r.elo_rating, r.faceoff_wins, r.faceoff_losses
	INTO loser_elo_before, v_loser_wins, v_loser_losses
	FROM hackathon_faceoff_ratings r
	WHERE r.hackathon_id = p_loser_id;

	IF winner_elo_before IS NULL OR loser_elo_before IS NULL THEN
		outcome := 'missing_rating';
		retry_after_ms := 0;
		RETURN NEXT;
		RETURN;
	END IF;

	v_k := LEAST(
		CASE
			WHEN v_winner_wins + v_winner_losses < 10 THEN 40
			WHEN v_winner_wins + v_winner_losses < 30 THEN 24
			ELSE 16
		END,
		CASE
			WHEN v_loser_wins + v_loser_losses < 10 THEN 40
			WHEN v_loser_wins + v_loser_losses < 30 THEN 24
			ELSE 16
		END
	);
	v_winner_expected := 1.0 / (
		1.0 + power(10.0, (loser_elo_before - winner_elo_before) / 400.0)
	);
	winner_elo_after := round(winner_elo_before + v_k * (1.0 - v_winner_expected))::integer;
	loser_elo_after := loser_elo_before - (winner_elo_after - winner_elo_before);

	UPDATE hackathon_faceoff_ratings
	SET
		elo_rating = CASE
			WHEN hackathon_id = p_winner_id THEN winner_elo_after
			ELSE loser_elo_after
		END,
		faceoff_wins = faceoff_wins + CASE WHEN hackathon_id = p_winner_id THEN 1 ELSE 0 END,
		faceoff_losses = faceoff_losses + CASE WHEN hackathon_id = p_loser_id THEN 1 ELSE 0 END,
		version = version + 1,
		updated_at = clock_timestamp()
	WHERE hackathon_id IN (p_winner_id, p_loser_id);

	outcome := 'ok';
	winner_id := p_winner_id;
	loser_id := p_loser_id;
	upset := loser_elo_before - winner_elo_before >= 150;
	retry_after_ms := 0;
	RETURN NEXT;
END;
$$;
