# Palette's Journal

## 2024-05-22 - Steam Links Dropdowns Focus & Transitions
**Learning:** When animating elements from `display: none`, layout properties like `offsetHeight` may be 0, causing positioning bugs.
**Action:** Use `visibility: hidden` and `opacity: 0` instead of `display: none` for elements that need both animation and JS positioning. This maintains layout information while keeping the element hidden.

**Learning:** Dropdown menus opened by buttons should support the `Escape` key on the button itself to close the menu, not just on the menu items.
**Action:** Add an `Escape` key handler to the toggle button that checks if the menu is open and closes it, returning focus to the button.
