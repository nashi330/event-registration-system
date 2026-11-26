# Supabase setup

These steps connect a local clone of the app to its own Supabase project.

## 1. Create a Supabase project

Create a project in the [Supabase Dashboard](https://supabase.com/dashboard). Keep the project URL and publishable API key available.

## 2. Create the database schema

In the project dashboard, open **SQL Editor**, create a new query, paste the contents of [`schema.sql`](./schema.sql), and run it. Run this once on a new project.

The script creates the app's tables, row-level security policies, and check-in function.

## 3. Configure the local app

In the repository root (the same folder as `package.json`), create `.env.local`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-key>
```

Find the project URL and publishable key in the Supabase Dashboard under **Project Settings → API Keys**. The app expects the publishable key in `VITE_SUPABASE_ANON_KEY`.

Never put a Supabase secret or service-role key in this file or in frontend code. `.env.local` is git-ignored; each clone needs its own project credentials.

## 4. Run the app

From the repository root:

```sh
npm install
npm run dev
```

If the dev server was already running when you created or changed `.env.local`, restart it. The app can sign in and register users once Supabase is configured. Create events in the app's admin dashboard before expecting the public events page to show any.
