alter table public.transactions
  add column if not exists merchant_name text,
  add column if not exists ticket_date date,
  add column if not exists ticket_fingerprint text,
  add column if not exists source_file_name text;

create index if not exists idx_transactions_ticket_fingerprint
on public.transactions (ticket_fingerprint)
where ticket_fingerprint is not null;

create index if not exists idx_transactions_duplicate_lookup
on public.transactions (type, occurred_on, amount, merchant_name);
