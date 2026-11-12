# Supabase setup — Murali M Blogs

The GitHub Pages site is static, so Supabase provides the persistent database for blog likes, comments and unique views.

## 1. Create or open a Supabase project

In the Supabase dashboard, create a project and open **SQL Editor**.

## 2. Create the database objects

Run the complete SQL from `supabase/blog-engagement.sql`. It creates the tables, indexes, row-level security, and the four controlled RPC functions used by the website.

The comments are public and publish instantly. Direct anonymous INSERT, UPDATE and DELETE operations are not granted. Comments are submitted through a rate-limited database function. The visitor identifier column is never exposed by the public comments query.

## 3. Add browser credentials

In **Project Settings → API**, copy:
- Project URL
- Publishable key (or legacy anon public key)

Add them to `assets/js/supabase-config.js`:

```js
window.MURALI_SUPABASE_CONFIG = Object.freeze({
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY"
});
```

Only use a publishable/anon key here. Never use a `service_role`, secret, or database password in a public website.

## What gets counted

- **Views:** one unique view per article per browser profile, using a random browser ID in local storage and a database uniqueness constraint. This is a privacy-friendly browser-level count, not a verified count of real people.
- **Likes:** one active like per article per browser profile. The visitor can unlike and like again.
- **Comments:** visitor-entered name and plain-text comment, published immediately. The database limits each browser ID to 8 comments per hour with at least 15 seconds between comments.
- **Shares:** uses the device's native share dialog where available; otherwise it copies the article link. Share clicks are not presented as confirmed shares.

## Files integrated

- `blogs.html` displays likes, comments and unique views on every blog card.
- `blog-post.html` displays article likes, sharing, unique views and the live comment list/form.
- `assets/js/blog-engagement.js` contains the shared client integration.
- `assets/js/supabase-config.js` contains public connection placeholders.
- `supabase/blog-engagement.sql` contains the database schema and RLS policies.

Until the project URL and public key are set and the SQL is run, the blog pages show a setup message instead of fake counts. The blog content and existing publish workflow remain unchanged.
