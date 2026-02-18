## 2024-05-22 - Userscript Status Accessibility
**Learning:** In userscripts, custom status overlays (often just `div`s) are invisible to screen readers unless explicitly marked with `role="status"` and `aria-live="polite"`. This is critical because userscripts often perform background tasks (like translation) without focus change.
**Action:** Always add `role="status"` and `aria-live="polite"` to any dynamic status indicator element created in a userscript.
