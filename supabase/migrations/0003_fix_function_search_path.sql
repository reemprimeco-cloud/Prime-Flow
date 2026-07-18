-- Pin search_path on the trigger function per Supabase's security linter
-- (function_search_path_mutable) to prevent search_path hijacking.

alter function public.set_updated_at() set search_path = pg_catalog, public;
