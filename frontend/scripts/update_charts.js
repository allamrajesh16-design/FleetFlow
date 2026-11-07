const fs = require('fs');
const path = require('path');

const file = 'C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/components/common/Charts.js';
let content = fs.readFileSync(file, 'utf8');

content = content.split('#2563EB').join('var(--chart-1)');
content = content.split('#E2E8F0').join('var(--border)');
content = content.split('#FFFFFF').join('var(--surface)');
content = content.split('#F1F5F9').join('var(--neutral-bg)');

fs.writeFileSync(file, content, 'utf8');
console.log('Charts.js successfully updated without hex');

