-- ============================================================
-- 037_filter_contacts_by_tags_v2.sql
--
-- Adds p_exclude_tag_ids to filter_contacts_by_tags so callers
-- can request contacts that do NOT have certain tags, in addition
-- to (or instead of) the existing include-tag filter.
--
-- The old 4-parameter signature is dropped first because
-- CREATE OR REPLACE does not replace across differing signatures
-- in Postgres.
-- ============================================================

DROP FUNCTION IF EXISTS public.filter_contacts_by_tags(UUID[], TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.filter_contacts_by_tags(
  p_tag_ids         UUID[]  DEFAULT NULL,
  p_exclude_tag_ids UUID[]  DEFAULT NULL,
  p_search          TEXT    DEFAULT NULL,
  p_limit           INT     DEFAULT 25,
  p_offset          INT     DEFAULT 0
)
RETURNS TABLE (contact contacts, total_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH matched AS (
    SELECT DISTINCT c.id, c.created_at
    FROM contacts c
    WHERE
      -- Include filter: when non-empty, contact must have at least one of these tags (OR).
      (
        cardinality(p_tag_ids) = 0
        OR EXISTS (
          SELECT 1 FROM contact_tags ct
          WHERE ct.contact_id = c.id AND ct.tag_id = ANY(p_tag_ids)
        )
      )
      -- Exclude filter: contact must not carry any of the excluded tags.
      AND (
        cardinality(p_exclude_tag_ids) = 0
        OR NOT EXISTS (
          SELECT 1 FROM contact_tags ct
          WHERE ct.contact_id = c.id AND ct.tag_id = ANY(p_exclude_tag_ids)
        )
      )
      -- Search filter
      AND (
        p_search IS NULL
        OR c.name  ILIKE '%' || p_search || '%'
        OR c.phone ILIKE '%' || p_search || '%'
        OR c.email ILIKE '%' || p_search || '%'
      )
  ),
  page AS (
    SELECT id, count(*) OVER() AS total_count
    FROM matched
    ORDER BY created_at DESC, id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT c AS contact, page.total_count
  FROM page
  JOIN contacts c ON c.id = page.id
  ORDER BY c.created_at DESC, c.id;
$$;

ALTER FUNCTION public.filter_contacts_by_tags(UUID[], UUID[], TEXT, INT, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.filter_contacts_by_tags(UUID[], UUID[], TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filter_contacts_by_tags(UUID[], UUID[], TEXT, INT, INT) TO authenticated;
