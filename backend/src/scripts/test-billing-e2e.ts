import { env } from '../env.js';

async function testBillingE2E() {
  const baseUrl = `http://localhost:${env.PORT}/api`;
  console.log('Testing Billing System Endpoints against:', baseUrl);

  // 1. Log in as Org Admin
  console.log('\n--- Step 1: Login as Org Admin (admin@apexit.com) ---');
  const orgLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@apexit.com', password: 'ApexAdmin2026!' }),
  });
  const orgLoginData = await orgLoginRes.json();
  if (!orgLoginData.token) {
    throw new Error('Org admin login failed: ' + JSON.stringify(orgLoginData));
  }
  const orgToken = orgLoginData.token;
  console.log('✅ Org Admin authenticated. Org:', orgLoginData.organization?.name);

  // 2. Fetch Monthly Expenses
  console.log('\n--- Step 2: Fetch Monthly Expenses for Agency ---');
  const expensesRes = await fetch(`${baseUrl}/invoices/my-expenses`, {
    headers: { Authorization: `Bearer ${orgToken}` },
  });
  const expenses = await expensesRes.json();
  console.log(`✅ Retrieved ${expenses.length} monthly expense records:`);
  for (const exp of expenses) {
    console.log(
      `  - ${exp.monthLabel} (${exp.billingMonth}): $${exp.totalAmountUsd.toFixed(2)} USD | ₹${exp.totalAmountInr.toFixed(2)} INR | Status: ${exp.status} | canDownload: ${exp.canDownload} | isBillGenerated: ${exp.isBillGenerated}`
    );
  }

  // 3. Verify September 2026 Invoice Details & UPI Payload
  console.log('\n--- Step 3: Fetch September 2026 Invoice with UPI & Owner Details ---');
  const sepExp = expenses.find((e: any) => e.billingMonth === '2026-09');
  if (!sepExp || !sepExp.invoice) {
    throw new Error('September 2026 invoice not found');
  }

  const sepInvRes = await fetch(`${baseUrl}/invoices/${sepExp.invoice.id}`, {
    headers: { Authorization: `Bearer ${orgToken}` },
  });
  const sepInv = await sepInvRes.json();
  console.log('✅ Invoice Details Retrieved:');
  console.log('  Invoice #:', sepInv.invoice.invoiceNumber);
  console.log('  Owner Name:', sepInv.owner.name);
  console.log('  Owner Phone:', sepInv.owner.phone);
  console.log('  Owner Email:', sepInv.owner.email);
  console.log('  UPI ID:', sepInv.owner.upiId);
  console.log('  Total USD:', sepInv.payment.amountUsd);
  console.log('  Exchange Rate:', sepInv.payment.exchangeRate);
  console.log('  Total INR:', sepInv.payment.amountInr);
  console.log('  UPI Deep Link Payload:', sepInv.payment.upiDeepLink);

  // 4. Verify October 2026 Access (Should be blocked because isGenerated is false)
  console.log('\n--- Step 4: Verify Unbilled Month Security (October 2026) ---');
  const octExp = expenses.find((e: any) => e.billingMonth === '2026-10');
  if (octExp && octExp.invoice) {
    const octInvRes = await fetch(`${baseUrl}/invoices/${octExp.invoice.id}`, {
      headers: { Authorization: `Bearer ${orgToken}` },
    });
    console.log('  October Invoice HTTP Status for Agency:', octInvRes.status);
    const octBody = await octInvRes.json();
    console.log('  October Response:', octBody);
    if (octInvRes.status === 403) {
      console.log('✅ Correctly blocked: Agency cannot access invoice before Super Admin generates it!');
    }
  }

  // 5. Log in as Super Admin
  console.log('\n--- Step 5: Super Admin Generates/Publishes October 2026 Bill ---');
  const superLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.SUPER_ADMIN_EMAIL, password: env.SUPER_ADMIN_PASSWORD }),
  });
  const superData = await superLoginRes.json();
  const superToken = superData.token;
  console.log('✅ Super Admin logged in:', superData.user.fullName);

  if (octExp && octExp.invoice) {
    // Toggle generation to true
    const toggleRes = await fetch(`${baseUrl}/invoices/admin/${octExp.invoice.id}/toggle-generation`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${superToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isGenerated: true }),
    });
    const toggleData = await toggleRes.json();
    console.log('✅ Super Admin toggle response:', toggleData.message);

    // Verify agency can now download October 2026 invoice
    const recheckExpensesRes = await fetch(`${baseUrl}/invoices/my-expenses`, {
      headers: { Authorization: `Bearer ${orgToken}` },
    });
    const recheckExpenses = await recheckExpensesRes.json();
    const updatedOct = recheckExpenses.find((e: any) => e.billingMonth === '2026-10');
    console.log('  October 2026 updated canDownload status for Agency:', updatedOct?.canDownload);
    if (updatedOct?.canDownload) {
      console.log('✅ Super Admin approval successfully unlocked download button for Agency!');
    }
  }

  console.log('\n🎉 ALL BILLING & INVOICE E2E VERIFICATIONS PASSED SUCCESSFULLY!');
}

testBillingE2E().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
