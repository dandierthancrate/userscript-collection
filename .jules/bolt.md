# Bolt's Performance Journal

## 2025-05-15 - MutationObserver feedback loops in userscripts
**Learning:** Mutating the DOM (e.g., setting data attributes or injecting elements) inside a MutationObserver callback triggers the observer again. This can lead to redundant processing and even infinite loops if not carefully filtered.
**Action:** Always use `attributeFilter` or check `mutation.attributeName` to ignore script-owned attributes. Filter mutations to target only relevant nodes rather than using broad `querySelectorAll` on containers for every mutation.

## 2025-05-15 - getBoundingClientRect in Array.sort
**Learning:** Calling `getBoundingClientRect` inside an `Array.sort` comparator can cause major layout thrashing as it is called O(N log N) times.
**Action:** Cache DOM measurements in a `Map` during the sort operation to ensure each element is only measured once.

## 2025-05-15 - Regex and Hashing inside MutationObserver hot paths
**Learning:** Complex regex (e.g., unicode property escapes) and string hashing inside functions called by MutationObservers (O(N) on mutations) can cause significant CPU overhead.
**Action:** Memoize expensive string operations using `Map`. Implement a simple eviction strategy (e.g., clear on size limit) to prevent memory leaks in long-running single-page applications.

## 2025-05-15 - Synchronous GM_setValue Performance Impact
**Learning:** `GM_setValue` is synchronous and can block the main thread for tens of milliseconds when writing large objects (e.g., >1MB cache). Calling it frequently (e.g., after every small batch of work) causes noticeable UI jank.
**Action:** Throttle `GM_setValue` calls (e.g., max once per 10s) and optimize data structures to minimize serialization overhead. Use iterative deletion for `Map` trimming instead of `Array.from` to avoid memory spikes.

## 2025-05-16 - CSS Animation for Element Detection
**Learning:** Using a global `MutationObserver` on `document.body` with `subtree: true` to detect when a specific element appears is extremely inefficient (O(N) on every DOM change).
**Action:** Use CSS animations (`animationstart` event) on the target selector to detect element insertion with zero overhead during unrelated DOM mutations. Only use `MutationObserver` for specific, scoped updates once the element is found.

## 2025-05-17 - Global MutationObserver vs Polling for URL Detection
**Learning:** Using a global `MutationObserver` on `document.body` with `subtree: true` to detect URL changes in SPAs is extremely inefficient as it fires on every DOM mutation. History API patching is complex due to userscript sandbox isolation (`window` vs `unsafeWindow`) and race conditions with SPA rendering.
**Action:** Replace global `MutationObserver` URL checks with a lightweight `setInterval` polling mechanism (e.g., 500ms). This is robust, handles SPA lifecycles gracefully, avoids sandbox complexity, and significantly reduces CPU overhead.
