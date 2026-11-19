-- =====================================================================
-- BLEDI FIT – Thirrja çdo orë e njoftimeve (Supabase pg_cron + pg_net)
-- 1) Database → Extensions: aktivizo "pg_cron" dhe "pg_net"
-- 2) Zëvendëso DOMAIN-IN dhe CRON_SECRET më poshtë, pastaj Run.
-- Serveri vetë kontrollon orën lokale të përdoruesit (08:00, 15:00, 19:00)
-- dhe nuk dërgon dy herë të njëjtin kujtues në të njëjtën ditë.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('bledi-fit-reminders')
where exists (select 1 from cron.job where jobname = 'bledi-fit-reminders');

select cron.schedule(
  'bledi-fit-reminders',
  '0 * * * *',   -- çdo orë, në minutën 0
  $$
  select net.http_post(
    url     := 'https://DOMAIN-I-YT.vercel.app/api/cron/reminders',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer VENDOS_CRON_SECRET_KETU'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Kontrollo ekzekutimet:
-- select * from cron.job_run_details order by start_time desc limit 10;
-- select * from net._http_response order by created desc limit 10;
