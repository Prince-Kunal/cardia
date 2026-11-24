# Cardia cloud

The cloud side of sync (PLAN.md §5): a Supabase project (Postgres, Auth and Storage) that each computer's
engine syncs its library with. Offline first: every computer's own library is the source of truth, and
the app works fully with sync off, signed out or offline. Owner: Prince.

## What is here

`supabase/migrations/20261123000000_init.sql` sets up everything:

| Part | What it holds |
|---|---|
| `workspaces`, `workspace_members` | Personal and lab workspaces; roles owner, editor and viewer |
| `hearts` | Experiment details. `merge_heart()` keeps, per field, the later change, so a computer that was offline cannot overwrite a field someone changed afterwards. Hearts in the trash are tombstones (`details.deleted_at`) |
| `heart_history` | Every earlier version of a heart's details |
| `heart_slices` | Which heart each slice is in, its position and typed weight; the later change wins; `heart_key` null means taken out |
| `slice_results` | Analysis results, written once and never changed |
| `learn_progress`, `devices` | Per person |
| Storage bucket `cardia` | `<workspace>/results/<slice>/<layer>.png`; original scans in `<workspace>/images/<sha256>.<ext>` only for workspaces that opt in |

Row-level security gives members read access and owners and editors write access to their workspace's rows and
files. Viewers can read but never write. Nothing can be deleted except by an owner deleting a whole workspace.

## Setting it up (Phase B, item 1)

1. Make a Supabase project. Choose the storage region with GVSU, and agree what lab data may be kept there
   **before** a lab workspace is used (PLAN.md §5, data policy).
2. Run the migration: paste the SQL file into the project's SQL editor, or with the Supabase CLI,
   `supabase link --project-ref <ref>` then `supabase db push` from this folder.
3. Under Authentication, keep email sign-in on (with email confirmation). Google or Microsoft sign-in can be
   added later; the engine signs in with email and password today.
4. Give each computer's engine the project's URL and **anon** key (never the service-role key):

   ```bash
   export CARDIA_SUPABASE_URL=https://<ref>.supabase.co
   export CARDIA_SUPABASE_ANON_KEY=<anon key>
   cd engine && uv run python -m cardia_api
   ```

   The anon key is public by design: row-level security protects the data. Then open **Sync** in the app and sign in.

## Before the project exists

`uv run python -m cardia_api --mock --fake-cloud` syncs with a cloud held in the engine's memory, with the same
rules as the schema, so the screens can be tried. The engine's tests sync two engines through it
(`engine/tests/test_sync.py`) and check the Supabase client's requests against a recording transport.
