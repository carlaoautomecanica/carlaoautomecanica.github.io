-- Rode este arquivo inteiro no Supabase: menu "SQL Editor" > "New query" > colar > "Run".

create table if not exists public.servicos (
  id          uuid primary key default gen_random_uuid(),
  placa       text not null,
  carro       text,
  cliente     text,
  telefone    text,
  km          text,
  itens       jsonb not null default '[]',
  observacoes text,
  status      text not null default 'orcamento',
  pago        numeric not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists servicos_placa_idx on public.servicos (placa);

-- Quem pode usar o sistema: só os e-mails desta lista.
create table if not exists public.equipe (
  email text primary key
);

alter table public.servicos enable row level security;
alter table public.equipe enable row level security;

drop policy if exists "ve o proprio email" on public.equipe;
create policy "ve o proprio email" on public.equipe
  for select to authenticated
  using (email = auth.jwt() ->> 'email');

drop policy if exists "equipe acessa servicos" on public.servicos;
create policy "equipe acessa servicos" on public.servicos
  for all to authenticated
  using (exists (select 1 from public.equipe e where e.email = auth.jwt() ->> 'email'))
  with check (exists (select 1 from public.equipe e where e.email = auth.jwt() ->> 'email'));

-- >>> TROQUE pelos e-mails de quem vai usar (seu sogro, você, família) <<<
insert into public.equipe (email) values
  ('email-1@exemplo.com'),
  ('email-2@exemplo.com')
on conflict do nothing;
