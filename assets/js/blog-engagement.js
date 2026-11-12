/* Murali M — Supabase blog engagement */
(() => {
  "use strict";
  const CONFIG = window.MURALI_SUPABASE_CONFIG || {};
  const PLACEHOLDER = /YOUR_PROJECT|YOUR_SUPABASE|REPLACE_ME/i;
  let client = null;
  const number = value => new Intl.NumberFormat().format(Number(value || 0));
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
  const validSlug = slug => /^[a-z0-9][a-z0-9-]{0,79}$/.test(String(slug || ""));
  function getClient() {
    if (client) return client;
    const url = String(CONFIG.url || "").trim();
    const key = String(CONFIG.anonKey || "").trim();
    if (!window.supabase?.createClient || !url.startsWith("https://") || !key || PLACEHOLDER.test(url + key)) return null;
    try {
      client = window.supabase.createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      return client;
    } catch (error) {
      console.error("Supabase client could not be initialized.", error);
      return null;
    }
  }
  function visitorId() {
    const storageKey = "murali_blog_visitor_v1";
    try {
      let id = localStorage.getItem(storageKey);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(storageKey, id);
      }
      return id;
    } catch (_) {
      if (!visitorId.temporary) visitorId.temporary = crypto.randomUUID();
      return visitorId.temporary;
    }
  }
  function configuredMessage() {
    return "Blog engagement is ready in the code, but Supabase is not connected yet. Add the Project URL and anon/publishable key in assets/js/supabase-config.js, then run the SQL in supabase/blog-engagement.sql.";
  }
  async function getStats(slugs) {
    const db = getClient();
    const clean = [...new Set((slugs || []).filter(validSlug))].slice(0, 100);
    if (!db || !clean.length) return { configured: !!db, stats: new Map() };
    const { data, error } = await db.rpc("get_blog_engagement", {
      p_slugs: clean,
      p_visitor_id: visitorId()
    });
    if (error) throw error;
    const map = new Map();
    (data || []).forEach(item => map.set(item.post_slug, item));
    return { configured: true, stats: map };
  }
  async function loadCardStats(posts) {
    const cards = [...document.querySelectorAll("[data-engagement-slug]")];
    const { configured, stats } = await getStats((posts || []).map(post => post.slug));
    cards.forEach(card => {
      const stat = stats.get(card.dataset.engagementSlug);
      const like = card.querySelector("[data-like-count]");
      const views = card.querySelector("[data-view-count]");
      const comments = card.querySelector("[data-comment-count]");
      if (!configured) {
        [like, views, comments].forEach(el => { if (el) el.textContent = "—"; });
        card.title = "Connect Supabase to show live engagement";
        return;
      }
      if (like) like.textContent = number(stat?.like_count);
      if (views) views.textContent = number(stat?.view_count);
      if (comments) comments.textContent = number(stat?.comment_count);
    });
  }
  async function sharePost(post) {
    if (!post?.slug) return;
    const url = new URL("blog-post.html?slug=" + encodeURIComponent(post.slug), window.location.href).toString();
    const payload = { title: post.title || "Murali M — Blog", text: post.excerpt || post.title || "Read this story", url };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      window.alert("Article link copied. You can now share it anywhere.");
    } catch (_) {
      window.prompt("Copy this article link:", url);
    }
  }
  async function mountReader(slug, title) {
    const db = getClient();
    const status = document.getElementById("engagementStatus");
    const likeButton = document.getElementById("readerLikeButton");
    const shareButton = document.getElementById("readerShareButton");
    const likeCount = document.getElementById("readerLikeCount");
    const viewCount = document.getElementById("readerViewCount");
    const commentCount = document.getElementById("commentCount");
    const commentsList = document.getElementById("commentsList");
    const form = document.getElementById("commentForm");
    const formStatus = document.getElementById("commentFormStatus");
    if (!validSlug(slug)) {
      if (status) status.textContent = "This article has an invalid URL slug.";
      if (likeButton) likeButton.disabled = true;
      return;
    }
    if (shareButton) shareButton.addEventListener("click", () => sharePost({ slug, title }));
    if (!db) {
      if (status) status.textContent = configuredMessage();
      if (likeButton) likeButton.disabled = true;
      if (commentsList) commentsList.innerHTML = '<p class="comments-empty">Comments will appear here after Supabase is connected.</p>';
      if (commentCount) commentCount.textContent = "0 comments";
      if (form) {
        form.querySelectorAll("input,textarea,button").forEach(el => { el.disabled = true; });
        if (formStatus) formStatus.textContent = "Commenting is temporarily unavailable until Supabase is connected.";
      }
      return;
    }
    const renderStats = stat => {
      if (likeCount) likeCount.textContent = number(stat?.like_count);
      if (viewCount) viewCount.textContent = number(stat?.view_count);
      if (commentCount) commentCount.textContent = number(stat?.comment_count) + " comments";
      if (likeButton) {
        likeButton.disabled = false;
        likeButton.setAttribute("aria-pressed", stat?.viewer_liked ? "true" : "false");
        likeButton.querySelector("span").textContent = stat?.viewer_liked ? "♥" : "♡";
      }
    };
    async function refreshStats() {
      const result = await getStats([slug]);
      renderStats(result.stats.get(slug));
    }
    async function refreshComments() {
      if (!commentsList) return;
      const { data, error } = await db.from("blog_comments")
        .select("id,name,body,created_at")
        .eq("post_slug", slug)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (commentCount) commentCount.textContent = number(data?.length) + (data?.length === 1 ? " comment" : " comments");
      commentsList.innerHTML = data?.length ? data.map(comment => {
        const date = new Date(comment.created_at);
        const formatted = Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        return '<article class="comment-item"><header><strong>' + escapeHtml(comment.name) + '</strong><time datetime="' + escapeHtml(comment.created_at) + '">' + escapeHtml(formatted) + '</time></header><p>' + escapeHtml(comment.body).replace(/\r?\n/g, "<br>") + '</p></article>';
      }).join("") : '<p class="comments-empty">No comments yet. Be the first to share a thought.</p>';
    }
    try {
      const { data: viewData, error: viewError } = await db.rpc("record_blog_view", {
        p_slug: slug, p_visitor_id: visitorId()
      });
      if (viewError) throw viewError;
      renderStats(viewData);
      await refreshComments();
      if (status) status.textContent = "Your reading activity is counted once per article in this browser. Comments are published immediately.";
    } catch (error) {
      console.error("Could not load blog engagement.", error);
      if (status) status.textContent = "Engagement could not be loaded. Check the Supabase setup and SQL policies.";
      if (commentsList) commentsList.innerHTML = '<p class="comments-empty">Comments are temporarily unavailable.</p>';
    }
    if (likeButton) likeButton.addEventListener("click", async () => {
      likeButton.disabled = true;
      try {
        const { data, error } = await db.rpc("toggle_blog_like", {
          p_slug: slug, p_visitor_id: visitorId()
        });
        if (error) throw error;
        renderStats(data);
      } catch (error) {
        console.error("Like action failed.", error);
        if (status) status.textContent = "Your like could not be saved. Please try again.";
      } finally {
        likeButton.disabled = false;
      }
    });
    if (form) form.addEventListener("submit", async event => {
      event.preventDefault();
      const name = document.getElementById("commentName").value.trim();
      const body = document.getElementById("commentBody").value.trim();
      if (name.length < 2 || name.length > 60 || body.length < 2 || body.length > 2000) {
        if (formStatus) {
          formStatus.textContent = "Please enter a name (2–60 characters) and comment (2–2,000 characters).";
          formStatus.classList.add("comment-form-status-error");
        }
        return;
      }
      const submit = form.querySelector("button[type=submit]");
      submit.disabled = true;
      if (formStatus) {
        formStatus.classList.remove("comment-form-status-error");
        formStatus.textContent = "Publishing your comment…";
      }
      try {
        const { error } = await db.rpc("post_blog_comment", {
          p_slug: slug, p_visitor_id: visitorId(), p_name: name, p_body: body
        });
        if (error) throw error;
        document.getElementById("commentBody").value = "";
        if (formStatus) formStatus.textContent = "Your comment is now published. Thank you for joining the conversation.";
        await refreshComments();
        await refreshStats();
      } catch (error) {
        console.error("Comment submission failed.", error);
        if (formStatus) {
          formStatus.textContent = /rate|wait|hour/i.test(error.message || "") ? error.message : "Your comment could not be published. Please try again in a moment.";
          formStatus.classList.add("comment-form-status-error");
        }
      } finally {
        submit.disabled = false;
      }
    });
  }
  window.MuraliBlogEngagement = Object.freeze({ loadCardStats, mountReader, sharePost, configured: () => !!getClient() });
})();
