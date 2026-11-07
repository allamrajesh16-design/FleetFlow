const fs = require('fs');

const pCheck = 'C:/Users/RAJESH/Desktop/FleetFlow/frontend/scripts/check_contrast.js';
let content = fs.readFileSync(pCheck, 'utf8');

const newPairs = `
  // 9. Time of Day Stops & Role Header Accents (min 4.5:1 / 3.0:1)
  ['Time of Day Morning Stop (#B45309)', '#FFFFFF', '#B45309', 4.5],
  ['Time of Day Morning Stop B (#1D4ED8)', '#FFFFFF', '#1D4ED8', 4.5],
  ['Time of Day Afternoon Stop (#1D4ED8)', '#FFFFFF', '#1D4ED8', 4.5],
  ['Time of Day Afternoon Stop B (#0E7490)', '#FFFFFF', '#0E7490', 4.5],
  ['Time of Day Evening Stop (#4F46E5)', '#FFFFFF', '#4F46E5', 4.5],
  ['Time of Day Evening Stop B (#0B1F3A)', '#FFFFFF', '#0B1F3A', 4.5],
  ['Admin Role Accent (#4F46E5)', '#FFFFFF', '#4F46E5', 4.5],
  ['Driver Role Accent (#0F766E)', '#FFFFFF', '#0F766E', 4.5],
  ['Customer Role Accent (#0369A1)', '#FFFFFF', '#0369A1', 4.5],
`;

if (!content.includes('Time of Day Morning Stop')) {
  content = content.replace('// 8. Disabled Controls', newPairs + '  // 8. Disabled Controls');
  fs.writeFileSync(pCheck, content, 'utf8');
  console.log('Added Time of Day & Role Accent stops to check_contrast.js');
}

