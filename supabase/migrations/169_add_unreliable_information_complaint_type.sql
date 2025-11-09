-- Add 'unreliable_information' to complaint_type constraint
begin;

-- Drop any existing check constraint on complaint_type column
do $$
declare
  constraint_name text;
begin
  -- Find the constraint name for complaint_type check constraint
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.tickets'::regclass
    and contype = 'c'
    and exists (
      select 1 
      from pg_attribute 
      where attrelid = conrelid 
        and attname = 'complaint_type' 
        and attnum = any(conkey)
    );
  
  -- Drop the constraint if it exists
  if constraint_name is not null then
    execute format('alter table public.tickets drop constraint %I', constraint_name);
  end if;
end $$;

-- Add the updated check constraint with the new complaint type
alter table public.tickets
  add constraint tickets_complaint_type_check 
  check (complaint_type is null or complaint_type in ('harassment', 'misinformation', 'inappropriate_content', 'unreliable_information'));

commit;
