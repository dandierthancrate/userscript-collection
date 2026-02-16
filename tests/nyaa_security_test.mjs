import fs from 'fs';
import assert from 'node:assert';

// Helper to extract function source
function extractFunction(code, funcName) {
  const start = code.indexOf(`function ${funcName}`);
  if (start === -1) throw new Error(`Function ${funcName} not found`);

  let braceCount = 0;
  let end = -1;
  let started = false;

  for (let i = start; i < code.length; i++) {
    if (code[i] === '{') {
      if (!started) started = true;
      braceCount++;
    } else if (code[i] === '}') {
      braceCount--;
      if (started && braceCount === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end === -1) throw new Error(`Could not find end of function ${funcName}`);

  // Extract body
  const funcCode = code.substring(start, end);
  const bodyStart = funcCode.indexOf('{') + 1;
  const bodyEnd = funcCode.lastIndexOf('}');
  return funcCode.substring(bodyStart, bodyEnd);
}

const code = fs.readFileSync('nyaa-linker-userscript.user.js', 'utf8');
const createSearchBody = extractFunction(code, 'createSearch');

// Create the function dynamically
const createSearch = new Function('btn', 'query', 'settings', createSearchBody);

// Test Setup
const btn = {
  dataset: { spicy: 'false', cat: '1_2' },
  style: {},
  title: '',
  textContent: '',
  href: '',
  target: '',
  rel: ''
};

const settings = {
  category_setting: '1_2',
  filter_setting: '0',
  sort_setting: 'id',
  order_setting: 'desc',
  custom_text_toggle_setting: false,
  custom_text_setting: ''
};

// Test 1: Query with '#' (Demonstrates truncation issue)
console.log('Running Test 1: Query with #');
const queryWithHash = 'Test #2';
createSearch(btn, queryWithHash, settings);

const href = btn.href;
console.log('Generated HREF:', href);

if (href.includes('q=Test #2')) {
  console.error('❌ FAILED: Query with # is NOT encoded (broken link).');
  process.exit(1);
} else if (href.includes('q=Test+%232') || href.includes('q=Test%20%232')) {
  console.log('✅ PASSED: Query with # is correctly encoded.');
} else {
    console.error('❓ UNKNOWN STATE:', href);
    process.exit(1);
}

// Test 2: Custom Text Injection (Demonstrates injection issue)
console.log('\nRunning Test 2: Custom Text Injection');
settings.custom_text_toggle_setting = true;
settings.custom_text_setting = '&s=seeders'; // Attempt to inject sort parameter
const queryNormal = 'Normal Query';

createSearch(btn, queryNormal, settings);
const hrefInjection = btn.href;
console.log('Generated HREF:', hrefInjection);

if (hrefInjection.includes('&q=Normal Query &s=seeders') || hrefInjection.includes('q=Normal+Query+&s=seeders')) {
   // Note: URLSearchParams encodes + as %2B in query params if it was literal +, but space becomes +
   console.error('❌ FAILED: Custom text injected raw parameter.');
   process.exit(1);
} else if (hrefInjection.includes('%26s%3Dseeders')) {
    console.log('✅ PASSED: Custom text is safely encoded.');
} else {
    console.log('❓ UNKNOWN STATE:', hrefInjection);
    // It might be encoded differently?
    // Normal Query -> Normal+Query
    // &s=seeders -> %26s%3Dseeders
    // q=Normal+Query+%26s%3Dseeders
    if (hrefInjection.includes('q=Normal+Query+%26s%3Dseeders')) {
        console.log('✅ PASSED: Custom text is safely encoded.');
    } else {
        process.exit(1);
    }
}
