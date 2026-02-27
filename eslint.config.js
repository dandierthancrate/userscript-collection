import globals from "globals";
import pluginJs from "@eslint/js";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        // Greasemonkey/Tampermonkey API
        GM_info: "readonly",
        GM_getValue: "readonly",
        GM_setValue: "readonly",
        GM_deleteValue: "readonly",
        GM_listValues: "readonly",
        GM_addStyle: "readonly",
        GM_registerMenuCommand: "readonly",
        GM_unregisterMenuCommand: "readonly",
        GM_openInTab: "readonly",
        GM_xmlhttpRequest: "readonly",
        GM_download: "readonly",
        GM_notification: "readonly",
        GM_setClipboard: "readonly",
        GM_getResourceText: "readonly",
        GM_getResourceURL: "readonly",
        GM_log: "readonly",
        GM_addElement: "readonly",
        GM_cookie: "readonly",
        GM_webRequest: "readonly",
        GM_saveTab: "readonly",
        GM_getTabs: "readonly",
        GM_removeValueChangeListener: "readonly",
        GM_addValueChangeListener: "readonly",
        unsafeWindow: "readonly",
        // ScriptCat specific API
        CAT_info: "readonly",
        CAT_getValue: "readonly",
        CAT_setValue: "readonly",
        CAT_deleteValue: "readonly",
        CAT_listValues: "readonly",
        CAT_addStyle: "readonly",
        CAT_registerMenuCommand: "readonly",
        CAT_openInTab: "readonly",
        CAT_request: "readonly",
        CAT_download: "readonly",
        CAT_notification: "readonly",
        CAT_setClipboard: "readonly",
        CAT_log: "readonly",
        CAT_addListener: "readonly",
        CAT_getMetadata: "readonly",
        CAT_tabClose: "readonly",
        CAT_tabUpdate: "readonly",
        CAT_windowClose: "readonly",
        CAT_windowUpdate: "readonly",
        CAT_fileSelect: "readonly",
        CAT_fileSave: "readonly",
        CAT_clipboard: "readonly",
        CAT_cookie: "readonly",
        CAT_webRequest: "readonly",
        CAT_ajaxHook: "readonly",
        CAT_scriptHook: "readonly",
        CAT_runtimeHook: "readonly",
        CAT_runtimeEmit: "readonly",
        CAT_runtimeSend: "readonly",
        // Common userscript patterns
        "$": "readonly",
        jQuery: "readonly",
      },
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "script",
      },
    },
    rules: {
      // === ScriptCat Optimized Rules ===
      // ScriptCat supports modern ES6+ features including async/await, arrow functions, etc.

      // Best practices - stricter for production quality
      "no-var": "error",
      "prefer-const": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-return-await": "warn",
      "require-await": "warn",
      "no-floating-decimal": "error",
      "no-implicit-coercion": ["error", { allow: ["!!", "+"] }],
      "no-multi-spaces": "error",
      "no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0 }],

      // Code style - consistent formatting
      "indent": ["error", 4, { SwitchCase: 1, flatTernaryExpressions: false }],
      "quotes": ["error", "single", { avoidEscape: true }],
      "semi": ["error", "always"],
      "comma-dangle": ["error", "never"],
      "no-trailing-spaces": "error",
      "eol-last": "error",
      "curly": ["error", "all"],
      "brace-style": ["error", "1tbs", { allowSingleLine: false }],
      "eqeqeq": ["error", "always"],
      "yoda": ["error", "never"],
      "camelcase": ["warn", { properties: "never", allow: ["^GM_|^CAT_|^__"] }],
      "spaced-comment": ["error", "always", { markers: ["/"] }],
      "space-before-blocks": "error",
      "space-in-parens": "error",
      "object-curly-spacing": ["error", "always"],
      "array-bracket-spacing": "error",
      "computed-property-spacing": "error",
      "func-call-spacing": "error",
      "keyword-spacing": "error",
      "space-infix-ops": "error",
      "space-unary-ops": "error",

      // ScriptCat specific - allow patterns needed for userscripts
      "no-console": "off", // Console logging is essential for debugging
      "no-alert": "off", // Alerts may be used intentionally
      "no-undef": "off", // unsafeWindow and GM APIs are injected
      "no-script-url": "warn", // Sometimes needed for userscript hacks
      "no-proto": "off", // Legacy support may require __proto__

      // Performance optimizations for ScriptCat's V8 engine
      "prefer-arrow-callback": "warn",
      "prefer-template": "warn",
      "no-useless-concat": "error",
      "no-useless-return": "warn",

      // Security - critical for userscripts running on multiple domains
      "no-script-url": "warn",
      "no-label-var": "error",
      "no-shadow-restricted-names": "error",
      "no-prototype-builtins": "warn",
    },
  },
  pluginJs.configs.recommended,
  {
    ignores: [
      "node_modules/",
      "dist/",
      "build/",
      "*.min.js",
      "pnpm-lock.yaml",
      "coverage/",
      // Ignore existing userscripts - they have their own conventions
      "*.user.js",
      // Ignore eslint config itself
      "eslint.config.js",
    ],
  },
  // More lenient rules for test files
  {
    files: ["tests/**/*.js", "tests/**/*.mjs"],
    rules: {
      "no-unused-vars": "off", // Test files often have unused imports for documentation
      "no-empty": "off", // Empty blocks OK in tests
      "no-eval": "off", // eval sometimes needed for dynamic test code
      "no-script-url": "off", // Testing URL validation
      "prefer-template": "off", // String concatenation OK
      "require-await": "off", // Async without await OK for test mocks
      "indent": "off", // Let prettier handle formatting
      "brace-style": "off",
      "curly": "off",
      "comma-dangle": "off",
      "quotes": "off",
      "semi": "off",
      "keyword-spacing": "off",
      "space-infix-ops": "off",
      "space-before-blocks": "off",
      "no-trailing-spaces": "off",
      "no-implicit-coercion": "off",
      "prefer-const": "off",
    },
  },
];
