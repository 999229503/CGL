-- ObraControl: banco privado para UMA conta de acesso.
-- Execute este SQL no SQL Editor do seu projeto Supabase.

create table if not exists public.obracontrol_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.obracontrol_data enable row level security;

revoke all on table public.obracontrol_data from anon;
revoke all on table public.obracontrol_data from authenticated;
grant select, insert, update on table public.obracontrol_data to authenticated;

drop policy if exists "private select own data" on public.obracontrol_data;
drop policy if exists "private insert own data" on public.obracontrol_data;
drop policy if exists "private update own data" on public.obracontrol_data;

create policy "private select own data"
on public.obracontrol_data for select
to authenticated
using (auth.uid() = user_id);

create policy "private insert own data"
on public.obracontrol_data for insert
to authenticated
with check (auth.uid() = user_id);

create policy "private update own data"
on public.obracontrol_data for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- IMPORTANTE:
-- No painel do Supabase, Authentication > Providers > Email:
-- desative "Allow new users to sign up".
-- Assim o aplicativo não terá cadastro público e somente a conta que você criar
-- no painel poderá entrar.

-- Fotos do CGL ficam no Storage, fora do JSON principal do banco.
-- O bucket é PRIVADO: somente o usuário autenticado dono do arquivo pode acessar.
insert into storage.buckets (id, name, public)
values ('cgl-fotos', 'cgl-fotos', false)
on conflict (id) do update set public = false;

drop policy if exists "CGL fotos select own" on storage.objects;
drop policy if exists "CGL fotos insert own" on storage.objects;
drop policy if exists "CGL fotos update own" on storage.objects;
drop policy if exists "CGL fotos delete own" on storage.objects;

create policy "CGL fotos select own"
on storage.objects for select
to authenticated
using (bucket_id = 'cgl-fotos' and auth.uid() = owner_id);

create policy "CGL fotos insert own"
on storage.objects for insert
to authenticated
with check (bucket_id = 'cgl-fotos' and auth.uid() = owner_id);

create policy "CGL fotos update own"
on storage.objects for update
to authenticated
using (bucket_id = 'cgl-fotos' and auth.uid() = owner_id)
with check (bucket_id = 'cgl-fotos' and auth.uid() = owner_id);

create policy "CGL fotos delete own"
on storage.objects for delete
to authenticated
using (bucket_id = 'cgl-fotos' and auth.uid() = owner_id);
