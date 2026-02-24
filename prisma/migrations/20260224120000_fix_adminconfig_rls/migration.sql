-- Fix: Supabase Advisor warning
-- Table: public."AdminConfig"
-- Problem: RLS enabled but no policies exist (and this table stores admin secrets).
-- Approach: Disable RLS and revoke access from Supabase client-facing roles.

-- 1) Disable RLS (table is only accessed server-side via Prisma).
ALTER TABLE IF EXISTS public."AdminConfig" DISABLE ROW LEVEL SECURITY;

-- 2) Revoke table privileges from Supabase client roles if they exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public."AdminConfig" FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public."AdminConfig" FROM authenticated';
  END IF;

  -- PUBLIC always exists
  EXECUTE 'REVOKE ALL ON TABLE public."AdminConfig" FROM PUBLIC';
END
$$;
