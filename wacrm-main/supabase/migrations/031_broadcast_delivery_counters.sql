CREATE OR REPLACE FUNCTION increment_broadcast_delivered(p_broadcast_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE broadcasts
  SET delivered_count = COALESCE(delivered_count, 0) + 1,
      updated_at = now()
  WHERE id = p_broadcast_id;
$$;

CREATE OR REPLACE FUNCTION increment_broadcast_read(p_broadcast_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE broadcasts
  SET read_count = COALESCE(read_count, 0) + 1,
      updated_at = now()
  WHERE id = p_broadcast_id;
$$;
