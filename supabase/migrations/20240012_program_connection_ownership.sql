-- Ensure a user can only link programs to connections they also own.

DELETE FROM public.program_connections pc
USING public.programs p, public.connections c
WHERE pc.program_id = p.id
  AND pc.connection_id = c.id
  AND p.user_id <> c.user_id;

DROP POLICY IF EXISTS "own program_connections" ON public.program_connections;

CREATE POLICY "own program_connections" ON public.program_connections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_id AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.id = connection_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_id AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.id = connection_id AND c.user_id = auth.uid()
    )
  );
