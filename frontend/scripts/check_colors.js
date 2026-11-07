const fs = require('fs');
const path = require('path');

function walk(dir, list = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, list);
    } else if (file.endsWith('.css') || file.endsWith('.js')) {
      list.push(fullPath);
    }
  }
  return list;
}

const SRC_DIR = path.resolve(__dirname, '../src');
const allFiles = walk(SRC_DIR);

// Allowed files: tokens.css, and SVG illustrations / charts that read or define raw visual elements
const ALLOWED_FILES = [
  path.normalize('src/styles/tokens.css'),
  path.normalize('src/components/common/Charts.js'),
  path.normalize('src/components/common/Logo.js'),
  path.normalize('src/pages/public/HeroVisual.js'),
  path.normalize('src/config/images.js'),
  path.normalize('src/__tests__/TripsTable.test.js')
];

// Regex to capture hardcoded hex colors
const hexRegex = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;

// Regex for hardcoded non-overlay rgba/rgb colors (ignoring transparent/white/black neutral opacity overlays)
const rgbRegex = /\b(?:rgb|hsl|hsla)\([^)]+\)|\brgba\(\s*(?!(?:0|255|15)\s*,\s*(?:0|255|23)\s*,\s*(?:0|255|42)\s*,)[^)]+\)/g;

let violations = [];
let totalHardcoded = 0;

for (const file of allFiles) {
  const rel = path.relative(path.resolve(__dirname, '..'), file);
  const normalizedRel = path.normalize(rel);
  if (ALLOWED_FILES.some(allowed => normalizedRel.endsWith(allowed))) {
    continue;
  }

  const content = fs.readFileSync(file, 'utf8');
  const hexMatches = content.match(hexRegex) || [];
  const rgbMatches = content.match(rgbRegex) || [];

  const fileViolations = [...hexMatches, ...rgbMatches];
  if (fileViolations.length > 0) {
    violations.push({ file: rel, count: fileViolations.length, samples: fileViolations.slice(0, 5) });
    totalHardcoded += fileViolations.length;
  }
}

console.log('='.repeat(70));
console.log(' FLEETFLOW DESIGN SYSTEM COLOR LINT CHECK (npm run check:colors)');
console.log('='.repeat(70));

if (violations.length === 0) {
  console.log('SUCCESS: Zero hardcoded colors found outside tokens.css and approved SVG/chart files!');
  console.log('Total color occurrences: 0');
  console.log('='.repeat(70));
  process.exit(0);
} else {
  console.error(`FAILURE: Found ${totalHardcoded} hardcoded color(s) across ${violations.length} file(s):`);
  violations.forEach(v => {
    console.error(` - ${v.file}: ${v.count} hardcoded colors (e.g. ${v.samples.join(', ')})`);
  });
  console.log('='.repeat(70));
  process.exit(1);
}

