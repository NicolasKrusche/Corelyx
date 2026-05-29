-- In-app blog posts authored by the Corelyx team.

CREATE TABLE IF NOT EXISTS public.posts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  slug          TEXT        NOT NULL UNIQUE,
  content       JSONB       NOT NULL DEFAULT '{}',
  cover_image_url TEXT,
  published_at  TIMESTAMPTZ,
  tags          TEXT[]      NOT NULL DEFAULT '{}',
  author_name   TEXT        NOT NULL DEFAULT 'Corelyx Team',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_published
  ON public.posts (published_at DESC)
  WHERE published_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_slug ON public.posts (slug);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read published posts.
CREATE POLICY "posts_read_published" ON public.posts
  FOR SELECT USING (
    published_at IS NOT NULL AND published_at <= now()
  );

-- Only service role (admin operations) can write — no direct client writes.

-- Auto-update updated_at on row change.
CREATE OR REPLACE FUNCTION public.posts_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_set_updated_at();

-- Storage bucket for post cover images and inline images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read post images (bucket is public so this covers anonymous too).
CREATE POLICY "post_images_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'post-images');

-- Only service role can upload/delete post images (handled server-side).
