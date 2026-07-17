-- Private storage buckets for order assets. No public access; served via
-- short-lived signed URLs generated server-side with the service-role key.

insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', false),
  ('design-files', 'design-files', false)
on conflict (id) do nothing;

-- No storage.objects policies for anon/authenticated — service role bypasses
-- RLS and is the only caller (uploads and signed-URL issuance happen in
-- Server Actions).
