# Sentinel Security Journal 🛡️

## 2025-05-14 - [Insecure DOM Injection Pattern]
**Vulnerability:** Use of `innerHTML` to inject data fetched from external, untrusted APIs (LRCLIB, Arweave, steamcmd).
**Learning:** Multiple userscripts in this repository followed a pattern of fetching data from "community" or "open" APIs and directly injecting it into the host site's DOM using `innerHTML`. This exposes the host site to XSS if the external API is compromised or contains malicious user-submitted content.
**Prevention:** Always use `textContent` for data fetched from external sources. If HTML formatting is required, use `createElement` and `textContent` to build the DOM structure safely, or use a robust sanitizer.

## 2025-05-14 - [Insecure URL Handling in Userscripts]
**Vulnerability:** Userscripts processing URLs from DOM elements (like `href` attributes) and passing them to `GM_openInTab` or other sinks without protocol validation can execute malicious `javascript:` URIs.
**Learning:** `new URL('javascript:alert(1)')` is valid and returns a URL object with `javascript:` protocol. Simply parsing a URL does not make it safe.
**Prevention:** Always validate `url.protocol` against an allowlist (e.g., `['http:', 'https:']`) before using user-controlled URLs in sensitive contexts.

## 2025-05-15 - [Ineffective Blacklist Sanitization]
**Vulnerability:** `InputValidator.sanitizeCustomText` used a blacklist regex approach (`/<script...>/`, `/javascript:/`) to strip XSS vectors. This provides a false sense of security as it is easily bypassed (e.g., `javas\tcript:`) and corrupts legitimate inputs.
**Learning:** Manual blacklisting of dangerous characters is almost always flawed. Security should rely on context-aware encoding (like `URLSearchParams` for query parameters) or robust whitelist-based sanitizers.
**Prevention:** Removed the blacklist regexes and relied on `URLSearchParams` for safe encoding. Added input length limits to mitigate DoS risks.
