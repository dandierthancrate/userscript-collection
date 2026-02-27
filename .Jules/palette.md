## 2024-02-25 - Userscript Hotkey Safety
**Learning:** Global hotkey listeners in userscripts often trigger unexpectedly when users are typing in search bars or comments, causing severe frustration.
**Action:** Always include a guard clause checking `e.target` against inputs, textareas, and contentEditable elements at the start of any document-level keydown listener.
