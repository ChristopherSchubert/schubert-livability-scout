# DB connection (for server-side scripts / seeding)

Direct `db.<ref>.supabase.co` is IPv6-only and won't resolve on most networks.
Use the **session pooler** (IPv4):

- host: `aws-1-us-west-2.pooler.supabase.com`
- port: `5432`
- user: `postgres.fitjkrmiwkdolxhitroc`
- database: `postgres`
- password: the project DB password (ROTATE the one shared in chat)
- ssl: `{ rejectUnauthorized: false }`

The app itself does NOT use this — it uses the publishable key over HTTPS via
`@supabase/supabase-js`. This pooler is only for admin/seed scripts.
