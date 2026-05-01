-- Estate Finance Tracker Database Schema

-- Custom profiles table mapped to auth.users
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;

-- Profiles RLS Policies
create policy "Profiles are viewable by all authenticated users"
  on public.profiles for select to authenticated using (true);


-- Ledger table
create table public.ledger (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  amount numeric not null,
  type text not null check (type in ('income', 'expense')),
  category text,
  description text,
  raw_text text,
  transfer_to uuid references public.profiles(id),
  transaction_date date not null default current_date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.ledger enable row level security;

-- Ledger RLS Policies
-- Everyone authenticated can read the total ledger
create policy "Ledger is viewable by all authenticated users" 
  on public.ledger for select to authenticated using (true);
  
-- Users can only insert their own entries
create policy "Users can insert their own ledger entries" 
  on public.ledger for insert to authenticated with check (auth.uid() = user_id);

-- Users can only update their own entries
create policy "Users can update their own ledger entries" 
  on public.ledger for update to authenticated using (auth.uid() = user_id);

-- Users can only delete their own entries
create policy "Users can delete their own ledger entries" 
  on public.ledger for delete to authenticated using (auth.uid() = user_id);

-- Comments table
create table public.comments (
  id uuid default gen_random_uuid() primary key,
  ledger_id uuid references public.ledger(id) on delete cascade not null,
  user_id uuid references public.profiles(id) not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.comments enable row level security;

-- Comments RLS Policies
-- Everyone authenticated can read comments
create policy "Comments are viewable by all authenticated users" 
  on public.comments for select to authenticated using (true);

-- Users can insert their own comments
create policy "Users can insert their own comments" 
  on public.comments for insert to authenticated with check (auth.uid() = user_id);
  
-- Users can delete their own comments
create policy "Users can delete their own comments" 
  on public.comments for delete to authenticated using (auth.uid() = user_id);

-- Function to handle new user signups and mirror to profiles table
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(split_part(new.email, '@', 1), '.', 1)));
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Categories table (run this in the Supabase SQL editor)
-- ============================================================
create table public.categories (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.categories enable row level security;

-- Anyone authenticated can read categories
create policy "Categories are viewable by all authenticated users"
  on public.categories for select to authenticated using (true);

-- Anyone authenticated can insert new categories (for AI-created ones)
create policy "Authenticated users can insert categories"
  on public.categories for insert to authenticated with check (true);

-- Seed the initial categories
insert into public.categories (name) values
  ('Funeral'),
  ('Legal'),
  ('Utilities'),
  ('Maintenance'),
  ('Sale'),
  ('Bank'),
  ('Travel'),
  ('Staff Salary'),
  ('Dad Biz payments'),
  ('Mom payment'),
  ('Internal Transfer');

-- Link ledger.category to the categories table
alter table public.ledger
  add constraint fk_ledger_category
  foreign key (category) references public.categories(name);
