create extension if not exists pgmq;
select pgmq.create('transactional_emails');
grant usage on schema pgmq to postgres, service_role;
grant all on all tables in schema pgmq to postgres, service_role;