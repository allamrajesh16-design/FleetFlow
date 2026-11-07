const fs = require('fs');

let lp = fs.readFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/public/LandingPage.js', 'utf8');
if (!lp.includes('AuroraBackground')) {
  lp = 'import AuroraBackground from "../../components/common/AuroraBackground";\n' + lp;
  lp = lp.replace(
    '<section className="landing-hero" id="home">',
    '<section className="landing-hero" id="home" style={{ position: "relative" }}>\n        <AuroraBackground />'
  );
  fs.writeFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/public/LandingPage.js', lp, 'utf8');
  console.log('Added Aurora to LandingPage.js');
}

