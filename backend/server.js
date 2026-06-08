require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { getGraphClient, getAccessToken } = require('./graph-client');

const app = express();
app.use(cors());
app.use(express.json());

const SITE_ID = process.env.SHAREPOINT_SITE_ID;
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;

// ---------------------------------------------------------------------------
// Rate-limit tracker: per requestedBy, sliding window of timestamps
// RIT-POL-004 §4: >3 requests in 10 min from same requestedBy -> block
// ---------------------------------------------------------------------------
const rateLimitMap = new Map(); // requestedBy -> [timestamps]

function isRateLimited(requestedBy) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 minutes
  let timestamps = rateLimitMap.get(requestedBy) || [];
  timestamps = timestamps.filter((t) => now - t < windowMs);
  rateLimitMap.set(requestedBy, timestamps);
  if (timestamps.length >= 3) {
    return true;
  }
  timestamps.push(now);
  rateLimitMap.set(requestedBy, timestamps);
  return false;
}

// ---------------------------------------------------------------------------
// Helper: query SharePoint list items
// ---------------------------------------------------------------------------
async function querySharePointList(siteId, listName, filter) {
  const client = getGraphClient();
  let url = `/sites/${siteId}/lists/${listName}/items?$expand=fields`;
  if (filter) {
    url += `&$filter=${filter}`;
  }
  try {
    const result = await client.api(url).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly').get();
    return (result.value || []).map((item) => ({
      id: item.id,
      ...item.fields
    }));
  } catch (err) {
    console.error(`[SharePoint] Error querying ${listName}:`, err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helper: create SharePoint list item
// ---------------------------------------------------------------------------
async function createSharePointListItem(siteId, listName, fields) {
  const client = getGraphClient();
  const url = `/sites/${siteId}/lists/${listName}/items`;
  try {
    const result = await client.api(url).post({ fields });
    return result;
  } catch (err) {
    console.error(`[SharePoint] Error creating item in ${listName}:`, err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helper: send Adaptive Card to Teams via incoming webhook
// ---------------------------------------------------------------------------
async function sendTeamsCard(webhookUrl, cardPayload) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cardPayload)
    });
    if (!response.ok) {
      const text = await response.text();
      console.error('[Teams] Webhook response error:', response.status, text);
    }
    return response.ok;
  } catch (err) {
    console.error('[Teams] Error sending card:', err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helper: send email via Graph API
// ---------------------------------------------------------------------------
async function sendEmail(fromUserId, toEmail, subject, body) {
  const client = getGraphClient();
  const message = {
    message: {
      subject,
      body: { contentType: 'HTML', content: body },
      toRecipients: [{ emailAddress: { address: toEmail } }]
    },
    saveToSentItems: true
  };
  try {
    await client.api(`/users/${fromUserId}/sendMail`).post(message);
    console.log(`[Email] Sent to ${toEmail}: ${subject}`);
  } catch (err) {
    console.error('[Email] Error sending mail:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Helper: build Teams Adaptive Card payload
// ---------------------------------------------------------------------------
function buildAdaptiveCard(student, finance, holds, reasoning, policyCitation, transactionId) {
  const holdsText = holds.length > 0
    ? holds.map((h) => `• ${h.HoldType} — ${h.HoldStatus} (placed ${h.PlacedDate || 'N/A'})`).join('\n')
    : 'None';

  const paymentPct = finance ? ((finance.AmountPaid / finance.AmountDue) * 100).toFixed(1) : 'N/A';

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: '🎓 Sutradhara — Reactivation Escalation',
              weight: 'Bolder',
              size: 'Large',
              wrap: true
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'Student', value: student.displayName || student.id },
                { title: 'Student ID', value: student.id || 'N/A' },
                { title: 'Email', value: student.userPrincipalName || 'N/A' },
                { title: 'Department', value: student.department || 'N/A' },
                { title: 'Transaction', value: transactionId }
              ]
            },
            {
              type: 'TextBlock',
              text: '**Payment Information**',
              weight: 'Bolder',
              spacing: 'Medium',
              wrap: true
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'Amount Due', value: finance ? `$${finance.AmountDue}` : 'N/A' },
                { title: 'Amount Paid', value: finance ? `$${finance.AmountPaid}` : 'N/A' },
                { title: 'Payment %', value: `${paymentPct}%` },
                { title: 'Receipt', value: finance ? finance.ReceiptNumber : 'N/A' },
                { title: 'Verification', value: finance ? finance.VerificationStatus : 'N/A' }
              ]
            },
            {
              type: 'TextBlock',
              text: '**Holds Summary**',
              weight: 'Bolder',
              spacing: 'Medium',
              wrap: true
            },
            {
              type: 'TextBlock',
              text: holdsText,
              wrap: true
            },
            {
              type: 'TextBlock',
              text: '**Reasoning Trace**',
              weight: 'Bolder',
              spacing: 'Medium',
              wrap: true
            },
            {
              type: 'TextBlock',
              text: reasoning,
              wrap: true
            },
            {
              type: 'TextBlock',
              text: `**Policy:** ${policyCitation}`,
              wrap: true,
              spacing: 'Small'
            }
          ],
          actions: [
            {
              type: 'Action.Submit',
              title: '✅ Approve',
              data: { action: 'approve', studentId: student.id, transactionId }
            },
            {
              type: 'Action.Submit',
              title: '❌ Deny',
              data: { action: 'deny', studentId: student.id, transactionId }
            },
            {
              type: 'Action.Submit',
              title: '⏫ Escalate Further',
              data: { action: 'escalate', studentId: student.id, transactionId }
            }
          ]
        }
      }
    ]
  };
}

// ---------------------------------------------------------------------------
// Helper: create audit log entry
// ---------------------------------------------------------------------------
async function createAuditEntry(fields) {
  return createSharePointListItem(SITE_ID, 'AuditLog', fields);
}

// ===========================================================================
// ROUTES
// ===========================================================================

// ---- Health check ---------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Sutradhara Backend' });
});

// ---- Get student profile + finance + holds --------------------------------
app.get('/api/student/:studentId', async (req, res) => {
  const { studentId } = req.params;
  console.log(`[GET /api/student/${studentId}] Fetching student data...`);

  try {
    const client = getGraphClient();

    // Fetch profile from Entra ID
    let profile;
    try {
      profile = await client
        .api(`/users/${studentId}`)
        .select('id,displayName,userPrincipalName,accountEnabled,department,jobTitle')
        .get();
    } catch (err) {
      console.error('[Graph] Error fetching user profile:', err.message);
      profile = null;
    }

    // Fetch finance records from SharePoint
    const finance = await querySharePointList(
      SITE_ID,
      'FinanceLedger',
      `fields/StudentID eq '${studentId}'`
    );

    // Fetch holds from SharePoint
    const holds = await querySharePointList(
      SITE_ID,
      'HoldRegistry',
      `fields/StudentID eq '${studentId}'`
    );

    if (!profile) {
      return res.status(404).json({
        error: 'Student not found',
        studentId,
        finance,
        holds
      });
    }

    res.json({ profile, finance, holds });
  } catch (err) {
    console.error('[GET /api/student] Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// ---- Reactivation request -------------------------------------------------
app.post('/api/reactivate', async (req, res) => {
  const { studentId, receiptNumber, requestedBy } = req.body;
  console.log(`[POST /api/reactivate] studentId=${studentId} receipt=${receiptNumber} requestedBy=${requestedBy}`);

  if (!studentId || !requestedBy) {
    return res.status(400).json({ error: 'studentId and requestedBy are required' });
  }

  // RIT-POL-004 §4 — rate limiting
  if (isRateLimited(requestedBy)) {
    console.warn(`[RateLimit] Blocked request from ${requestedBy}`);
    return res.status(429).json({
      error: 'Rate limit exceeded',
      detail: 'More than 3 reactivation requests in 10 minutes from the same requester.',
      policyCitation: 'RIT-POL-004 §4'
    });
  }

  const transactionId = uuidv4();

  try {
    const client = getGraphClient();

    // 1. Fetch student profile
    let profile;
    try {
      profile = await client
        .api(`/users/${studentId}`)
        .select('id,displayName,userPrincipalName,accountEnabled,department,jobTitle')
        .get();
    } catch (err) {
      return res.status(404).json({ error: 'Student not found in directory', details: err.message });
    }

    // 2. Fetch finance record
    const financeRecords = await querySharePointList(
      SITE_ID,
      'FinanceLedger',
      `fields/StudentID eq '${studentId}'`
    );
    const finance = financeRecords.length > 0 ? financeRecords[0] : null;

    // 3. Fetch holds
    const holds = await querySharePointList(
      SITE_ID,
      'HoldRegistry',
      `fields/StudentID eq '${studentId}'`
    );

    // 4. Run Sutradhara reasoning engine
    const reasoningTrace = [];
    let decision = null; // 'APPROVE_FULL' | 'APPROVE_PARTIAL' | 'DENY' | 'ESCALATE'
    let policyCitation = '';
    const today = new Date();

    // 4a. Check for blocking holds
    const activeHolds = holds.filter((h) => h.HoldStatus === 'Active');
    const investigationHold = activeHolds.find((h) => h.HoldType === 'Investigation');
    const integrityHoldActive = activeHolds.find((h) => h.HoldType === 'AcademicIntegrity');

    // Check for expired AcademicIntegrity holds
    const integrityHoldExpired = holds.find(
      (h) => h.HoldType === 'AcademicIntegrity' && h.ExpiryDate && new Date(h.ExpiryDate) < today
    );

    if (investigationHold) {
      reasoningTrace.push('Active Investigation hold found — reactivation DENIED per policy.');
      decision = 'DENY';
      policyCitation = 'RIT-POL-003 §3: Active Investigation hold blocks reactivation';
    } else if (integrityHoldActive && !integrityHoldExpired) {
      reasoningTrace.push('Active AcademicIntegrity hold found (not expired) — reactivation DENIED per policy.');
      decision = 'DENY';
      policyCitation = 'RIT-POL-003 §3: Active AcademicIntegrity hold blocks reactivation';
    } else {
      if (integrityHoldExpired) {
        reasoningTrace.push(
          `AcademicIntegrity hold exists but expired on ${integrityHoldExpired.ExpiryDate} — treating as expired per RIT-POL-003 §4. Proceeding.`
        );
      }

      // 4b. Evaluate payment
      if (!finance) {
        reasoningTrace.push('No finance record found for this student.');
        decision = 'DENY';
        policyCitation = 'No payment record on file';
      } else {
        const percentage = (finance.AmountPaid / finance.AmountDue) * 100;
        reasoningTrace.push(`Payment: $${finance.AmountPaid} / $${finance.AmountDue} = ${percentage.toFixed(1)}%`);

        // Check for other active blocking holds (Financial, Probation, Administrative)
        const otherBlockingHolds = activeHolds.filter(
          (h) => h.HoldType !== 'AcademicIntegrity' && h.HoldType !== 'Investigation'
        );

        if (percentage >= 100 && otherBlockingHolds.length === 0) {
          reasoningTrace.push('Full payment verified, no blocking holds — APPROVE FULL reactivation.');
          decision = 'APPROVE_FULL';
          policyCitation = 'RIT-POL-001 §6.3: Full payment, no holds → standard reactivation';
        } else if (percentage >= 100 && otherBlockingHolds.length > 0) {
          reasoningTrace.push(
            `Full payment verified but ${otherBlockingHolds.length} other active hold(s) present — ESCALATE for review.`
          );
          decision = 'ESCALATE';
          policyCitation = 'RIT-POL-001 §7.2: Full payment with active holds → escalation required';
        } else if (percentage >= 80) {
          reasoningTrace.push(
            `Payment >= 80% but < 100% (${percentage.toFixed(1)}%) — APPROVE PARTIAL (core courses only), escalating for IT approval.`
          );
          decision = 'ESCALATE';
          policyCitation = 'RIT-POL-001 §7.2: Payment ≥ 80% → partial access (escalate for IT approval)';
        } else {
          // percentage < 80
          const hardshipFlag = finance.Notes && finance.Notes.toLowerCase().includes('hardship');
          if (hardshipFlag) {
            reasoningTrace.push(
              `Payment < 80% (${percentage.toFixed(1)}%) but hardship flag detected — ESCALATE for 72hr temporary access.`
            );
            decision = 'ESCALATE';
            policyCitation = 'RIT-POL-005 §2: Payment < 80% with hardship flag → 72hr temporary access (escalate)';
          } else {
            reasoningTrace.push(
              `Payment < 80% (${percentage.toFixed(1)}%) and no hardship flag — DENY reactivation.`
            );
            decision = 'DENY';
            policyCitation = 'RIT-POL-001 §7.2: Insufficient payment without hardship provision';
          }
        }
      }
    }

    // 5. Execute decision
    const reasoningText = reasoningTrace.join(' | ');

    if (decision === 'APPROVE_FULL') {
      // Enable the account
      await client.api(`/users/${studentId}`).patch({ accountEnabled: true });
      reasoningTrace.push('Account re-enabled in Entra ID.');

      // Create audit log
      await createAuditEntry({
        StudentID: studentId,
        RequestedBy: requestedBy,
        ApprovedBy: 'Sutradhara-Auto',
        Action: 'Reactivate',
        PolicyCitation: policyCitation,
        ReasoningTrace: reasoningText,
        ExecutionStatus: 'Executed',
        ReceiptNumber: receiptNumber || '',
        TransactionId: transactionId
      });

      // Send confirmation email
      await sendEmail(
        requestedBy,
        profile.userPrincipalName,
        'Account Reactivated — Sutradhara',
        `<h2>Your account has been reactivated</h2>
         <p>Dear ${profile.displayName},</p>
         <p>Your student account has been successfully reactivated following verification of full payment.</p>
         <p><strong>Transaction ID:</strong> ${transactionId}</p>
         <p><strong>Policy:</strong> ${policyCitation}</p>
         <p><strong>Receipt:</strong> ${receiptNumber || 'N/A'}</p>
         <p>If you have questions, please contact the registrar's office.</p>
         <p>— Sutradhara Automated Agent</p>`
      );

      return res.json({
        status: 'approved',
        decision: 'approve',
        transactionId,
        studentId,
        displayName: profile.displayName,
        approvedBy: 'Sutradhara-Auto',
        reasoningTrace: reasoningText,
        policyCitation,
        message: 'Account has been reactivated successfully.'
      });
    }

    if (decision === 'DENY') {
      // Create audit log
      await createAuditEntry({
        StudentID: studentId,
        RequestedBy: requestedBy,
        ApprovedBy: '',
        Action: 'Deny',
        PolicyCitation: policyCitation,
        ReasoningTrace: reasoningText,
        ExecutionStatus: 'Denied',
        ReceiptNumber: receiptNumber || '',
        TransactionId: transactionId
      });

      return res.json({
        status: 'denied',
        decision: 'deny',
        transactionId,
        studentId,
        displayName: profile.displayName,
        approvedBy: '',
        reasoningTrace: reasoningText,
        policyCitation,
        message: 'Reactivation denied based on policy evaluation.'
      });
    }

    if (decision === 'ESCALATE') {
      // Create audit log with Pending status
      await createAuditEntry({
        StudentID: studentId,
        RequestedBy: requestedBy,
        ApprovedBy: '',
        Action: 'Escalate',
        PolicyCitation: policyCitation,
        ReasoningTrace: reasoningText,
        ExecutionStatus: 'Pending',
        ReceiptNumber: receiptNumber || '',
        TransactionId: transactionId
      });

      // Send Adaptive Card to Teams
      const card = buildAdaptiveCard(
        profile,
        finance,
        holds,
        reasoningText,
        policyCitation,
        transactionId
      );

      const cardSent = await sendTeamsCard(TEAMS_WEBHOOK_URL, card);

      return res.json({
        status: 'escalated',
        decision: 'escalate',
        transactionId,
        studentId,
        displayName: profile.displayName,
        approvedBy: '',
        reasoningTrace: reasoningText,
        policyCitation,
        teamsNotification: cardSent ? 'sent' : 'failed',
        message: 'Request has been escalated to an administrator for review.'
      });
    }

    // Fallback (should not reach here)
    return res.status(500).json({ error: 'Unexpected decision state', reasoningTrace });
  } catch (err) {
    console.error('[POST /api/reactivate] Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// ---- Approve/Deny callback from Teams or admin UI -------------------------
app.post('/api/approve-callback', async (req, res) => {
  const { studentId, transactionId, approvedBy, action } = req.body;
  console.log(`[POST /api/approve-callback] studentId=${studentId} action=${action} approvedBy=${approvedBy}`);

  if (!studentId || !transactionId || !approvedBy || !action) {
    return res.status(400).json({ error: 'studentId, transactionId, approvedBy, and action are required' });
  }

  try {
    const client = getGraphClient();

    if (action === 'approve') {
      // Enable the account
      await client.api(`/users/${studentId}`).patch({ accountEnabled: true });
      console.log(`[Callback] Account ${studentId} enabled by ${approvedBy}`);

      // Update audit log — find the pending entry and update it
      const auditRecords = await querySharePointList(
        SITE_ID,
        'AuditLog',
        `fields/TransactionId eq '${transactionId}'`
      );

      if (auditRecords.length > 0) {
        const auditItemId = auditRecords[0].id;
        await client.api(`/sites/${SITE_ID}/lists/AuditLog/items/${auditItemId}/fields`).patch({
          ApprovedBy: approvedBy,
          ExecutionStatus: 'Approved',
          Action: 'Reactivate'
        });
      }

      // Send confirmation email
      let profile;
      try {
        profile = await client
          .api(`/users/${studentId}`)
          .select('displayName,userPrincipalName')
          .get();
      } catch (e) {
        profile = { displayName: studentId, userPrincipalName: '' };
      }

      if (profile.userPrincipalName) {
        await sendEmail(
          approvedBy,
          profile.userPrincipalName,
          'Account Reactivated (Manual Approval) — Sutradhara',
          `<h2>Your account has been reactivated</h2>
           <p>Dear ${profile.displayName},</p>
           <p>Your student account has been manually approved and reactivated by an administrator.</p>
           <p><strong>Transaction ID:</strong> ${transactionId}</p>
           <p><strong>Approved By:</strong> ${approvedBy}</p>
           <p>If you have questions, please contact the registrar's office.</p>
           <p>— Sutradhara Automated Agent</p>`
        );
      }

      return res.json({
        status: 'approved',
        transactionId,
        studentId,
        approvedBy,
        message: 'Account reactivated and audit log updated.'
      });
    }

    if (action === 'deny') {
      // Update audit log
      const auditRecords = await querySharePointList(
        SITE_ID,
        'AuditLog',
        `fields/TransactionId eq '${transactionId}'`
      );

      if (auditRecords.length > 0) {
        const auditItemId = auditRecords[0].id;
        await client.api(`/sites/${SITE_ID}/lists/AuditLog/items/${auditItemId}/fields`).patch({
          ApprovedBy: approvedBy,
          ExecutionStatus: 'Denied',
          Action: 'Deny'
        });
      }

      return res.json({
        status: 'denied',
        transactionId,
        studentId,
        approvedBy,
        message: 'Reactivation denied. Audit log updated.'
      });
    }

    if (action === 'escalate') {
      // Update audit log with further escalation
      const auditRecords = await querySharePointList(
        SITE_ID,
        'AuditLog',
        `fields/TransactionId eq '${transactionId}'`
      );

      if (auditRecords.length > 0) {
        const auditItemId = auditRecords[0].id;
        await client.api(`/sites/${SITE_ID}/lists/AuditLog/items/${auditItemId}/fields`).patch({
          ApprovedBy: approvedBy,
          ExecutionStatus: 'Pending',
          Action: 'Escalate',
          ReasoningTrace: `Further escalated by ${approvedBy} on ${new Date().toISOString()}`
        });
      }

      return res.json({
        status: 'escalated',
        transactionId,
        studentId,
        approvedBy,
        message: 'Request further escalated. Audit log updated.'
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}. Must be approve, deny, or escalate.` });
  } catch (err) {
    console.error('[POST /api/approve-callback] Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// ===========================================================================
// Start server
// ===========================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🎭 Sutradhara Backend running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});
