import { env } from '../env.js';

async function testSuperAdminLogin() {
  const url = 'http://localhost:4000/api/auth/login';
  const credentials = {
    email: env.SUPER_ADMIN_EMAIL,
    password: env.SUPER_ADMIN_PASSWORD,
  };

  console.log(`Testing Super Admin login against ${url}...`);
  console.log(`Email: ${credentials.email}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });

  const data = await res.json();
  console.log(`Status: ${res.status}`);
  if (res.ok && data.user && data.user.role === 'super_admin') {
    console.log(`✅ SUCCESS: Super Admin authenticated successfully!`);
    console.log(`   User: ${data.user.fullName} (${data.user.email})`);
    console.log(`   Role: ${data.user.role}`);
    console.log(`   Token Length: ${data.token?.length} chars`);
    process.exit(0);
  } else {
    console.error(`❌ FAILED: ${JSON.stringify(data)}`);
    process.exit(1);
  }
}

testSuperAdminLogin().catch((err) => {
  console.error(err);
  process.exit(1);
});
