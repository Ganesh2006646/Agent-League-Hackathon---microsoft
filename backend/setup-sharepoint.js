/**
 * setup-sharepoint.js
 *
 * Creates the three SharePoint lists (FinanceLedger, HoldRegistry, AuditLog)
 * and their columns using the Microsoft Graph API.
 *
 * Usage:  node setup-sharepoint.js
 *         npm run setup
 */
require('dotenv').config();
const { getGraphClient } = require('./graph-client');

const SITE_ID = process.env.SHAREPOINT_SITE_ID;

// ---------------------------------------------------------------------------
// Helper: create a SharePoint list (skip if 409 conflict = already exists)
// ---------------------------------------------------------------------------
async function createList(client, displayName, description) {
  try {
    const result = await client.api(`/sites/${SITE_ID}/lists`).post({
      displayName,
      description,
      list: { template: 'genericList' }
    });
    console.log(`  ✅ Created list: ${displayName} (id: ${result.id})`);
    return result.id;
  } catch (err) {
    if (err.statusCode === 409 || (err.code && err.code === 'nameAlreadyExists')) {
      console.log(`  ⏭️  List already exists: ${displayName} — skipping creation.`);
      // Retrieve existing list id
      const existing = await client.api(`/sites/${SITE_ID}/lists/${displayName}`).get();
      return existing.id;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helper: add a column to a list (skip if already exists)
// ---------------------------------------------------------------------------
async function addColumn(client, listId, columnDef) {
  try {
    await client.api(`/sites/${SITE_ID}/lists/${listId}/columns`).post(columnDef);
    console.log(`    + Column: ${columnDef.name}`);
  } catch (err) {
    if (
      err.statusCode === 409 ||
      (err.message && err.message.includes('already exists')) ||
      (err.code && err.code === 'nameAlreadyExists')
    ) {
      console.log(`    ⏭️  Column already exists: ${columnDef.name}`);
    } else {
      console.error(`    ❌ Failed to add column ${columnDef.name}:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// List definitions
// ---------------------------------------------------------------------------

const FINANCE_LEDGER_COLUMNS = [
  {
    name: 'StudentID',
    text: {},
    indexed: true,
    required: true
  },
  {
    name: 'StudentEmail',
    text: {}
  },
  {
    name: 'ReceiptNumber',
    text: {},
    indexed: true
  },
  {
    name: 'AmountDue',
    number: { decimalPlaces: 'two' }
  },
  {
    name: 'AmountPaid',
    number: { decimalPlaces: 'two' }
  },
  {
    name: 'PaymentDate',
    dateTime: { format: 'dateOnly' }
  },
  {
    name: 'PaymentMethod',
    choice: {
      allowTextEntry: false,
      choices: ['Bank Transfer', 'Credit Card', 'Financial Aid', 'Scholarship']
    }
  },
  {
    name: 'VerificationStatus',
    choice: {
      allowTextEntry: false,
      choices: ['Pending', 'Verified', 'Rejected']
    }
  },
  {
    name: 'Notes',
    text: { allowMultipleLines: true, maxLength: 5000 }
  }
];

const HOLD_REGISTRY_COLUMNS = [
  {
    name: 'StudentID',
    text: {},
    indexed: true,
    required: true
  },
  {
    name: 'HoldType',
    choice: {
      allowTextEntry: false,
      choices: ['Financial', 'AcademicIntegrity', 'Investigation', 'Probation', 'Administrative']
    }
  },
  {
    name: 'HoldStatus',
    choice: {
      allowTextEntry: false,
      choices: ['Active', 'Expired', 'Lifted', 'UnderReview']
    }
  },
  {
    name: 'PlacedDate',
    dateTime: { format: 'dateOnly' }
  },
  {
    name: 'ExpiryDate',
    dateTime: { format: 'dateOnly' }
  },
  {
    name: 'PlacedBy',
    text: {}
  },
  {
    name: 'Reason',
    text: { allowMultipleLines: true, maxLength: 5000 }
  },
  {
    name: 'ResolutionNotes',
    text: { allowMultipleLines: true, maxLength: 5000 }
  }
];

const AUDIT_LOG_COLUMNS = [
  {
    name: 'StudentID',
    text: {},
    indexed: true,
    required: true
  },
  {
    name: 'RequestedBy',
    text: {}
  },
  {
    name: 'ApprovedBy',
    text: {}
  },
  {
    name: 'Action',
    choice: {
      allowTextEntry: false,
      choices: ['Reactivate', 'Deny', 'Escalate', 'TemporaryAccess']
    }
  },
  {
    name: 'PolicyCitation',
    text: {}
  },
  {
    name: 'ReasoningTrace',
    text: { allowMultipleLines: true, maxLength: 10000 }
  },
  {
    name: 'ExecutionStatus',
    choice: {
      allowTextEntry: false,
      choices: ['Pending', 'Approved', 'Denied', 'Executed', 'Failed']
    }
  },
  {
    name: 'ReceiptNumber',
    text: {}
  },
  {
    name: 'TransactionId',
    text: {}
  }
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🎭 Sutradhara — SharePoint List Setup');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Site ID: ${SITE_ID}\n`);

  const client = getGraphClient();

  // 1. FinanceLedger
  console.log('[1/3] Creating FinanceLedger...');
  const financeListId = await createList(client, 'FinanceLedger', 'Student payment records for account reactivation');
  for (const col of FINANCE_LEDGER_COLUMNS) {
    await addColumn(client, financeListId, col);
  }
  console.log('');

  // 2. HoldRegistry
  console.log('[2/3] Creating HoldRegistry...');
  const holdListId = await createList(client, 'HoldRegistry', 'Student holds — financial, academic integrity, investigation, etc.');
  for (const col of HOLD_REGISTRY_COLUMNS) {
    await addColumn(client, holdListId, col);
  }
  console.log('');

  // 3. AuditLog
  console.log('[3/3] Creating AuditLog...');
  const auditListId = await createList(client, 'AuditLog', 'Reactivation decision audit trail for compliance');
  for (const col of AUDIT_LOG_COLUMNS) {
    await addColumn(client, auditListId, col);
  }
  console.log('');

  console.log('═══════════════════════════════════════════════════════');
  console.log('  ✅ SharePoint setup complete!');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  FinanceLedger  → ${financeListId}`);
  console.log(`  HoldRegistry   → ${holdListId}`);
  console.log(`  AuditLog       → ${auditListId}`);
  console.log('');
}

main().catch((err) => {
  console.error('\n❌ Setup failed:', err.message);
  console.error(err);
  process.exit(1);
});
