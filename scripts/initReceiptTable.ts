import { Client } from 'pg';

async function ensureTable(client: Client) {
  await client.query(`
    create table if not exists public.message_receipts (
      id uuid primary key default gen_random_uuid(),
      message_id text not null,
      user_id uuid not null,
      delivered_at timestamptz null,
      read_at timestamptz null,
      inserted_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint message_receipts_message_user_unique unique (message_id, user_id)
    );
  `);

  await client.query(`
    create index if not exists message_receipts_user_read_idx
    on public.message_receipts(user_id, read_at);
  `);

  await client.query(`
    create or replace function public.set_message_receipts_updated_at()
    returns trigger as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$ language plpgsql;
  `);

  await client.query(`
    drop trigger if exists set_message_receipts_updated_at on public.message_receipts;
  `);

  await client.query(`
    create trigger set_message_receipts_updated_at
    before update on public.message_receipts
    for each row execute function public.set_message_receipts_updated_at();
  `);
}

async function main() {
  const connectionString =
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    '';

  if (!connectionString) {
    console.error(
      'Missing SUPABASE_DB_URL (preferred) or DATABASE_URL environment variable.'
    );
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query(`create extension if not exists "pgcrypto";`);

    const { rows } = await client.query<{
      exists: boolean;
    }>(`
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'message_receipts'
      ) as exists;
    `);

    if (!rows[0]?.exists) {
      console.info('Creating message_receipts table…');
    } else {
      console.info('message_receipts table already exists. Ensuring schema is up to date…');
    }

    await ensureTable(client);
    console.info('message_receipts table is ready.');
  } catch (error) {
    console.error('Failed to initialize message_receipts table:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main();

