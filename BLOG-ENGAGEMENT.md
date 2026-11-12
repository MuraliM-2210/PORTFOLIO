# Blog engagement — no external services

The blog engagement controls use browser-native JavaScript and the visitor's localStorage. There is no Supabase, Firebase, third-party analytics SDK, or remote comments API.

## What works

- Like/unlike state is saved on the current browser.
- A post is counted as viewed once in the current browser.
- Comments are saved and displayed on the current browser.
- Sharing uses the browser/device native share sheet when supported, otherwise the article link is copied or shown for manual copying.
- The data remains after reloads in the same browser profile, until browser data is cleared.

## Important limitation

GitHub Pages serves static files and does not provide a shared database or server-side write endpoint. Therefore likes, comments, and unique view counts are local to each browser/device. They are not visible to other visitors and must not be interpreted as public/global totals.

To provide shared engagement across all readers without a third-party backend, the site would need a backend hosted and maintained by the site owner. No external service has been added here.

Local engagement data is stored under the browser storage key `murali-blog-engagement-v1`.
