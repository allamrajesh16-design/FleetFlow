const fs = require('fs');

let lp = fs.readFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/public/LandingPage.js', 'utf8');
if (lp.includes('feature-card') && !lp.includes('feature-card-conic')) {
  lp = lp.split('className="feature-card"').join('className="feature-card feature-card-conic"');
  fs.writeFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/public/LandingPage.js', lp, 'utf8');
  console.log('Added feature-card-conic to LandingPage features');
}

