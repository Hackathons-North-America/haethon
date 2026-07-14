# CI/CD with GitHub Actions and Vercel

The pipeline lives in [`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml). It uses GitHub Actions for orchestration and Vercel for hosting because this Next.js project already has a `vercel.json` configuration.

## What happens

### Pull request into `main`

GitHub runs the `Quality gates` job:

1. Check out the commit.
2. Install Node.js 24 and pnpm with dependency caching.
3. Install exactly the dependencies recorded in `pnpm-lock.yaml`.
4. Run ESLint, TypeScript, and all Vitest unit tests.
5. Create a production Next.js build.

The build uses non-secret placeholder values because several server modules initialize the database and Clerk clients while Next.js collects route metadata. The build does not start a server or connect to the placeholder database. These values are scoped to that one CI step and are never used for deployment.

### Push or merge to `main`

The same quality gates run first. Only when all of them pass does the `Deploy production` job run:

1. Vercel CLI uploads the source to the linked project.
2. Vercel creates the production build remotely with the project's real production configuration.
3. Vercel promotes the successful build as a production deployment.
4. The deployment URL is attached to the GitHub Actions environment.

The remote build is intentional. Sensitive Vercel environment variables cannot be decrypted by `vercel pull`, so a local `vercel build` in GitHub Actions would receive empty values. Vercel's remote build can access those values without exposing them to the runner.

The `needs: checks` dependency is the release gate: a lint, type, test, or build failure prevents deployment. Concurrency also cancels an older run on the same branch when a newer commit arrives.

End-to-end Playwright tests are intentionally not in this first, simple pipeline. They need a browser plus test-safe Clerk and database configuration. Add them later as a separate job so they can be configured without slowing every basic check.

## One-time setup

### 1. Link the repository to a Vercel project

Install and authenticate the Vercel CLI locally, then link this folder:

```bash
pnpm dlx vercel@55.0.0 login
pnpm dlx vercel@55.0.0 link
```

The generated `.vercel/project.json` contains `orgId` and `projectId`. The `.vercel` directory is already ignored by Git and must not be committed.

### 2. Configure Vercel's production environment

In the Vercel project, add the production values documented in `.env.example`. At minimum, the current application requires:

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CRON_SECRET`

Add the optional PostHog, Sentry, Resend, Discord, and unsubscribe variables for the integrations used in production. `NEXT_PUBLIC_APP_URL` should be the final HTTPS production URL.

### 3. Add GitHub deployment secrets

In the GitHub repository, open **Settings → Environments**, create an environment named `production`, and add:

- `VERCEL_TOKEN`: a Vercel access token allowed to deploy this project.
- `VERCEL_ORG_ID`: the `orgId` from `.vercel/project.json`.
- `VERCEL_PROJECT_ID`: the `projectId` from `.vercel/project.json`.

Environment secrets keep deployment credentials scoped to the production job. Repository-level Actions secrets with the same names also work.

Optionally add a required reviewer to the `production` environment if releases should wait for manual approval after CI passes.

### 4. Avoid duplicate Vercel deployments

If the Vercel Git integration is connected and currently deploys every push automatically, disable its automatic deployments for this project. GitHub Actions should be the single deployment path; otherwise a push to `main` can create two production deployments.

### 5. Protect `main`

In **GitHub → Settings → Branches/Rulesets**, require pull requests and require the `Quality gates` status check before merging. This prevents merging code that has not passed CI.

## Day-to-day flow

1. Create a feature branch and open a pull request to `main`.
2. Fix any failing `Quality gates` checks.
3. Review and merge the pull request.
4. Watch **GitHub → Actions → CI/CD**. The production deployment starts only after the checks pass.
5. Open the deployment URL shown on the run and smoke-test `/`, `/hackathons`, sign-in, and `/api/health`.

## Database migrations and rollback

Database migrations are deliberately not automatic in this initial pipeline. Schema changes can be destructive and should have a backup and an explicit release procedure. For now, review the generated SQL and run `pnpm db:migrate` against the production database immediately before deploying a compatible application change.

Vercel keeps deployment history. For an application rollback, promote a known-good deployment in Vercel or revert the bad Git commit and merge the revert. A database rollback is separate and must follow the migration's reviewed rollback plan.

## Recommended next improvements

1. Add a Playwright job backed by an isolated test database and Clerk test application.
2. Add preview deployments for pull requests after production deployment is stable.
3. Add a post-deployment request to `/api/health` and fail the workflow if it is unhealthy.
4. Add dependency and action update automation, plus pinned action commit SHAs if your security policy requires them.
5. Formalize database migration approvals and backups before automating migrations.
