/**
 * seed-demo-data.js
 *
 * Creates 5 demo student accounts in Microsoft Entra ID and seeds
 * FinanceLedger + HoldRegistry SharePoint lists with sample data.
 *
 * Usage:  node seed-demo-data.js
 *         npm run seed
 */
require('dotenv').config();
const { getGraphClient } = require('./graph-client');

const SITE_ID = process.env.SHAREPOINT_SITE_ID;

// ---------------------------------------------------------------------------
// Helper: create SharePoint list item
// ---------------------------------------------------------------------------
async function createListItem(client, listName, fields) {
  try {
    await client.api(`/sites/${SITE_ID}/lists/${listName}/items`).post({ fields });
    return true;
  } catch (err) {
    console.error(`  ❌ Failed to create item in ${listName}:`, err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helper: create Entra ID user (skip if already exists)
// ---------------------------------------------------------------------------
async function createUser(client, user) {
  try {
    const result = await client.api('/users').post(user);
    console.log(`  ✅ Created user: ${user.displayName} (${user.userPrincipalName}) → id: ${result.id}`);
    return result.id;
  } catch (err) {
    if (err.statusCode === 409 || (err.message && err.message.includes('already exists'))) {
      console.log(`  ⏭️  User already exists: ${user.userPrincipalName}`);
      // Try to get existing user ID
      try {
        const existing = await client
          .api(`/users/${user.userPrincipalName}`)
          .select('id')
          .get();
        return existing.id;
      } catch (e) {
        return null;
      }
    }
    console.error(`  ❌ Failed to create user ${user.displayName}:`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper: get tenant default domain
// ---------------------------------------------------------------------------
async function getDefaultDomain(client) {
  if (process.env.DOMAIN) {
    return process.env.DOMAIN;
  }
  try {
    const org = await client.api('/organization').select('verifiedDomains').get();
    const orgData = org.value[0];
    const defaultDomain = orgData.verifiedDomains.find((d) => d.isDefault);
    return defaultDomain ? defaultDomain.name : orgData.verifiedDomains[0].name;
  } catch (err) {
    console.error('  ⚠️  Could not determine default domain, falling back to env or placeholder.');
    return 'contoso.onmicrosoft.com';
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🎭 Sutradhara — Demo Data Seeder');
  console.log('═══════════════════════════════════════════════════════\n');

  const client = getGraphClient();

  // Resolve domain
  const domain = await getDefaultDomain(client);
  console.log(`  📧 Using domain: ${domain}\n`);

  // =========================================================================
  // 1. Create demo student accounts
  // =========================================================================
  console.log('[1/3] Creating demo student accounts in Entra ID...');

  const students = [
    {
      accountEnabled: false,
      displayName: 'Alice Vance',
      mailNickname: 'alice.vance',
      userPrincipalName: `alice.vance@${domain}`,
      department: 'Computer Science',
      jobTitle: 'Student',
      passwordProfile: {
        password: 'Sutradhara@2026',
        forceChangePasswordNextSignIn: true
      }
    },
    {
      accountEnabled: false,
      displayName: 'Bob Carter',
      mailNickname: 'bob.carter',
      userPrincipalName: `bob.carter@${domain}`,
      department: 'Electrical Engineering',
      jobTitle: 'Student',
      passwordProfile: {
        password: 'Sutradhara@2026',
        forceChangePasswordNextSignIn: true
      }
    },
    {
      accountEnabled: false,
      displayName: 'Charlie Miller',
      mailNickname: 'charlie.miller',
      userPrincipalName: `charlie.miller@${domain}`,
      department: 'Mechanical Engineering',
      jobTitle: 'Student',
      passwordProfile: {
        password: 'Sutradhara@2026',
        forceChangePasswordNextSignIn: true
      }
    },
    {
      accountEnabled: false,
      displayName: 'Diana Prince',
      mailNickname: 'diana.prince',
      userPrincipalName: `diana.prince@${domain}`,
      department: 'Business Administration',
      jobTitle: 'Student',
      passwordProfile: {
        password: 'Sutradhara@2026',
        forceChangePasswordNextSignIn: true
      }
    },
    {
      accountEnabled: false,
      displayName: 'Ethan Hunt',
      mailNickname: 'ethan.hunt',
      userPrincipalName: `ethan.hunt@${domain}`,
      department: 'Public Policy',
      jobTitle: 'Student',
      passwordProfile: {
        password: 'Sutradhara@2026',
        forceChangePasswordNextSignIn: true
      }
    }
  ];

  const studentIds = {};
  const studentIdMap = {
    'alice.vance': 'S12345',
    'bob.carter': 'S12346',
    'charlie.miller': 'S12347',
    'diana.prince': 'S12348',
    'ethan.hunt': 'S12349'
  };

  for (const student of students) {
    const userId = await createUser(client, student);
    const nick = student.mailNickname;
    studentIds[nick] = userId;
  }
  console.log('');

  // =========================================================================
  // 2. Seed FinanceLedger
  // =========================================================================
  console.log('[2/3] Seeding FinanceLedger records...');

  const financeRecords = [
    {
      StudentID: studentIds['alice.vance'] || 'S12345',
      StudentEmail: `alice.vance@${domain}`,
      ReceiptNumber: 'REC-2026-0891',
      AmountDue: 12000,
      AmountPaid: 12000,
      PaymentDate: '2026-06-01T00:00:00Z',
      PaymentMethod: 'Bank Transfer',
      VerificationStatus: 'Verified',
      Notes: 'Full payment received — semester fee cleared.'
    },
    {
      StudentID: studentIds['bob.carter'] || 'S12346',
      StudentEmail: `bob.carter@${domain}`,
      ReceiptNumber: 'REC-2026-0892',
      AmountDue: 15000,
      AmountPaid: 12500,
      PaymentDate: '2026-05-28T00:00:00Z',
      PaymentMethod: 'Financial Aid',
      VerificationStatus: 'Verified',
      Notes: 'Partial payment — 83.3% paid via Financial Aid. Balance outstanding.'
    },
    {
      StudentID: studentIds['charlie.miller'] || 'S12347',
      StudentEmail: `charlie.miller@${domain}`,
      ReceiptNumber: 'REC-2026-0893',
      AmountDue: 10000,
      AmountPaid: 10000,
      PaymentDate: '2026-06-02T00:00:00Z',
      PaymentMethod: 'Credit Card',
      VerificationStatus: 'Verified',
      Notes: 'Full payment received.'
    },
    {
      StudentID: studentIds['diana.prince'] || 'S12348',
      StudentEmail: `diana.prince@${domain}`,
      ReceiptNumber: 'REC-2026-0894',
      AmountDue: 14000,
      AmountPaid: 14000,
      PaymentDate: '2026-05-25T00:00:00Z',
      PaymentMethod: 'Scholarship',
      VerificationStatus: 'Verified',
      Notes: 'Full scholarship payment applied.'
    },
    {
      StudentID: studentIds['ethan.hunt'] || 'S12349',
      StudentEmail: `ethan.hunt@${domain}`,
      ReceiptNumber: 'REC-2026-0895',
      AmountDue: 12000,
      AmountPaid: 4800,
      PaymentDate: '2026-05-30T00:00:00Z',
      PaymentMethod: 'Bank Transfer',
      VerificationStatus: 'Pending',
      Notes: 'Only 40% paid. Student has not applied for hardship.'
    }
  ];

  let financeCreated = 0;
  for (const record of financeRecords) {
    const ok = await createListItem(client, 'FinanceLedger', record);
    if (ok) {
      console.log(`  ✅ Finance record: ${record.StudentEmail} — $${record.AmountPaid}/$${record.AmountDue}`);
      financeCreated++;
    }
  }
  console.log('');

  // =========================================================================
  // 3. Seed HoldRegistry
  // =========================================================================
  console.log('[3/3] Seeding HoldRegistry records...');

  const holdRecords = [
    {
      StudentID: studentIds['bob.carter'] || 'S12346',
      HoldType: 'Financial',
      HoldStatus: 'Active',
      PlacedDate: '2026-05-20T00:00:00Z',
      PlacedBy: 'Finance Office',
      Reason: 'Outstanding balance of $2,500 from partial Financial Aid disbursement.',
      ResolutionNotes: ''
    },
    {
      StudentID: studentIds['charlie.miller'] || 'S12347',
      HoldType: 'AcademicIntegrity',
      HoldStatus: 'Expired',
      PlacedDate: '2025-09-15T00:00:00Z',
      ExpiryDate: '2026-03-15T00:00:00Z',
      PlacedBy: 'Academic Affairs',
      Reason: 'Academic integrity violation in Fall 2025. Probation period ended March 2026.',
      ResolutionNotes: 'Probation period completed. Hold auto-expired on 2026-03-15.'
    },
    {
      StudentID: studentIds['diana.prince'] || 'S12348',
      HoldType: 'Investigation',
      HoldStatus: 'Active',
      PlacedDate: '2026-05-28T00:00:00Z',
      PlacedBy: 'Student Conduct Office',
      Reason: 'Active investigation into reported policy violation. Account suspended pending outcome.',
      ResolutionNotes: ''
    },
    {
      StudentID: studentIds['ethan.hunt'] || 'S12349',
      HoldType: 'Financial',
      HoldStatus: 'Active',
      PlacedDate: '2026-05-20T00:00:00Z',
      PlacedBy: 'Finance Office',
      Reason: 'Only 40% of semester fees paid. Account deactivated per RIT-POL-001.',
      ResolutionNotes: ''
    }
  ];

  let holdsCreated = 0;
  for (const record of holdRecords) {
    const ok = await createListItem(client, 'HoldRegistry', record);
    if (ok) {
      console.log(`  ✅ Hold: ${record.HoldType} (${record.HoldStatus}) for ${record.StudentID}`);
      holdsCreated++;
    }
  }
  console.log('');

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ✅ Demo Data Seeding Complete!');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Domain:            ${domain}`);
  console.log(`  Users created:     ${Object.values(studentIds).filter(Boolean).length} / ${students.length}`);
  console.log(`  Finance records:   ${financeCreated} / ${financeRecords.length}`);
  console.log(`  Hold records:      ${holdsCreated} / ${holdRecords.length}`);
  console.log('');
  console.log('  Demo Accounts:');
  console.log('  ┌─────────┬──────────────────┬─────────────────────────────────┬─────────────────────┐');
  console.log('  │ ID      │ Name             │ Email                           │ Scenario            │');
  console.log('  ├─────────┼──────────────────┼─────────────────────────────────┼─────────────────────┤');
  console.log(`  │ S12345  │ Alice Vance      │ alice.vance@${domain.padEnd(20)}│ Full pay, no holds  │`);
  console.log(`  │ S12346  │ Bob Carter       │ bob.carter@${domain.padEnd(21)}│ 83% pay + fin hold  │`);
  console.log(`  │ S12347  │ Charlie Miller   │ charlie.miller@${domain.padEnd(17)}│ Full pay, exp hold  │`);
  console.log(`  │ S12348  │ Diana Prince     │ diana.prince@${domain.padEnd(19)}│ Full pay, inv hold  │`);
  console.log(`  │ S12349  │ Ethan Hunt       │ ethan.hunt@${domain.padEnd(21)}│ 40% pay + fin hold  │`);
  console.log('  └─────────┴──────────────────┴─────────────────────────────────┴─────────────────────┘');
  console.log('');
  console.log('  Expected Sutradhara Decisions:');
  console.log('    S12345 (Alice)   → APPROVE FULL  (100% paid, no holds)');
  console.log('    S12346 (Bob)     → ESCALATE      (83% paid, active financial hold)');
  console.log('    S12347 (Charlie) → APPROVE FULL  (100% paid, expired integrity hold)');
  console.log('    S12348 (Diana)   → DENY          (active investigation hold)');
  console.log('    S12349 (Ethan)   → DENY          (40% paid, no hardship flag)');
  console.log('');
}

main().catch((err) => {
  console.error('\n❌ Seeding failed:', err.message);
  console.error(err);
  process.exit(1);
});
