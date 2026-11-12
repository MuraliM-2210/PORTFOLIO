/* Murali M — browser-local blog engagement. No backend or third-party SDK. */
(() => {
  "use strict";
  const STORAGE_KEY = "murali-blog-engagement-v1";
  let memoryFallback = { posts: {} };

  const number = value => new Intl.NumberFormat().format(Number(value || 0));
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
  const validSlug = slug => /^[a-z0-9][a-z0-9-]{0,79}$/.test(String(slug || ""));
  const readStore = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"posts":{}}');
      if (parsed && parsed.posts && typeof parsed.posts === "object") return parsed;
    } catch (error) {
      console.warn("Blog engagement storage is unavailable; using temporary page memory.", error);
    }
    return memoryFallback;
  };
  const writeStore = store => {
    memoryFallback = store;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (error) {
      console.warn("Blog engagement could not be saved to this browser.", error);
      return false;
    }
  };
  const getPost = (store, slug) => {
    if (!store.posts[slug]) store.posts[slug] = { liked: false, viewed: false, comments: [] };
    const post = store.posts[slug];
    if (typeof post.liked !== "boolean") post.liked = false;
    if (typeof post.viewed !== "boolean") post.viewed = false;
    if (!Array.isArray(post.comments)) post.comments = [];
    return post;
  };
  const getCounts = post => ({
    like_count: post.liked ? 1 : 0,
    view_count: post.viewed ? 1 : 0,
    comment_count: post.comments.length,
    viewer_liked: post.liked
  });
  const showStorageNote = () => "Saved only in this browser on this device. These counts and comments are not shared with other visitors.";
  const announce = message => {
    const status = document.getElementById("engagementStatus");
    if (status) status.textContent = message;
  };

  async function sharePost(post) {
    if (!post?.slug) return;
    const url = new URL("blog-post.html?slug=" + encodeURIComponent(post.slug), window.location.href).toString();
    const payload = {
      title: post.title || "Murali M — Blog",
      text: post.excerpt || post.title || "Read this story",
      url
    };
    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        window.alert("Article link copied. You can now share it anywhere.");
      } else {
        window.prompt("Copy this article link:", url);
      }
    } catch (_) {
      window.prompt("Copy this article link:", url);
    }
  }

  async function loadCardStats(posts) {
    const store = readStore();
    document.querySelectorAll("[data-engagement-slug]").forEach(card => {
      const slug = card.dataset.engagementSlug;
      if (!validSlug(slug)) return;
      const post = getPost(store, slug);
      const counts = getCounts(post);
      const like = card.querySelector("[data-like-count]");
      const views = card.querySelector("[data-view-count]");
      const comments = card.querySelector("[data-comment-count]");
      if (like) like.textContent = number(counts.like_count);
      if (views) views.textContent = number(counts.view_count);
      if (comments) comments.textContent = number(counts.comment_count);
      card.title = showStorageNote();
      card.querySelectorAll("span[title],button[title]").forEach(el => {
        if (el.matches("[title='Likes'],[title='Unique views'],[title='Comments']")) el.title += " on this device";
      });
    });
    return posts?.length || 0;
  }

  function mountReader(slug, title) {
    const likeButton = document.getElementById("readerLikeButton");
    const shareButton = document.getElementById("readerShareButton");
    const likeCount = document.getElementById("readerLikeCount");
    const viewCount = document.getElementById("readerViewCount");
    const commentCount = document.getElementById("commentCount");
    const commentsList = document.getElementById("commentsList");
    const form = document.getElementById("commentForm");
    const formStatus = document.getElementById("commentFormStatus");

    if (!validSlug(slug)) {
      announce("This article has an invalid URL slug.");
      if (likeButton) likeButton.disabled = true;
      return;
    }

    const state = readStore();
    const article = getPost(state, slug);
    if (!article.viewed) {
      article.viewed = true;
      writeStore(state);
    }

    const renderStats = () => {
      const counts = getCounts(article);
      if (likeCount) likeCount.textContent = number(counts.like_count);
      if (viewCount) viewCount.textContent = number(counts.view_count);
      if (commentCount) commentCount.textContent = number(counts.comment_count) + (counts.comment_count === 1 ? " comment" : " comments");
      if (likeButton) {
        likeButton.disabled = false;
        likeButton.setAttribute("aria-pressed", article.liked ? "true" : "false");
        const heart = likeButton.querySelector("span");
        if (heart) heart.textContent = article.liked ? "♥" : "♡";
      }
    };

    const renderComments = () => {
      if (!commentsList) return;
      const recent = article.comments.slice(-100).reverse();
      commentsList.innerHTML = recent.length ? recent.map(comment => {
        const date = new Date(comment.createdAt);
        const formatted = Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        return '<article class="comment-item"><header><strong>' + escapeHtml(comment.name) + '</strong><time datetime="' + escapeHtml(comment.createdAt) + '">' + escapeHtml(formatted) + '</time></header><p>' + escapeHtml(comment.body).replace(/\r?\n/g, "<br>") + '</p></article>';
      }).join("") : '<p class="comments-empty">No comments on this device yet. Be the first to leave a thought.</p>';
      renderStats();
    };

    if (shareButton) shareButton.addEventListener("click", () => sharePost({ slug, title }));
    if (likeButton) {
      likeButton.addEventListener("click", () => {
        article.liked = !article.liked;
        if (!writeStore(state)) {
          article.liked = !article.liked;
          announce("Browser storage is full or unavailable. Your like could not be saved.");
          return;
        }
        renderStats();
        announce(article.liked ? "Liked on this device." : "Like removed on this device.");
      });
    }

    if (form) form.addEventListener("submit", event => {
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
      const recentHour = article.comments.filter(item => Date.now() - new Date(item.createdAt).getTime() < 3600000);
      if (recentHour.length >= 8) {
        if (formStatus) formStatus.textContent = "This browser has reached the local comment limit for this hour.";
        return;
      }
      const submit = form.querySelector("button[type=submit]");
      if (submit) submit.disabled = true;
      const comment = { name, body, createdAt: new Date().toISOString() };
      article.comments.push(comment);
      if (article.comments.length > 100) article.comments.splice(0, article.comments.length - 100);
      if (!writeStore(state)) {
        article.comments.pop();
        if (formStatus) {
          formStatus.textContent = "Browser storage is full or unavailable. Your comment could not be saved.";
          formStatus.classList.add("comment-form-status-error");
        }
        if (submit) submit.disabled = false;
        return;
      }
      document.getElementById("commentBody").value = "";
      if (formStatus) {
        formStatus.classList.remove("comment-form-status-error");
        formStatus.textContent = "Comment saved on this device only. It is not visible to other visitors.";
      }
      renderComments();
      if (submit) submit.disabled = false;
    });

    renderStats();
    renderComments();
    announce(showStorageNote() + " Share uses your device's built-in share sheet or copies the article link.");
    if (formStatus) formStatus.textContent = "Comments are saved only in this browser and are not sent to a server.";
  }

  window.MuraliBlogEngagement = Object.freeze({ loadCardStats, mountReader, sharePost });
})();
