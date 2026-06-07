"""Shared Supabase access for the crowd_season pipeline.

"Supabase is the source of truth": the raw measured signals behind
crowd_season live in cities.crowd_raw (jsonb), NOT in local cache files.
Every measurer (wiki / trends / nps) persists its raw inputs here the instant
they're computed, and resumes by reading them back. crowd_season /
crowd_intensity remain derived values recomputable from crowd_raw alone.

crowd_raw shape (any subset):
  { "wiki":   {...}, "trends": {"hotels":{...},"things_to_do":{...}}, "nps": {...} }
"""
import json, subprocess
import psycopg2, psycopg2.extras


def secret(name):
    return subprocess.check_output(
        ["security", "find-generic-password", "-a", "livability-scout", "-s", name, "-w"]
    ).decode().strip()


def connect():
    return psycopg2.connect(
        host="aws-1-us-west-2.pooler.supabase.com", port=5432,
        user="postgres.fitjkrmiwkdolxhitroc", password=secret("supabase-db-password"),
        dbname="postgres", sslmode="require",
    )


def load_cities(cur):
    """All measurable cities with their existing crowd_raw + the fields the
    pipeline needs. Returns list of RealDictRow."""
    cur.execute("""
        select id, name, lat, lon, population_total, nps_unit_code,
               crowd_season, crowd_season_source, crowd_intensity,
               coalesce(crowd_raw, '{}'::jsonb) as crowd_raw
        from cities
        where lat is not null and lon is not null
        order by name
    """)
    return cur.fetchall()


def save_raw(conn, cur, city_id, key, payload):
    """Merge one tier's raw payload into cities.crowd_raw[key], persisted
    immediately. key ∈ {'wiki','trends','nps'}. Returns nothing; commits."""
    cur.execute(
        "update cities set crowd_raw = coalesce(crowd_raw,'{}'::jsonb) || jsonb_build_object(%s, %s::jsonb) where id=%s",
        (key, json.dumps(payload), city_id),
    )
    conn.commit()


def save_raw_nested(conn, cur, city_id, parent, child, payload):
    """Merge into crowd_raw[parent][child] without clobbering sibling children
    (jsonb || is shallow, so we deep-merge one level). Used for
    crowd_raw.trends.<template> so the hotels pass doesn't wipe things_to_do."""
    cur.execute(
        """update cities set crowd_raw =
             coalesce(crowd_raw,'{}'::jsonb)
             || jsonb_build_object(%s,
                  coalesce(crowd_raw->%s, '{}'::jsonb) || jsonb_build_object(%s, %s::jsonb))
           where id=%s""",
        (parent, parent, child, json.dumps(payload), city_id),
    )
    conn.commit()


def save_season(conn, cur, city_id, shape, source, intensity=None):
    """Write the DERIVED crowd_season shape + source (+ optional intensity)."""
    if intensity is None:
        cur.execute(
            "update cities set crowd_season=%s::jsonb, crowd_season_source=%s where id=%s",
            (json.dumps(shape), source, city_id),
        )
    else:
        cur.execute(
            "update cities set crowd_season=%s::jsonb, crowd_season_source=%s, crowd_intensity=%s where id=%s",
            (json.dumps(shape), source, intensity, city_id),
        )
    conn.commit()
