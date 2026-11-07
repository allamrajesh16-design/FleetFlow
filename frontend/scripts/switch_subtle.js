const fs = require('fs');

const replacements = [
  ['src/components/common/PageHeader.css', 'color: var(--text-subtle);', 'color: var(--text-muted);'],
  ['src/components/common/Charts.css', 'color: var(--text-subtle);', 'color: var(--text-muted);'],
  ['src/pages/customer/CustomerLiveTrackingPage.js', "color: 'var(--text-subtle)'", "color: 'var(--text-muted)'"],
  ['src/pages/manager/ManagerTripsPage.js', "color: 'var(--text-subtle)'", "color: 'var(--text-muted)'"],
  ['src/pages/public/LandingPage.css', 'color: var(--text-subtle);', 'color: var(--text-muted);'],
  ['src/pages/shared/StatusPages.css', 'color: var(--text-subtle);', 'color: var(--text-muted);'],
  ['src/pages/customer/CustomerPages.css', 'color: var(--text-subtle);', 'color: var(--text-muted);'],
  ['src/pages/customer/CustomerPages.css', 'color: var(--color-text-muted, var(--text-subtle));', 'color: var(--text-muted);'],
  ['src/components/forms/forms.css', 'color: var(--text-subtle);', 'color: var(--text-muted);'],
  ['src/components/forms/forms.css', '--ff-input-placeholder: var(--text-subtle);', '--ff-input-placeholder: var(--text-muted);'],
  ['src/components/common/Input.css', 'color: var(--text-subtle);', 'color: var(--text-muted);'],
  ['src/components/common/SearchBar.css', 'color: var(--text-subtle);', 'color: var(--text-muted);']
];

replacements.forEach(([file, from, to]) => {
  const p = 'C:/Users/RAJESH/Desktop/FleetFlow/frontend/' + file;
  if (!fs.existsSync(p)) return;
  let content = fs.readFileSync(p, 'utf8');
  if (content.includes(from)) {
    content = content.split(from).join(to);
    fs.writeFileSync(p, content, 'utf8');
    console.log('Switched text-subtle to text-muted in', file);
  }
});

console.log('Finished updating text-subtle to text-muted');

