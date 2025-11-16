begin;

create or replace function public.resolve_post_author_id(p_post_id bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  post_record jsonb;
  owner_candidates text[] := array[
    'author_id','user_id','owner_id','profile_id','profileid','creator_id',
    'creator_uuid','created_by','created_by_id','created_by_uuid',
    'member_id','account_id','writer_id','publisher_id','poster_id',
    'user_uuid','author_uuid','user_uid','author_uid',
    'authorId','userId','ownerId','profileId','creatorId','createdBy',
    'createdById','createdByUuid','memberId','accountId','writerId',
    'publisherId','posterId','userUuid','authorUuid','userUid','authorUid'
  ];
  candidate text;
  resolved uuid;
begin
  select to_jsonb(p)
    into post_record
    from public.posts p
    where p.id = p_post_id
    limit 1;

  if post_record is null then
    return null;
  end if;

  foreach candidate in array owner_candidates loop
    begin
      resolved := nullif(post_record->>candidate, '')::uuid;
    exception
      when others then
        resolved := null;
    end;
    exit when resolved is not null;
  end loop;

  if resolved is null then
    for candidate in
      select key from jsonb_object_keys(post_record) as t(key)
    loop
      exit when resolved is not null;
      if candidate ~* '(author|user|owner|creator|profile)' then
        begin
          resolved := nullif(post_record->>candidate, '')::uuid;
        exception
          when others then
            resolved := null;
        end;
      end if;
    end loop;
  end if;

  return resolved;
exception
  when others then
    raise notice 'Error resolving post author: %', SQLERRM;
    return null;
end;
$$;

commit;
