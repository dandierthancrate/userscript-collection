# Sentinel Security Journal 🛡️

## 2025-05-14 - [Insecure DOM Injection Pattern]
**Vulnerability:** Use of `innerHTML` to inject data fetched from external, untrusted APIs (LRCLIB, Arweave, steamcmd).
**Learning:** Multiple userscripts in this repository followed a pattern of fetching data from "community" or "open" APIs and directly injecting it into the host site's DOM using `innerHTML`. This exposes the host site to XSS if the external API is compromised or contains malicious user-submitted content.
**Prevention:** Always use `textContent` for data fetched from external sources. If HTML formatting is required, use `createElement` and `textContent` to build the DOM structure safely, or use a robust sanitizer.
