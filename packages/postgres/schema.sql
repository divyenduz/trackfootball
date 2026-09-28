--
-- PostgreSQL database dump
--

-- Dumped from database version 15.13 (Ubuntu 15.13-1.pgdg22.04+1)
-- Dumped by pg_dump version 17.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgroll; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgroll;


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: FieldUsage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FieldUsage" AS ENUM (
    'TOP_HALF',
    'BOTTOM_HALF',
    'FULL_FIELD'
);


--
-- Name: Platform; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Platform" AS ENUM (
    'STRAVA'
);


--
-- Name: PostStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PostStatus" AS ENUM (
    'ERROR',
    'COMPLETED',
    'PROCESSING',
    'INIT'
);


--
-- Name: PostType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PostType" AS ENUM (
    'STRAVA_ACTIVITY',
    'UPLOADED_ACTIVITY'
);


--
-- Name: StravaWebhookEventStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StravaWebhookEventStatus" AS ENUM (
    'PENDING',
    'ERRORED',
    'COMPLETED'
);


--
-- Name: UserType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserType" AS ENUM (
    'USER',
    'ADMIN'
);


--
-- Name: find_version_schema(name, integer); Type: FUNCTION; Schema: pgroll; Owner: -
--

CREATE FUNCTION pgroll.find_version_schema(p_schema_name name, p_depth integer DEFAULT 0) RETURNS text
    LANGUAGE sql STABLE
    AS $$
    WITH RECURSIVE ancestors AS (
        SELECT
            name,
            COALESCE(migration ->> 'version_schema', name) AS version_schema,
            schema,
            parent,
            0 AS depth
        FROM
            "pgroll".migrations
        WHERE
            name = "pgroll".latest_migration (p_schema_name)
            AND SCHEMA = p_schema_name
        UNION ALL
        SELECT
            m.name,
            COALESCE(m.migration ->> 'version_schema', m.name) AS version_schema,
            m.schema,
            m.parent,
            a.depth + 1
        FROM
            "pgroll".migrations m
            JOIN ancestors a ON m.name = a.parent
                AND m.schema = a.schema
)
        SELECT
            a.version_schema
        FROM
            ancestors a
    WHERE
        EXISTS (
            SELECT
                1
            FROM
                information_schema.schemata s
            WHERE
                s.schema_name = p_schema_name || '_' || a.version_schema)
    ORDER BY
        a.depth ASC OFFSET p_depth
    LIMIT 1;
$$;


--
-- Name: is_active_migration_period(name); Type: FUNCTION; Schema: pgroll; Owner: -
--

CREATE FUNCTION pgroll.is_active_migration_period(schemaname name) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT
        EXISTS (
            SELECT
                1
            FROM
                "pgroll".migrations
            WHERE
                SCHEMA = schemaname
                AND done = FALSE)
$$;


--
-- Name: latest_migration(name); Type: FUNCTION; Schema: pgroll; Owner: -
--

CREATE FUNCTION pgroll.latest_migration(schemaname name) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pgroll', 'pg_catalog', 'pg_temp'
    AS $$
    SELECT
        p.name
    FROM
        "pgroll".migrations p
    WHERE
        NOT EXISTS (
            SELECT
                1
            FROM
                "pgroll".migrations c
            WHERE
                SCHEMA = schemaname
                AND c.parent = p.name)
        AND SCHEMA = schemaname
$$;


--
-- Name: latest_version(name); Type: FUNCTION; Schema: pgroll; Owner: -
--

CREATE FUNCTION pgroll.latest_version(schemaname name) RETURNS text
    LANGUAGE sql STABLE
    AS $$
    SELECT
        "pgroll".find_version_schema (schemaname, 0);
$$;


--
-- Name: previous_migration(name); Type: FUNCTION; Schema: pgroll; Owner: -
--

CREATE FUNCTION pgroll.previous_migration(schemaname name) RETURNS text
    LANGUAGE sql
    AS $$
    SELECT
        parent
    FROM
        "pgroll".migrations
    WHERE
        SCHEMA = schemaname
        AND name = "pgroll".latest_migration (schemaname);
$$;


--
-- Name: previous_version(name); Type: FUNCTION; Schema: pgroll; Owner: -
--

CREATE FUNCTION pgroll.previous_version(schemaname name) RETURNS text
    LANGUAGE sql STABLE
    AS $$
    SELECT
        "pgroll".find_version_schema (schemaname, 1);
$$;


--
-- Name: raw_migration(); Type: FUNCTION; Schema: pgroll; Owner: -
--

CREATE FUNCTION pgroll.raw_migration() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pgroll', 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
    schemaname text;
    migration_id text;
BEGIN
    -- Ignore schema changes made by pgroll
    IF (pg_catalog.current_setting('pgroll.internal', TRUE) = 'TRUE') THEN
        RETURN;
    END IF;
    IF tg_event = 'sql_drop' AND tg_tag = 'DROP SCHEMA' THEN
        -- Take the schema name from the drop schema command
        SELECT
            object_identity INTO schemaname
        FROM
            pg_event_trigger_dropped_objects ();
    ELSIF tg_event = 'sql_drop'
            AND tg_tag != 'ALTER TABLE' THEN
            -- Guess the schema from drop commands
            SELECT
                schema_name INTO schemaname
            FROM
                pg_catalog.pg_event_trigger_dropped_objects ()
            WHERE
                schema_name IS NOT NULL;
    ELSIF tg_event = 'ddl_command_end' THEN
        -- Guess the schema from ddl commands, ignore migrations that touch several schemas
        IF (
            SELECT
                pg_catalog.count(DISTINCT schema_name)
            FROM
                pg_catalog.pg_event_trigger_ddl_commands ()
            WHERE
                schema_name IS NOT NULL) > 1 THEN
            RETURN;
        END IF;
        IF tg_tag = 'CREATE SCHEMA' THEN
            SELECT
                object_identity INTO schemaname
            FROM
                pg_event_trigger_ddl_commands ();
        ELSE
            SELECT
                schema_name INTO schemaname
            FROM
                pg_catalog.pg_event_trigger_ddl_commands ()
            WHERE
                schema_name IS NOT NULL;
        END IF;
    END IF;
    IF schemaname IS NULL THEN
        RETURN;
    END IF;
    -- Ignore migrations done during a migration period
    IF "pgroll".is_active_migration_period (schemaname) THEN
        RETURN;
    END IF;
    -- Remove any duplicate inferred migrations with the same timestamp for this
    -- schema. We assume such migrations are multi-statement batched migrations
    -- and we are only interested in the last one in the batch.
    DELETE FROM "pgroll".migrations
    WHERE SCHEMA = schemaname
        AND created_at = CURRENT_TIMESTAMP
        AND migration_type = 'inferred'
        AND migration -> 'operations' -> 0 -> 'sql' ->> 'up' = current_query();
    -- Someone did a schema change without pgroll, include it in the history
    -- Get the latest non-inferred migration name with microsecond timestamp for ordering
    WITH latest_non_inferred AS (
        SELECT
            name
        FROM
            "pgroll".migrations
        WHERE
            SCHEMA = schemaname
            AND migration_type != 'inferred'
        ORDER BY
            created_at DESC
        LIMIT 1
)
SELECT
    INTO migration_id CASE WHEN EXISTS (
        SELECT
            1
        FROM
            latest_non_inferred) THEN
        pg_catalog.format('%s_%s', (
                SELECT
                    name
                FROM latest_non_inferred), pg_catalog.to_char(pg_catalog.clock_timestamp(), 'YYYYMMDDHH24MISSUS'))
    ELSE
        pg_catalog.format('00000_initial_%s', pg_catalog.to_char(pg_catalog.clock_timestamp(), 'YYYYMMDDHH24MISSUS'))
    END;
    INSERT INTO "pgroll".migrations (schema, name, migration, resulting_schema, done, parent, migration_type, created_at, updated_at)
        VALUES (schemaname, migration_id, pg_catalog.json_build_object('version_schema', 'sql_' || substring(md5(random()::text), 1, 8), 'operations', (
                SELECT
                    pg_catalog.json_agg(pg_catalog.json_build_object('sql', pg_catalog.json_build_object('up', pg_catalog.current_query()))))),
            "pgroll".read_schema (schemaname),
            TRUE,
            "pgroll".latest_migration (schemaname),
            'inferred',
            statement_timestamp(),
            statement_timestamp());
END;
$$;


--
-- Name: read_schema(text); Type: FUNCTION; Schema: pgroll; Owner: -
--

CREATE FUNCTION pgroll.read_schema(schemaname text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    tables jsonb;
BEGIN
    SELECT
        json_build_object('name', schemaname, 'tables', (
                SELECT
                    COALESCE(json_object_agg(t.relname, jsonb_strip_nulls (jsonb_build_object('name', t.relname, 'oid', t.oid, 'comment', descr.description, 'columns', (
                                        SELECT
                                            json_object_agg(name, c)
                                    FROM (
                                        SELECT
                                            attr.attname AS name, pg_get_expr(def.adbin, def.adrelid) AS default, NOT (attr.attnotnull
                                            OR tp.typtype = 'd'
                                            AND tp.typnotnull) AS nullable, CASE WHEN 'character varying'::regtype = ANY (ARRAY[attr.atttypid, tp.typelem]) THEN
                                        REPLACE(format_type(attr.atttypid, attr.atttypmod), 'character varying', 'varchar')
                                    WHEN 'timestamp with time zone'::regtype = ANY (ARRAY[attr.atttypid, tp.typelem]) THEN
                                        REPLACE(format_type(attr.atttypid, attr.atttypmod), 'timestamp with time zone', 'timestamptz')
                                    ELSE
                                        format_type(attr.atttypid, attr.atttypmod)
                                    END AS type, descr.description AS comment, (EXISTS (
                                            SELECT
                                                1
                                            FROM pg_constraint
                                            WHERE
                                                conrelid = attr.attrelid
                                                AND ARRAY[attr.attnum::int] @> conkey::int[]
                                                AND contype = 'u')
                                        OR EXISTS (
                                            SELECT
                                                1
                                            FROM pg_index
                                            JOIN pg_class ON pg_class.oid = pg_index.indexrelid
                                        WHERE
                                            indrelid = attr.attrelid
                                            AND indisunique
                                            AND ARRAY[attr.attnum::int] @> pg_index.indkey::int[])) AS unique, (
                                    SELECT
                                        array_agg(e.enumlabel ORDER BY e.enumsortorder)
                                    FROM pg_enum AS e
                                WHERE
                                    e.enumtypid = tp.oid) AS enumValues, CASE WHEN tp.typtype = 'b' THEN
                                    'base'
                                WHEN tp.typtype = 'c' THEN
                                    'composite'
                                WHEN tp.typtype = 'd' THEN
                                    'domain'
                                WHEN tp.typtype = 'e' THEN
                                    'enum'
                                WHEN tp.typtype = 'p' THEN
                                    'pseudo'
                                WHEN tp.typtype = 'r' THEN
                                    'range'
                                WHEN tp.typtype = 'm' THEN
                                    'multirange'
                                END AS postgresType FROM pg_attribute AS attr
                                INNER JOIN pg_type AS tp ON attr.atttypid = tp.oid
                                LEFT JOIN pg_attrdef AS def ON attr.attrelid = def.adrelid
                                    AND attr.attnum = def.adnum
                            LEFT JOIN pg_description AS descr ON attr.attrelid = descr.objoid
                                AND attr.attnum = descr.objsubid
                            WHERE
                                attr.attnum > 0
                                AND NOT attr.attisdropped
                                AND attr.attrelid = t.oid ORDER BY attr.attnum) c), 'primaryKey', (
                            SELECT
                                json_agg(pg_attribute.attname) AS primary_key_columns
                            FROM pg_index, pg_attribute
                            WHERE
                                indrelid = t.oid
                                AND nspname = schemaname
                                AND pg_attribute.attrelid = t.oid
                                AND pg_attribute.attnum = ANY (pg_index.indkey)
                                AND indisprimary), 'indexes', (
                                SELECT
                                    json_object_agg(ix_details.name, json_build_object('name', ix_details.name, 'unique', ix_details.indisunique, 'exclusion', ix_details.indisexclusion, 'columns', ix_details.columns, 'predicate', ix_details.predicate, 'method', ix_details.method, 'definition', ix_details.definition))
                            FROM (
                                SELECT
                                    replace(reverse(split_part(reverse(pi.indexrelid::regclass::text), '.', 1)), '"', '') AS name, pi.indisunique, pi.indisexclusion, array_agg(a.attname) AS columns, pg_get_expr(pi.indpred, t.oid) AS predicate, am.amname AS method, pg_get_indexdef(pi.indexrelid) AS definition
                                FROM pg_index pi
                                JOIN pg_attribute a ON a.attrelid = pi.indrelid
                                    AND a.attnum = ANY (pi.indkey)
                                JOIN pg_class cls ON cls.oid = pi.indexrelid
                                JOIN pg_am am ON am.oid = cls.relam
                                WHERE
                                    indrelid = t.oid::regclass GROUP BY pi.indexrelid, pi.indisunique, pi.indpred, am.amname) AS ix_details), 'checkConstraints', (
                        SELECT
                            json_object_agg(cc_details.conname, json_build_object('name', cc_details.conname, 'columns', cc_details.columns, 'definition', cc_details.definition, 'noInherit', cc_details.connoinherit))
                        FROM (
                            SELECT
                                cc_constraint.conname, array_agg(cc_attr.attname ORDER BY cc_constraint.conkey::int[]) AS columns, pg_get_constraintdef(cc_constraint.oid) AS definition, cc_constraint.connoinherit FROM pg_constraint AS cc_constraint
                            INNER JOIN pg_attribute cc_attr ON cc_attr.attrelid = cc_constraint.conrelid
                                AND cc_attr.attnum = ANY (cc_constraint.conkey)
                            WHERE
                                cc_constraint.conrelid = t.oid
                                AND cc_constraint.contype = 'c' GROUP BY cc_constraint.oid, cc_constraint.conname) AS cc_details), 'uniqueConstraints', (
                            SELECT
                                json_object_agg(uc_details.conname, json_build_object('name', uc_details.conname, 'columns', uc_details.columns))
                            FROM (
                                SELECT
                                    uc_constraint.conname, array_agg(uc_attr.attname ORDER BY uc_constraint.conkey::int[]) AS columns, pg_get_constraintdef(uc_constraint.oid) AS definition FROM pg_constraint AS uc_constraint
                                INNER JOIN pg_attribute uc_attr ON uc_attr.attrelid = uc_constraint.conrelid
                                    AND uc_attr.attnum = ANY (uc_constraint.conkey)
                                WHERE
                                    uc_constraint.conrelid = t.oid
                                    AND uc_constraint.contype = 'u' GROUP BY uc_constraint.oid, uc_constraint.conname) AS uc_details), 'excludeConstraints', (
                                SELECT
                                    json_object_agg(xc_details.conname, json_build_object('name', xc_details.conname, 'columns', xc_details.columns, 'definition', xc_details.definition, 'predicate', xc_details.predicate, 'method', xc_details.method))
                                FROM (
                                    SELECT
                                        xc_constraint.conname, array_agg(xc_attr.attname ORDER BY xc_constraint.conkey::int[]) AS columns, pg_get_expr(pi.indpred, t.oid) AS predicate, am.amname AS method, pg_get_constraintdef(xc_constraint.oid) AS definition FROM pg_constraint AS xc_constraint
                                    INNER JOIN pg_attribute xc_attr ON xc_attr.attrelid = xc_constraint.conrelid
                                        AND xc_attr.attnum = ANY (xc_constraint.conkey)
                                    JOIN pg_index pi ON pi.indexrelid = xc_constraint.conindid
                                    JOIN pg_class cls ON cls.oid = pi.indexrelid
                                    JOIN pg_am am ON am.oid = cls.relam
                                    WHERE
                                        xc_constraint.conrelid = t.oid
                                        AND xc_constraint.contype = 'x' GROUP BY xc_constraint.oid, xc_constraint.conname, pi.indpred, pi.indexrelid, am.amname) AS xc_details), 'foreignKeys', (
                                    SELECT
                                        json_object_agg(fk_details.conname, json_build_object('name', fk_details.conname, 'columns', fk_details.columns, 'referencedTable', fk_details.referencedTable, 'referencedColumns', fk_details.referencedColumns, 'matchType', fk_details.matchType, 'onDelete', fk_details.onDelete, 'onUpdate', fk_details.onUpdate))
                                    FROM (
                                        SELECT
                                            fk_info.conname AS conname, fk_info.columns AS columns, fk_info.relname AS referencedTable, array_agg(ref_attr.attname ORDER BY ref_attr.attname) AS referencedColumns, CASE WHEN fk_info.confmatchtype = 'f' THEN
                                            'FULL'
                                        WHEN fk_info.confmatchtype = 'p' THEN
                                            'PARTIAL'
                                        WHEN fk_info.confmatchtype = 's' THEN
                                            'SIMPLE'
                                        END AS matchType, CASE WHEN fk_info.confdeltype = 'a' THEN
                                            'NO ACTION'
                                        WHEN fk_info.confdeltype = 'r' THEN
                                            'RESTRICT'
                                        WHEN fk_info.confdeltype = 'c' THEN
                                            'CASCADE'
                                        WHEN fk_info.confdeltype = 'd' THEN
                                            'SET DEFAULT'
                                        WHEN fk_info.confdeltype = 'n' THEN
                                            'SET NULL'
                                        END AS onDelete, CASE WHEN fk_info.confupdtype = 'a' THEN
                                            'NO ACTION'
                                        WHEN fk_info.confupdtype = 'r' THEN
                                            'RESTRICT'
                                        WHEN fk_info.confupdtype = 'c' THEN
                                            'CASCADE'
                                        WHEN fk_info.confupdtype = 'd' THEN
                                            'SET DEFAULT'
                                        WHEN fk_info.confupdtype = 'n' THEN
                                            'SET NULL'
                                        END AS onUpdate FROM (
                                            SELECT
                                                fk_constraint.conname, fk_constraint.conrelid, fk_constraint.confrelid, fk_constraint.confkey, fk_cl.relname, fk_constraint.confmatchtype, fk_constraint.confdeltype, fk_constraint.confupdtype, array_agg(fk_attr.attname ORDER BY fk_attr.attname) AS columns FROM pg_constraint AS fk_constraint
                                            INNER JOIN pg_class fk_cl ON fk_constraint.confrelid = fk_cl.oid -- join the referenced table
                                            INNER JOIN pg_attribute fk_attr ON fk_attr.attrelid = fk_constraint.conrelid
                                                AND fk_attr.attnum = ANY (fk_constraint.conkey) -- join the columns of the referencing table
                                            WHERE
                                                fk_constraint.conrelid = t.oid
                                                AND fk_constraint.contype = 'f' GROUP BY fk_constraint.conrelid, fk_constraint.conname, fk_constraint.confrelid, fk_cl.relname, fk_constraint.confkey, fk_constraint.confmatchtype, fk_constraint.confdeltype, fk_constraint.confupdtype) AS fk_info
                                            INNER JOIN pg_attribute ref_attr ON ref_attr.attrelid = fk_info.confrelid
                                                AND ref_attr.attnum = ANY (fk_info.confkey) -- join the columns of the referenced table
                                        GROUP BY fk_info.conname, fk_info.conrelid, fk_info.columns, fk_info.confrelid, fk_info.confmatchtype, fk_info.confdeltype, fk_info.confupdtype, fk_info.relname) AS fk_details)))), '{}'::json)
                    FROM pg_class AS t
                    INNER JOIN pg_namespace AS ns ON t.relnamespace = ns.oid
                    LEFT JOIN pg_description AS descr ON t.oid = descr.objoid
                        AND descr.objsubid = 0
                    WHERE
                        ns.nspname = schemaname
                        AND t.relkind IN ('r', 'p') -- tables only (ignores views, materialized views & foreign tables)
)) INTO tables;
    RETURN tables;
END;
$$;


--
-- Name: jsonb_array_avg(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.jsonb_array_avg(arr jsonb) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
	RETURN (WITH el AS (
		SELECT
			avg(jsonb_array_elements::int)
		FROM
			jsonb_array_elements(arr)
)
SELECT
	*
FROM
	el LIMIT 1 );
END;
$$;


--
-- Name: jsonb_array_max(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.jsonb_array_max(arr jsonb) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
	RETURN (WITH el AS (
		SELECT
			max(jsonb_array_elements::int)
		FROM
			jsonb_array_elements(arr)
)
SELECT
	*
FROM
	el LIMIT 1 );
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: migrations; Type: TABLE; Schema: pgroll; Owner: -
--

CREATE TABLE pgroll.migrations (
    schema name NOT NULL,
    name text NOT NULL,
    migration jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    parent text,
    done boolean DEFAULT false NOT NULL,
    resulting_schema jsonb DEFAULT '{}'::jsonb NOT NULL,
    migration_type character varying(32) DEFAULT 'pgroll'::character varying,
    CONSTRAINT migration_type_check CHECK (((migration_type)::text = ANY ((ARRAY['pgroll'::character varying, 'inferred'::character varying, 'baseline'::character varying])::text[])))
);


--
-- Name: pgroll_version; Type: TABLE; Schema: pgroll; Owner: -
--

CREATE TABLE pgroll.pgroll_version (
    version text NOT NULL,
    initialized_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Blog_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Blog_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Field_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Field_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Field; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Field" (
    id integer DEFAULT nextval('public."Field_id_seq"'::regclass) NOT NULL,
    name text NOT NULL,
    "topLeft" double precision[],
    "topRight" double precision[],
    "bottomRight" double precision[],
    "bottomLeft" double precision[],
    city text NOT NULL,
    usage public."FieldUsage" NOT NULL,
    address text,
    zoom double precision DEFAULT 17.5 NOT NULL
);


--
-- Name: Match_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Match_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Post_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Post_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Post; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Post" (
    id integer DEFAULT nextval('public."Post_id_seq"'::regclass) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    type public."PostType" NOT NULL,
    text text NOT NULL,
    key text NOT NULL,
    "geoJson" jsonb,
    "totalDistance" double precision DEFAULT 0 NOT NULL,
    "elapsedTime" integer DEFAULT 0 NOT NULL,
    "totalSprintTime" integer DEFAULT 0 NOT NULL,
    "maxSpeed" double precision DEFAULT 0 NOT NULL,
    "averageSpeed" double precision DEFAULT 0 NOT NULL,
    "userId" integer NOT NULL,
    sprints jsonb,
    runs jsonb,
    "startTime" timestamp(3) without time zone,
    "fieldId" integer,
    image text,
    "halfTime" integer DEFAULT '-1'::integer NOT NULL,
    status public."PostStatus" DEFAULT 'INIT'::public."PostStatus" NOT NULL,
    "statusInfo" text DEFAULT ''::text NOT NULL
);


--
-- Name: SocialLogin_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."SocialLogin_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: SocialLogin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SocialLogin" (
    id integer DEFAULT nextval('public."SocialLogin_id_seq"'::regclass) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    platform public."Platform" NOT NULL,
    "platformId" text NOT NULL,
    "platformMeta" text NOT NULL,
    "accessToken" text NOT NULL,
    "refreshToken" text NOT NULL,
    "userId" integer NOT NULL,
    "expiresAt" timestamp(3) without time zone DEFAULT NULL::timestamp without time zone NOT NULL,
    "platformScope" text NOT NULL
);


--
-- Name: StravaWebhookEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StravaWebhookEvent" (
    id integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    status public."StravaWebhookEventStatus" NOT NULL,
    body text NOT NULL,
    errors text[]
)
WITH (autovacuum_vacuum_scale_factor='0.05', autovacuum_vacuum_threshold='50');


--
-- Name: StravaWebhookEvent_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."StravaWebhookEvent_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: StravaWebhookEvent_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."StravaWebhookEvent_id_seq" OWNED BY public."StravaWebhookEvent".id;


--
-- Name: User_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."User_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id integer DEFAULT nextval('public."User_id_seq"'::regclass) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    email text,
    "firstName" text,
    "lastName" text,
    locale text DEFAULT 'en'::text NOT NULL,
    picture text,
    "auth0Sub" text,
    "emailVerified" boolean DEFAULT false NOT NULL,
    type public."UserType" DEFAULT 'USER'::public."UserType" NOT NULL
);


--
-- Name: UserFollow_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UserFollow_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: metabase_post_location; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.metabase_post_location AS
 WITH "Coordinates" AS (
         SELECT "Post".id,
            "Post"."startTime",
            ((((("Post"."geoJson" -> 'features'::text) -> 0) -> 'geometry'::text) -> 'coordinates'::text) -> 0) AS coordinates
           FROM public."Post"
        )
 SELECT "Coordinates".id,
    "Coordinates"."startTime",
    (("Coordinates".coordinates ->> 0))::double precision AS longitude,
    (("Coordinates".coordinates ->> 1))::double precision AS latitude
   FROM "Coordinates";


--
-- Name: metabase_post_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.metabase_post_summary AS
 SELECT "Post".id,
    "Post"."startTime",
    jsonb_array_length("Post".sprints) AS sprints,
    jsonb_array_length("Post".runs) AS runs,
    public.jsonb_array_max((((("Post"."geoJson" -> 'features'::text) -> 0) -> 'properties'::text) -> 'heartRates'::text)) AS max_heart_rate,
    public.jsonb_array_avg((((("Post"."geoJson" -> 'features'::text) -> 0) -> 'properties'::text) -> 'heartRates'::text)) AS average_heart_rate,
    "Post"."userId"
   FROM public."Post";


--
-- Name: StravaWebhookEvent id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StravaWebhookEvent" ALTER COLUMN id SET DEFAULT nextval('public."StravaWebhookEvent_id_seq"'::regclass);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: pgroll; Owner: -
--

ALTER TABLE ONLY pgroll.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (schema, name);


--
-- Name: pgroll_version pgroll_version_pkey; Type: CONSTRAINT; Schema: pgroll; Owner: -
--

ALTER TABLE ONLY pgroll.pgroll_version
    ADD CONSTRAINT pgroll_version_pkey PRIMARY KEY (version);


--
-- Name: Field Field_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Field"
    ADD CONSTRAINT "Field_pkey" PRIMARY KEY (id);


--
-- Name: Post Post_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Post"
    ADD CONSTRAINT "Post_pkey" PRIMARY KEY (id);


--
-- Name: SocialLogin SocialLogin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SocialLogin"
    ADD CONSTRAINT "SocialLogin_pkey" PRIMARY KEY (id);


--
-- Name: StravaWebhookEvent StravaWebhookEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StravaWebhookEvent"
    ADD CONSTRAINT "StravaWebhookEvent_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: history_is_linear; Type: INDEX; Schema: pgroll; Owner: -
--

CREATE UNIQUE INDEX history_is_linear ON pgroll.migrations USING btree (schema, parent);


--
-- Name: only_first_migration_without_parent; Type: INDEX; Schema: pgroll; Owner: -
--

CREATE UNIQUE INDEX only_first_migration_without_parent ON pgroll.migrations USING btree (schema) WHERE (parent IS NULL);


--
-- Name: only_one_active; Type: INDEX; Schema: pgroll; Owner: -
--

CREATE UNIQUE INDEX only_one_active ON pgroll.migrations USING btree (schema, name, done) WHERE (done = false);


--
-- Name: Post.key_type_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Post.key_type_unique" ON public."Post" USING btree (key, type);


--
-- Name: SocialLogin.platformId_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SocialLogin.platformId_unique" ON public."SocialLogin" USING btree ("platformId");


--
-- Name: User.auth0Sub_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User.auth0Sub_unique" ON public."User" USING btree ("auth0Sub");


--
-- Name: User.email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User.email_unique" ON public."User" USING btree (email);


--
-- Name: idx_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_id ON public."Post" USING btree (id);


--
-- Name: idx_post_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_key ON public."Post" USING btree (key);


--
-- Name: idx_post_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_user_id ON public."Post" USING btree ("userId");


--
-- Name: migrations migrations_schema_parent_fkey; Type: FK CONSTRAINT; Schema: pgroll; Owner: -
--

ALTER TABLE ONLY pgroll.migrations
    ADD CONSTRAINT migrations_schema_parent_fkey FOREIGN KEY (schema, parent) REFERENCES pgroll.migrations(schema, name);


--
-- Name: Post Post_fieldId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Post"
    ADD CONSTRAINT "Post_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES public."Field"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Post Post_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Post"
    ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SocialLogin SocialLogin_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SocialLogin"
    ADD CONSTRAINT "SocialLogin_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pg_roll_handle_ddl; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pg_roll_handle_ddl ON ddl_command_end
   EXECUTE FUNCTION pgroll.raw_migration();


--
-- Name: pg_roll_handle_drop; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pg_roll_handle_drop ON sql_drop
   EXECUTE FUNCTION pgroll.raw_migration();


--
-- PostgreSQL database dump complete
--
