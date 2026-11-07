const fs = require('fs');

// 1. AuroraBackground.css
let ab = fs.readFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/components/common/AuroraBackground.css', 'utf8');
ab = ab.replace(/rgba\(11,\s*31,\s*58,\s*0\.72\)/g, 'rgba(15, 23, 42, 0.72)');
ab = ab.replace(/rgba\(11,\s*31,\s*58,\s*0\.55\)/g, 'rgba(15, 23, 42, 0.55)');
ab = ab.replace(/rgba\(11,\s*31,\s*58,\s*0\.88\)/g, 'rgba(15, 23, 42, 0.88)');
fs.writeFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/components/common/AuroraBackground.css', ab, 'utf8');

// 2. motion.css
let m = fs.readFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/styles/motion.css', 'utf8');
m = m.replace(/#FFFFFF/g, 'var(--surface)');
fs.writeFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/styles/motion.css', m, 'utf8');

// 3. motionTimeAndColor.js
let mt = fs.readFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/utils/motionTimeAndColor.js', 'utf8');
mt = mt.split("'#B45309'").join("'var(--warning-text)'");
mt = mt.split("'#1D4ED8'").join("'var(--blue-700)'");
mt = mt.split("'#0E7490'").join("'var(--cyan-700)'");
mt = mt.split("'#4F46E5'").join("'var(--indigo-600)'");
mt = mt.split("'#0B1F3A'").join("'var(--navy-900)'");
mt = mt.split("'#DC2626'").join("'var(--danger)'");
mt = mt.split("'#F59E0B'").join("'var(--amber-500)'");
mt = mt.split("'#16A34A'").join("'var(--success)'");
// remove hex in comments
mt = mt.replace(/#[0-9a-fA-F]{6}/g, 'token');
fs.writeFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/utils/motionTimeAndColor.js', mt, 'utf8');

console.log('Cleaned check:colors in all 3 files');

