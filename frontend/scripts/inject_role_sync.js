const fs = require('fs');

let auth = fs.readFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/context/AuthContext.js', 'utf8');

const roleEffectCode = `
  // Synchronize data-role on document root for dynamic role accents
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const r = user?.role ? String(user.role).toLowerCase() : '';
    let roleAttr = '';
    if (r === 'admin') roleAttr = 'admin';
    else if (r === 'fleet_manager' || r === 'manager') roleAttr = 'manager';
    else if (r === 'driver') roleAttr = 'driver';
    else if (r === 'customer') roleAttr = 'customer';

    if (roleAttr) {
      document.documentElement.setAttribute('data-role', roleAttr);
    } else {
      document.documentElement.removeAttribute('data-role');
    }
  }, [user?.role]);
`;

if (!auth.includes('data-role')) {
  const retIdx = auth.lastIndexOf('return (');
  auth = auth.slice(0, retIdx) + roleEffectCode + '\n  ' + auth.slice(retIdx);
  fs.writeFileSync('C:/Users/RAJESH/Desktop/FleetFlow/frontend/src/context/AuthContext.js', auth, 'utf8');
  console.log('Injected data-role synchronization into AuthContext.js');
}

