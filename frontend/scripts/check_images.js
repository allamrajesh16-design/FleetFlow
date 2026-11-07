const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, '../src/config/images.js');
const publicImagesDir = path.resolve(__dirname, '../public/images');

console.log('======================================================================');
console.log(' FLEETFLOW IMAGE ASSETS & FALLBACK AUDIT (check:images)');
console.log('======================================================================');

if (!fs.existsSync(configPath)) {
  console.error(`ERROR: Images configuration file not found at ${configPath}`);
  process.exit(1);
}

const configContent = fs.readFileSync(configPath, 'utf8');

// Extract all /images/... image file paths
const regex = /['"`](\/images\/[^'"`]+)['"`]/g;
let match;
const referencedImages = new Set();
while ((match = regex.exec(configContent)) !== null) {
  referencedImages.add(match[1]);
}

let missingCount = 0;
console.log(`Found ${referencedImages.size} distinct referenced image path(s) in config:`);

referencedImages.forEach((imgPath) => {
  const relFile = imgPath.replace(/^\/images\//, '');
  const targetFile = path.join(publicImagesDir, relFile);
  const exists = fs.existsSync(targetFile);
  if (exists) {
    console.log(`  ✓  ${imgPath} -> exists (${(fs.statSync(targetFile).size / 1024).toFixed(1)} KB)`);
  } else {
    console.error(`  ✗  MISSING: ${imgPath} -> expected at ${targetFile}`);
    missingCount++;
  }
});

// Check that every top-level entry in images has fallbacks
const hasBusFallback = configContent.includes('busBooking') && configContent.includes('fallback');
const hasBikeFallback = configContent.includes('vehicleBike') && configContent.includes('fallback');
const hasCarFallback = configContent.includes('vehicleCar') && configContent.includes('fallback');

if (!hasBusFallback || !hasBikeFallback || !hasCarFallback) {
  console.error('  ✗  FAIL: Vehicle registry entries missing fallback chains!');
  process.exit(1);
}

if (missingCount > 0) {
  console.error(`\nFAILED: ${missingCount} image asset(s) missing from public/images.`);
  process.exit(1);
}

console.log('\nSUCCESS: All referenced images exist in public/images with complete fallback chains.');
console.log('======================================================================');

