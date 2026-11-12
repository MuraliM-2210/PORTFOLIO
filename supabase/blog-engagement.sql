-- Murali M portfolio: public blog engagement schema
-- Run this entire file once in Supabase SQL Editor for your project.
-- Public visitors can read comments and call only the controlled RPC functions.
-- Direct table writes and private visitor identifiers are not exposed.

create table if not exists public.blog_post_engagement (
  post_slug text primary key check (post_slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  view_count bigint not null default 0 check (view_count >= 0),
  like_count bigint not null default 0 check (like_count >= 0),
  comment_count bigint not null default 0 check (comment_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.blog_post_views (
  post_slug text not null references public.blog_post_engagement(post_slug) on delete cascade,
  visitor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_slug, visitor_id)
);

create table if not exists public.blog_post_likes (
  post_slug text not null references public.blog_post_engagement(post_slug) on delete cascade,
  visitor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_slug, visitor_id)
);

create table if not exists public.blog_comments (
  id uuid primary key default gen_random_uuid(),
  post_slug text not null references public.blog_post_engagement(post_slug) on delete cascade,
  visitor_id uuid not null,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  body text not null check (char_length(btrim(body)) between 2 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists blog_comments_post_created_idx
  on public.blog_comments (post_slug, created_at desc);
create index if not exists blog_comments_visitor_created_idx
  on public.blog_comments (visitor_id, created_at desc);

alter table public.blog_post_engagement enable row level security;
alter table public.blog_post_views enable row level security;
alter table public.blog_post_likes enable row level security;
alter table public.blog_comments enable row level security;

drop policy if exists "Public can read blog comments" on public.blog_comments;
create policy "Public can read blog comments"
  on public.blog_comments for select to anon, authenticated using (true);

revoke all on public.blog_post_engagement from anon, authenticated;
revoke all on public.blog_post_views from anon, authenticated;
revoke all on public.blog_post_likes from anon, authenticated;
revoke all on public.blog_comments from anon, authenticated;
grant select (id, post_slug, name, body, created_at)
  on public.blog_comments to anon, authenticated;

create or replace function public.get_blog_engagement(
  p_slugs text[],
  p_visitor_id uuid default null
)
returns table (
  post_slug text,
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  viewer_liked boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select requested.slug,
         coalesce(stats.view_count, 0),
         coalesce(stats.like_count, 0),
         coalesce(stats.comment_count, 0),
         case when p_visitor_id is null then false
              else exists (
                select 1 from public.blog_post_likes likes
                where likes.post_slug = requested.slug
                  and likes.visitor_id = p_visitor_id
              )
         end
  from (
    select distinct unnest(coalesce(p_slugs, array[]::text[])) as slug
  ) requested
  left join public.blog_post_engagement stats
    on stats.post_slug = requested.slug
  where requested.slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'
  limit 100;
$$;

create or replace function public.record_blog_view(
  p_slug text,
  p_visitor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_rows integer := 0;
  result_row public.blog_post_engagement%rowtype;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$' or p_visitor_id is null then
    raise exception using errcode = '22023', message = 'Invalid article or visitor identifier.';
  end if;

  insert into public.blog_post_engagement (post_slug)
  values (p_slug)
  on conflict (post_slug) do nothing;

  insert into public.blog_post_views (post_slug, visitor_id)
  values (p_slug, p_visitor_id)
  on conflict (post_slug, visitor_id) do nothing;

  get diagnostics inserted_rows = row_count;
  if inserted_rows > 0 then
    update public.blog_post_engagement
      set view_count = view_count + 1, updated_at = now()
      where post_slug = p_slug;
  end if;

  select * into result_row
    from public.blog_post_engagement where post_slug = p_slug;

  return jsonb_build_object(
    'post_slug', result_row.post_slug,
    'view_count', result_row.view_count,
    'like_count', result_row.like_count,
    'comment_count', result_row.comment_count,
    'viewer_liked', exists (
      select 1 from public.blog_post_likes
      where post_slug = p_slug and visitor_id = p_visitor_id
    )
  );
end;
$$;

create or replace function public.toggle_blog_like(
  p_slug text,
  p_visitor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_liked boolean;
  total_likes bigint;
  stats_row public.blog_post_engagement%rowtype;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$' or p_visitor_id is null then
    raise exception using errcode = '22023', message = 'Invalid article or visitor identifier.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_slug), hashtext(p_visitor_id::text));

  insert into public.blog_post_engagement (post_slug)
  values (p_slug)
  on conflict (post_slug) do nothing;

  if exists (
    select 1 from public.blog_post_likes
    where post_slug = p_slug and visitor_id = p_visitor_id
  ) then
    delete from public.blog_post_likes
      where post_slug = p_slug and visitor_id = p_visitor_id;
    is_liked := false;
  else
    insert into public.blog_post_likes (post_slug, visitor_id)
      values (p_slug, p_visitor_id)
      on conflict (post_slug, visitor_id) do nothing;
    is_liked := true;
  end if;

  select count(*) into total_likes
    from public.blog_post_likes where post_slug = p_slug;

  update public.blog_post_engagement
    set like_count = total_likes, updated_at = now()
    where post_slug = p_slug;

  return jsonb_build_object(
    'post_slug', p_slug,
    'like_count', total_likes,
    'viewer_liked', is_liked
  );
end;
$$;

create or replace function public.post_blog_comment(
  p_slug text,
  p_visitor_id uuid,
  p_name text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recent_count integer;
  last_comment timestamptz;
  inserted_comment public.blog_comments%rowtype;
  total_comments bigint;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$'
     or p_visitor_id is null
     or p_name is null or char_length(btrim(p_name)) not between 2 and 60
     or p_body is null or char_length(btrim(p_body)) not between 2 and 2000 then
    raise exception using errcode = '22023', message = 'Please enter a valid name and comment.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_visitor_id::text));

  select count(*), max(created_at)
    into recent_count, last_comment
    from public.blog_comments
    where visitor_id = p_visitor_id
      and created_at > now() - interval '1 hour';

  if recent_count >= 8 then
    raise exception using errcode = 'P0001', message = 'You have reached the comment limit of 8 per hour. Please try again later.';
  end if;
  if last_comment is not null and last_comment > now() - interval '15 seconds' then
    raise exception using errcode = 'P0001', message = 'Please wait 15 seconds before posting another comment.';
  end if;

  insert into public.blog_post_engagement (post_slug)
    values (p_slug) on conflict (post_slug) do nothing;

  insert into public.blog_comments (post_slug, visitor_id, name, body)
    values (p_slug, p_visitor_id, btrim(p_name), btrim(p_body))
    returning * into inserted_comment;

  select count(*) into total_comments
    from public.blog_comments where post_slug = p_slug;

  update public.blog_post_engagement
    set comment_count = total_comments, updated_at = now()
    where post_slug = p_slug;

  return jsonb_build_object(
    'id', inserted_comment.id,
    'post_slug', inserted_comment.post_slug,
    'name', inserted_comment.name,
    'body', inserted_comment.body,
    'created_at', inserted_comment.created_at
  );
end;
$$;

revoke all on function public.get_blog_engagement(text[], uuid) from public;
revoke all on function public.record_blog_view(text, uuid) from public;
revoke all on function public.toggle_blog_like(text, uuid) from public;
revoke all on function public.post_blog_comment(text, uuid, text, text) from public;

grant execute on function public.get_blog_engagement(text[], uuid) to anon, authenticated;
grant execute on function public.record_blog_view(text, uuid) to anon, authenticated;
grant execute on function public.toggle_blog_like(text, uuid) to anon, authenticated;
grant execute on function public.post_blog_comment(text, uuid, text, text) to anon, authenticated;
