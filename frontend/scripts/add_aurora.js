const fs = require('fs');

// 1. AuthSidePanel.js
const pAuth = 'C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/components/auth/AuthSidePanel.js';
if (fs.existsSync(pAuth)) {
  let content = fs.readFileSync(pAuth, 'utf8');
  if (!content.includes('AuroraBackground')) {
    content = 'import AuroraBackground from "../common/AuroraBackground";\n' + content;
    content = content.replace(
      '<div className="auth-side-gradient-overlay" />',
      '<div className="auth-side-gradient-overlay" />\n      <AuroraBackground />'
    );
    fs.writeFileSync(pAuth, content, 'utf8');
    console.log('Added Aurora to AuthSidePanel');
  }
}

// 2. UnauthorizedPage.js (403)
const p403 = 'C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/shared/UnauthorizedPage.js';
if (fs.existsSync(p403)) {
  let content = fs.readFileSync(p403, 'utf8');
  if (!content.includes('AuroraBackground')) {
    content = 'import AuroraBackground from "../../components/common/AuroraBackground";\n' + content;
    content = content.replace(
      '<div className="status-page',
      '<AuroraBackground />\n      <div className="status-page'
    );
    fs.writeFileSync(p403, content, 'utf8');
    console.log('Added Aurora to UnauthorizedPage');
  }
}

// 3. NotFoundPage.js (404)
const p404 = 'C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/pages/shared/NotFoundPage.js';
if (fs.existsSync(p404)) {
  let content = fs.readFileSync(p404, 'utf8');
  if (!content.includes('AuroraBackground')) {
    content = 'import AuroraBackground from "../../components/common/AuroraBackground";\n' + content;
    content = content.replace(
      '<div className="status-page',
      '<AuroraBackground />\n      <div className="status-page'
    );
    fs.writeFileSync(p404, content, 'utf8');
    console.log('Added Aurora to NotFoundPage');
  }
}

