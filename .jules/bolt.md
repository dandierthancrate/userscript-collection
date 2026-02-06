# Bolt's Performance Journal

## 2025-05-15 - MutationObserver feedback loops in userscripts
**Learning:** Mutating the DOM (e.g., setting data attributes or injecting elements) inside a MutationObserver callback triggers the observer again. This can lead to redundant processing and even infinite loops if not carefully filtered.
**Action:** Always use `attributeFilter` or check `mutation.attributeName` to ignore script-owned attributes. Filter mutations to target only relevant nodes rather than using broad `querySelectorAll` on containers for every mutation.

## 2025-05-15 - getBoundingClientRect in Array.sort
**Learning:** Calling `getBoundingClientRect` inside an `Array.sort` comparator can cause major layout thrashing as it is called O(N log N) times.
**Action:** Cache DOM measurements in a `Map` during the sort operation to ensure each element is only measured once.
