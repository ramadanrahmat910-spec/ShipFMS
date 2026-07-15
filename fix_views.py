import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.sql import text

new_db_uri = "postgresql://postgres:Sayang271102%3C3@db.bxmwgsvpixbkhpxbpbbx.supabase.co:5432/postgres"
new_engine = create_engine(new_db_uri)

v_ship_operational_daily = """
CREATE OR REPLACE VIEW v_ship_operational_daily AS
 WITH daily_avg AS (
         SELECT ais_tracking.ship_id,
            ((ais_tracking.base_datetime AT TIME ZONE 'UTC'::text))::date AS date,
            round(avg(ais_tracking.sog::numeric) FILTER (WHERE (ais_tracking.sog > (1)::numeric)), 1) AS avg_speed_knot
           FROM ais_tracking
          GROUP BY ais_tracking.ship_id, (((ais_tracking.base_datetime AT TIME ZONE 'UTC'::text))::date)
        ), last_pos AS (
         SELECT DISTINCT ON (ais_tracking.ship_id, (((ais_tracking.base_datetime AT TIME ZONE 'UTC'::text))::date)) ais_tracking.ship_id,
            ((ais_tracking.base_datetime AT TIME ZONE 'UTC'::text))::date AS date,
            ais_tracking.lat AS last_lat,
            ais_tracking.lon AS last_lon
           FROM ais_tracking
          ORDER BY ais_tracking.ship_id, (((ais_tracking.base_datetime AT TIME ZONE 'UTC'::text))::date), ais_tracking.base_datetime DESC
        )
 SELECT da.ship_id,
    da.date,
    da.avg_speed_knot,
    lp.last_lat,
    lp.last_lon,
    cd.distance_nm_day,
    'B35'::text AS fuel_type,
    nr.from_port,
    nr.to_port,
    nr.fuel_cons_mt_per_day,
    nr.fuel_cons_mlr
   FROM (((daily_avg da
     LEFT JOIN last_pos lp ON (((lp.ship_id = da.ship_id) AND (lp.date = da.date))))
     LEFT JOIN cii_daily cd ON (((cd.ship_id = da.ship_id) AND (cd.date = da.date))))
     LEFT JOIN noon_report nr ON (((nr.ship_id = da.ship_id) AND (nr.voyage_date = da.date))));
"""

v_ship_current = """
CREATE OR REPLACE VIEW v_ship_current AS
 SELECT s.id AS ship_id,
    s.ship_key,
    s.name AS ship_name,
    s.mmsi,
    s.dwt,
    cd.date AS last_data_date,
    cd.running_cii,
    cd.running_grade,
    cd.cii_required,
    cd.co2_emission_g_ytd,
    cd.distance_nm_ytd,
    cd.fuel_cons_mt_ytd,
    cd.transport_work_ytd,
    cd.projected_cii_eoy,
    cd.date_limit_reached,
        CASE
            WHEN (cd.running_cii IS NULL) THEN 'Belum Ada Data'::text
            WHEN (cd.running_cii <= cd.cii_required) THEN 'Memenuhi Standar IMO'::text
            ELSE 'Tidak Memenuhi Standar IMO'::text
        END AS imo_status,
        CASE
            WHEN (cd.cii_required > (0)::numeric) THEN round(((cd.running_cii::numeric / cd.cii_required::numeric) * (100)::numeric), 1)
            ELSE NULL::numeric
        END AS pct_of_required,
    cb.boundary_superior,
    cb.boundary_lower,
    cb.boundary_upper,
    cb.boundary_inferior
   FROM ((ship s
     LEFT JOIN LATERAL ( SELECT cii_daily.id,
            cii_daily.ship_id,
            cii_daily.date,
            cii_daily.year,
            cii_daily.month,
            cii_daily.distance_nm_day,
            cii_daily.fuel_cons_mt_day,
            cii_daily.co2_emission_g_day,
            cii_daily.distance_nm_ytd,
            cii_daily.fuel_cons_mt_ytd,
            cii_daily.co2_emission_g_ytd,
            cii_daily.transport_work_ytd,
            cii_daily.running_cii,
            cii_daily.cii_required,
            cii_daily.running_grade,
            cii_daily.projected_cii_eoy,
            cii_daily.days_to_limit,
            cii_daily.date_limit_reached
           FROM cii_daily
          WHERE (cii_daily.ship_id = s.id)
          ORDER BY cii_daily.date DESC
         LIMIT 1) cd ON (true))
     LEFT JOIN cii_boundaries cb ON (((cb.ship_id = s.id) AND (cb.year = (EXTRACT(year FROM COALESCE(cd.date, CURRENT_DATE)))::integer))));
"""

with new_engine.connect() as conn:
    conn.execute(text(v_ship_operational_daily))
    conn.execute(text(v_ship_current))
    conn.commit()
    print("Views fixed successfully!")
