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
