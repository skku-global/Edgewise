-- 1) How each trade/plan was logged.
alter table public.trades add column if not exists log_method text;
alter table public.journal_entries add column if not exists log_method text;

-- 2) A closed journal entry can never be changed again.
create or replace function public.lock_closed_entries() returns trigger as $$
begin
  if old.status = 'closed' then
    raise exception 'This trade is closed and can no longer be edited.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists lock_closed_entries on public.journal_entries;
create trigger lock_closed_entries
  before update on public.journal_entries
  for each row execute function public.lock_closed_entries();
