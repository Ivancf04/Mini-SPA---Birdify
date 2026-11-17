-- ============================================================================
-- Migration: 20261117004705_push_and_sightings.sql
-- Description: DDL, RLS policies, and role grants for Birdify Web Push & Sightings
-- Target: Supabase Postgres (public schema)
-- ============================================================================

-- 1. Enable required extension for UUID generation (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 2. Table: public.push_subscriptions
-- Stores Web Push subscriptions from PWA clients (PushSubscription JSON)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for querying subscriptions by user_id
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id 
    ON public.push_subscriptions (user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists to make migration idempotent
DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow backend access to push_subscriptions" ON public.push_subscriptions;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- RLS Policy: Allow backend access (anon, authenticated, service_role, public)
CREATE POLICY "Allow backend access to push_subscriptions" 
    ON public.push_subscriptions
    FOR ALL 
    TO public, anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);

-- Explicit role grants for public.push_subscriptions
GRANT ALL ON TABLE public.push_subscriptions TO anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. Table: public.sightings
-- Schema alignment and idempotent client_request_id column
-- ----------------------------------------------------------------------------
-- Ensure client_request_id column exists for persistent idempotency
ALTER TABLE public.sightings 
    ADD COLUMN IF NOT EXISTS client_request_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_sightings_client_request_id 
    ON public.sightings (client_request_id);

-- Ensure RLS is enabled on public.sightings
ALTER TABLE public.sightings ENABLE ROW LEVEL SECURITY;

-- Sighting RLS Policies:
DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow backend anon insert sightings" ON public.sightings;
    DROP POLICY IF EXISTS "Allow backend anon delete sightings" ON public.sightings;
    DROP POLICY IF EXISTS "Permitir lectura pública de avistamientos" ON public.sightings;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Allow backend anon insert sightings" 
    ON public.sightings 
    FOR INSERT 
    TO anon, service_role 
    WITH CHECK (true);

CREATE POLICY "Allow backend anon delete sightings" 
    ON public.sightings 
    FOR DELETE 
    TO anon, service_role 
    USING (true);

CREATE POLICY "Permitir lectura pública de avistamientos" 
    ON public.sightings 
    FOR SELECT 
    TO public 
    USING (true);

-- Role grants for public.sightings
GRANT ALL ON TABLE public.sightings TO anon, authenticated, service_role;

-- Ensure read grants on joined tables (birds, users) for anon backend calls
GRANT SELECT ON TABLE public.birds TO anon, authenticated, service_role;
GRANT SELECT (id, username, fullname, email, profile_pic_url) ON TABLE public.users TO anon, authenticated, service_role;

-- User select policy to allow joined queries on author information
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'users' 
          AND policyname = 'Permitir lectura publica de usuarios'
    ) THEN
        CREATE POLICY "Permitir lectura publica de usuarios" 
            ON public.users 
            FOR SELECT 
            TO public 
            USING (true);
    END IF;
END $$;
