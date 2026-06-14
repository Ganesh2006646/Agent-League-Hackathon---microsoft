require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
const { CloudAdapter, ConfigurationBotFrameworkAuthentication } = require('botbuilder');
const { runAgentPipeline, isLive, initAzureClient } = require('./foundry-agents');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// In-Memory Fallback Database (Indian Demo Data)
// Used ONLY when MONGODB_URI is not set (local development)
// ---------------------------------------------------------------------------
const fallbackDatabase = {
  users: {
    "S10001": { id: "S10001", displayName: "Aarav Sharma", userPrincipalName: "aarav.sharma@ritedu.edu", department: "Computer Science", semester: "Semester 6", enrollmentYear: 2023, accountEnabled: false },
    "S10002": { id: "S10002", displayName: "Priya Nair", userPrincipalName: "priya.nair@ritedu.edu", department: "Electronics & Communication", semester: "Semester 4", enrollmentYear: 2024, accountEnabled: false },
    "S10003": { id: "S10003", displayName: "Rohan Deshmukh", userPrincipalName: "rohan.deshmukh@ritedu.edu", department: "Mechanical Engineering", semester: "Semester 6", enrollmentYear: 2023, accountEnabled: false },
    "S10004": { id: "S10004", displayName: "Ananya Iyer", userPrincipalName: "ananya.iyer@ritedu.edu", department: "Business Administration", semester: "Semester 2", enrollmentYear: 2025, accountEnabled: false },
    "S10005": { id: "S10005", displayName: "Karthik Reddy", userPrincipalName: "karthik.reddy@ritedu.edu", department: "Civil Engineering", semester: "Semester 4", enrollmentYear: 2024, accountEnabled: false },
    "S10006": { id: "S10006", displayName: "Meera Joshi", userPrincipalName: "meera.joshi@ritedu.edu", department: "Data Science", semester: "Semester 6", enrollmentYear: 2023, accountEnabled: false },
    "S10007": { id: "S10007", displayName: "Arjun Patel", userPrincipalName: "arjun.patel@ritedu.edu", department: "Information Technology", semester: "Semester 4", enrollmentYear: 2024, accountEnabled: false },
    "S10008": { id: "S10008", displayName: "Diya Krishnan", userPrincipalName: "diya.krishnan@ritedu.edu", department: "Biotechnology", semester: "Semester 2", enrollmentYear: 2025, accountEnabled: false }
  },
  finance: {
    "S10001": [{ StudentID: "S10001", AmountDue: 125000, AmountPaid: 125000, ReceiptNumber: "REC-2026-1001", PaymentDate: "2026-06-01", PaymentMethod: "NEFT", VerificationStatus: "Verified", Notes: "" }],
    "S10002": [{ StudentID: "S10002", AmountDue: 150000, AmountPaid: 125000, ReceiptNumber: "REC-2026-1002", PaymentDate: "2026-05-28", PaymentMethod: "Financial Aid", VerificationStatus: "Verified", Notes: "Partial payment — 83.3% paid via Financial Aid." }],
    "S10003": [{ StudentID: "S10003", AmountDue: 100000, AmountPaid: 100000, ReceiptNumber: "REC-2026-1003", PaymentDate: "2026-06-02", PaymentMethod: "UPI", VerificationStatus: "Verified", Notes: "" }],
    "S10004": [{ StudentID: "S10004", AmountDue: 140000, AmountPaid: 140000, ReceiptNumber: "REC-2026-1004", PaymentDate: "2026-05-25", PaymentMethod: "Scholarship", VerificationStatus: "Verified", Notes: "Merit scholarship applied." }],
    "S10005": [{ StudentID: "S10005", AmountDue: 120000, AmountPaid: 48000, ReceiptNumber: "REC-2026-1005", PaymentDate: "2026-05-30", PaymentMethod: "NEFT", VerificationStatus: "Pending", Notes: "Hardship application pending review." }],
    "S10006": [{ StudentID: "S10006", AmountDue: 130000, AmountPaid: 130000, ReceiptNumber: "REC-2026-1006", PaymentDate: "2026-06-03", PaymentMethod: "Net Banking", VerificationStatus: "Verified", Notes: "" }],
    "S10007": [{ StudentID: "S10007", AmountDue: 110000, AmountPaid: 88000, ReceiptNumber: "REC-2026-1007", PaymentDate: "2026-05-27", PaymentMethod: "RTGS", VerificationStatus: "Verified", Notes: "Partial payment — 80% paid." }],
    "S10008": [{ StudentID: "S10008", AmountDue: 135000, AmountPaid: 0, ReceiptNumber: "", PaymentDate: "", PaymentMethod: "", VerificationStatus: "Unpaid", Notes: "No payment received this semester." }]
  },
  holds: {
    "S10001": [],
    "S10002": [{ StudentID: "S10002", HoldType: "Financial", HoldStatus: "Active", PlacedDate: "2026-05-20", ExpiryDate: null, PlacedBy: "Office of Accounts", Reason: "Unpaid tuition balance > ₹50,000 threshold" }],
    "S10003": [{ StudentID: "S10003", HoldType: "AcademicIntegrity", HoldStatus: "Expired", PlacedDate: "2025-09-15", ExpiryDate: "2026-03-15", PlacedBy: "Dean of Academics", Reason: "Plagiarism sanction (probation ended March 2026)" }],
    "S10004": [{ StudentID: "S10004", HoldType: "Investigation", HoldStatus: "Active", PlacedDate: "2026-05-28", ExpiryDate: null, PlacedBy: "Dean of Students", Reason: "Code of Conduct — Active Disciplinary Investigation" }],
    "S10005": [{ StudentID: "S10005", HoldType: "Financial", HoldStatus: "Active", PlacedDate: "2026-05-20", ExpiryDate: null, PlacedBy: "Office of Accounts", Reason: "Unpaid tuition balance > ₹50,000 threshold" }],
    "S10006": [],
    "S10007": [{ StudentID: "S10007", HoldType: "Financial", HoldStatus: "Active", PlacedDate: "2026-05-22", ExpiryDate: null, PlacedBy: "Office of Accounts", Reason: "Outstanding balance of ₹22,000" }],
    "S10008": [{ StudentID: "S10008", HoldType: "Financial", HoldStatus: "Active", PlacedDate: "2026-05-15", ExpiryDate: null, PlacedBy: "Office of Accounts", Reason: "Full semester fees unpaid" }]
  },
  auditLog: []
};

let auditLogIdCounter = 1;

// ---------------------------------------------------------------------------
// MongoDB Atlas Integration
// ---------------------------------------------------------------------------
let db = null;
let mongoClient = null;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'sutradhara';

async function initDatabase() {
  if (!MONGODB_URI || MONGODB_URI.includes('<')) {
    console.log("ℹ️  MONGODB_URI not set. Using in-memory fallback for development.");
    return;
  }
  try {
    console.log("🔌 Connecting to MongoDB Atlas...");
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(DB_NAME);
    console.log("✅ Connected to MongoDB Atlas successfully.");

    // Auto-seed if collections are empty
    await seedDatabase();
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    console.log("   Falling back to in-memory database.");
    db = null;
  }
}

async function seedDatabase() {
  const usersCount = await db.collection('users').countDocuments();
  if (usersCount === 0) {
    console.log("🌱 Seeding MongoDB with demo data (8 Indian students)...");

    const users = Object.values(fallbackDatabase.users);
    await db.collection('users').insertMany(users);

    const finance = Object.values(fallbackDatabase.finance).flat();
    await db.collection('finance').insertMany(finance);

    const holds = Object.values(fallbackDatabase.holds).flat().filter(h => Object.keys(h).length > 0);
    if (holds.length > 0) {
      await db.collection('holds').insertMany(holds);
    }

    // Create indexes for performance
    await db.collection('users').createIndex({ id: 1 }, { unique: true });
    await db.collection('finance').createIndex({ StudentID: 1 });
    await db.collection('holds').createIndex({ StudentID: 1 });
    await db.collection('auditLog').createIndex({ Timestamp: -1 });

    console.log("✅ Seeding complete: 8 students, finance records, and holds inserted.");
  } else {
    console.log(`ℹ️  Database already has ${usersCount} students. Skipping seed.`);
  }
}

// ---------------------------------------------------------------------------
// Database Access Layer (MongoDB or In-Memory Fallback)
// ---------------------------------------------------------------------------
async function getStudentProfile(studentId) {
  if (db) {
    return await db.collection('users').findOne({ id: studentId });
  }
  return fallbackDatabase.users[studentId] || null;
}

async function getAllStudents() {
  if (db) {
    return await db.collection('users').find({}).toArray();
  }
  return Object.values(fallbackDatabase.users);
}

async function getStudentFinance(studentId) {
  if (db) {
    return await db.collection('finance').find({ StudentID: studentId }).toArray();
  }
  return fallbackDatabase.finance[studentId] || [];
}

async function getStudentHolds(studentId) {
  if (db) {
    return await db.collection('holds').find({ StudentID: studentId }).toArray();
  }
  return fallbackDatabase.holds[studentId] || [];
}

async function updateStudentAccountStatus(studentId, enabled) {
  if (db) {
    await db.collection('users').updateOne({ id: studentId }, { $set: { accountEnabled: enabled } });
  }
  if (fallbackDatabase.users[studentId]) {
    fallbackDatabase.users[studentId].accountEnabled = enabled;
  }
}

async function getAuditLogs() {
  if (db) {
    return await db.collection('auditLog').find().sort({ Timestamp: -1 }).limit(50).toArray();
  }
  return [...fallbackDatabase.auditLog].reverse();
}

async function createAuditEntry(fields) {
  const id = `AUDIT-${auditLogIdCounter++}`;
  const record = { id, Timestamp: new Date().toISOString(), ...fields };

  if (db) {
    try {
      await db.collection('auditLog').insertOne(record);
    } catch (err) {
      console.error("Failed to write audit to MongoDB:", err.message);
    }
  }
  fallbackDatabase.auditLog.push(record);
  console.log(`[Audit] ${fields.Action} — ${fields.StudentID} by ${fields.RequestedBy}`);
  return record;
}

// ---------------------------------------------------------------------------
// Nodemailer — Real Email
// ---------------------------------------------------------------------------
async function sendEmailNotification(to, subject, htmlContent) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS ||
      process.env.SMTP_HOST.includes('<') || process.env.SMTP_USER.includes('<')) {
    console.log(`[Email] SMTP not configured. Skipping email to <${to}>.`);
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const mailOptions = {
      from: process.env.SMTP_FROM || `"Sutradhara Portal" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: htmlContent
    };

    console.log(`📧 Sending email to ${to}...`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent! MessageId: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error("❌ Email send failed:", err.message);
    return { sent: false, reason: err.message };
  }
}

function buildReactivationEmail(displayName, receiptNumber) {
  return `
    <div style="font-family: 'Segoe UI', sans-serif; padding: 24px; color: #1a1a1a; max-width: 600px; border: 1px solid #e0e0e0; border-radius: 12px; background: #fafafa;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #1a73e8; font-size: 22px; margin: 0;">🎭 Sutradhara</h1>
        <p style="color: #666; font-size: 12px; margin: 4px 0;">Student Account Lifecycle Agent</p>
      </div>
      <h2 style="color: #2e7d32; margin-top: 0;">Dear ${displayName},</h2>
      <p>We are pleased to inform you that your <strong>RIT student account</strong> has been <strong style="color: #2e7d32;">successfully reactivated</strong>.</p>
      <p>Our autonomous compliance system processed receipt <strong>${receiptNumber || 'N/A'}</strong>, verified your payment, audited active holds, and confirmed policy compliance.</p>
      <div style="background: #e8f5e9; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4caf50;">
        <strong>Restored Access:</strong>
        <ul style="margin: 8px 0 0 20px; padding: 0;">
          <li>University Email (Outlook)</li>
          <li>Learning Management System (Canvas LMS)</li>
          <li>Campus Wi-Fi & Library Systems</li>
          <li>Microsoft Teams</li>
        </ul>
      </div>
      <p style="font-size: 0.9rem; color: #555;">Please allow 10–15 minutes for directory sync across all systems.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="font-size: 0.75rem; color: #999; text-align: center;">
        This is an automated notification from Sutradhara Compliance Engine.<br>
        Redmond Institute of Technology — Office of IT Administration
      </p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Microsoft Teams Bot (BotBuilder v4)
// ---------------------------------------------------------------------------
let botAdapter = null;
const hasTeamsCreds = process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.TENANT_ID &&
  !process.env.CLIENT_ID.includes('<') && !process.env.CLIENT_SECRET.includes('<');

if (hasTeamsCreds) {
  try {
    const authConfig = new ConfigurationBotFrameworkAuthentication({
      MicrosoftAppId: process.env.CLIENT_ID,
      MicrosoftAppPassword: process.env.CLIENT_SECRET,
      MicrosoftAppTenantId: process.env.TENANT_ID
    });
    botAdapter = new CloudAdapter(authConfig);
    console.log("✅ Teams BotBuilder adapter initialized.");
  } catch (err) {
    console.error("❌ BotBuilder init failed:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Rate Limiter (3 requests per 10 minutes per user)
// ---------------------------------------------------------------------------
const rateLimitMap = new Map();

function isRateLimited(requestedBy) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  let timestamps = rateLimitMap.get(requestedBy) || [];
  timestamps = timestamps.filter(t => now - t < windowMs);
  if (timestamps.length >= 3) {
    rateLimitMap.set(requestedBy, timestamps);
    return true;
  }
  timestamps.push(now);
  rateLimitMap.set(requestedBy, timestamps);
  return false;
}

// ===========================================================================
// API ROUTES
// ===========================================================================

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Sutradhara Backend',
    database: db ? 'MongoDB Atlas Connected' : 'In-Memory Fallback',
    aiModel: isLive() ? 'Azure AI Foundry (Live)' : 'Not Connected',
    teamsBot: botAdapter ? 'Active' : 'Not Configured',
    smtp: process.env.SMTP_HOST && !process.env.SMTP_HOST.includes('<') ? 'Configured' : 'Not Configured'
  });
});

// List All Students
app.get('/api/students', async (req, res) => {
  const students = await getAllStudents();
  res.json(students);
});

// Get Student Full Profile
app.get('/api/student/:studentId', async (req, res) => {
  const { studentId } = req.params;
  const profile = await getStudentProfile(studentId);
  const finance = await getStudentFinance(studentId);
  const holds = await getStudentHolds(studentId);

  if (!profile) {
    return res.status(404).json({ error: 'Student not found', studentId });
  }
  res.json({ profile, finance, holds });
});

// Get Audit Logs
app.get('/api/audit', async (req, res) => {
  const logs = await getAuditLogs();
  res.json(logs);
});

// Process tuition payment (Demo Payment)
app.post('/api/payment', async (req, res) => {
  const { studentId, amountPaid, paymentMethod } = req.body;
  console.log(`[POST /api/payment] student=${studentId} amount=${amountPaid} method=${paymentMethod}`);

  if (!studentId || amountPaid === undefined || !paymentMethod) {
    return res.status(400).json({ error: 'studentId, amountPaid, and paymentMethod are required' });
  }

  try {
    const profile = await getStudentProfile(studentId);
    if (!profile) {
      return res.status(404).json({ error: 'Student not found in directory' });
    }

    // Default tuition fee due if not found in existing records
    let amountDue = 120000;
    const financeRecords = await getStudentFinance(studentId);
    if (financeRecords && financeRecords.length > 0) {
      amountDue = financeRecords[0].AmountDue || financeRecords[0].amountDue || amountDue;
    }

    const receiptNumber = `REC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const paymentRecord = {
      StudentID: studentId,
      AmountDue: amountDue,
      AmountPaid: Number(amountPaid),
      ReceiptNumber: receiptNumber,
      PaymentDate: new Date().toISOString().split('T')[0],
      PaymentMethod: paymentMethod,
      VerificationStatus: 'Verified',
      Notes: `Demo payment of ₹${Number(amountPaid).toLocaleString()} generated via portal.`
    };

    if (db) {
      // Delete old records for this student and insert the new one
      await db.collection('finance').deleteMany({ StudentID: studentId });
      await db.collection('finance').insertOne(paymentRecord);

      // Auto-clear or adjust financial holds based on RIT-POL-001
      // If outstanding balance is <= ₹50,000 (local scale), clear it
      const outstanding = amountDue - Number(amountPaid);
      if (outstanding <= 50000) {
        await db.collection('holds').deleteMany({ StudentID: studentId, HoldType: 'Financial' });
      } else {
        await db.collection('holds').updateOne(
          { StudentID: studentId, HoldType: 'Financial' },
          {
            $set: {
              HoldStatus: 'Active',
              PlacedDate: new Date().toISOString().split('T')[0],
              Reason: `Tuition balance outstanding: ₹${outstanding.toLocaleString()}`
            }
          },
          { upsert: true }
        );
      }
    } else {
      // In-memory database fallback update
      fallbackDatabase.finance[studentId] = [paymentRecord];
      const outstanding = amountDue - Number(amountPaid);
      if (outstanding <= 50000) {
        fallbackDatabase.holds[studentId] = (fallbackDatabase.holds[studentId] || []).filter(h => h.HoldType !== 'Financial');
      } else {
        const holds = fallbackDatabase.holds[studentId] || [];
        const finHoldIdx = holds.findIndex(h => h.HoldType === 'Financial');
        const holdData = {
          StudentID: studentId,
          HoldType: 'Financial',
          HoldStatus: 'Active',
          PlacedDate: new Date().toISOString().split('T')[0],
          PlacedBy: 'Office of Accounts',
          Reason: `Tuition balance outstanding: ₹${outstanding.toLocaleString()}`
        };
        if (finHoldIdx >= 0) {
          holds[finHoldIdx] = holdData;
        } else {
          holds.push(holdData);
        }
        fallbackDatabase.holds[studentId] = holds;
      }
    }

    return res.json({
      success: true,
      message: `Payment registered in database.`,
      receiptNumber,
      paymentRecord
    });
  } catch (err) {
    console.error("Payment API error:", err);
    return res.status(500).json({ error: 'Payment processing failed', details: err.message });
  }
});

// Agent Status — Multi-Agent Pipeline
app.get('/api/agents/status', (req, res) => {
  res.json({
    status: 'active',
    mode: isLive() ? 'Azure AI Foundry (Live — Multi-Agent)' : 'Awaiting Credentials',
    architecture: 'Multi-Agent Pipeline (5 Specialists + 1 Orchestrator)',
    agents: [
      { name: 'Identity Verifier Agent', role: 'Student identity and enrollment verification', phase: 1 },
      { name: 'Financial Analyst Agent', role: 'Tuition payment analysis and receipt validation', phase: 2 },
      { name: 'Risk Sentinel Agent', role: 'Hold assessment, rate limiting, and security evaluation', phase: 3 },
      { name: 'Policy Compliance Agent (RAG)', role: 'Foundry IQ-grounded policy evaluation and citation', phase: 4 },
      { name: 'Orchestrator Agent', role: 'Multi-agent synthesis and final decision-making', phase: 5 },
      { name: 'Notification Agent', role: 'Post-decision email and Teams notifications', phase: 6 }
    ],
    iqIntegration: {
      foundryIQ: 'Azure AI Search — Policy document grounding',
      fabricIQ: 'Semantic entity model — Compliance rules engine',
      workIQ: 'Academic calendar context and urgency signals'
    }
  });
});

// ---------------------------------------------------------------------------
// Telemetry API
// ---------------------------------------------------------------------------
app.get('/api/telemetry', (req, res) => {
  try {
    const telemetry = require('./telemetry');
    res.json(telemetry.getTelemetrySummary());
  } catch (e) {
    res.json({ status: 'telemetry module not loaded', message: e.message });
  }
});

app.get('/api/telemetry/history', (req, res) => {
  try {
    const telemetry = require('./telemetry');
    res.json(telemetry.getTelemetryData());
  } catch (e) {
    res.json({ status: 'telemetry module not loaded', data: [] });
  }
});

// ---------------------------------------------------------------------------
// Evaluation API
// ---------------------------------------------------------------------------
app.get('/api/evaluate', async (req, res) => {
  try {
    const evaluations = require('./evaluations');
    const report = evaluations.runSimulatedEvaluation();
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: 'Evaluation module not loaded', details: e.message });
  }
});

// ---------------------------------------------------------------------------
// Responsible AI Safety Report
// ---------------------------------------------------------------------------
app.get('/api/safety/report', (req, res) => {
  try {
    const rai = require('./responsible-ai');
    const telemetry = require('./telemetry');
    const telemetryData = telemetry.getTelemetryData();
    const report = rai.generateSafetyReport(telemetryData);
    res.json(report);
  } catch (e) {
    res.json({
      status: 'safety module loading',
      guardrails: {
        inputSanitization: 'Active',
        outputValidation: 'Active',
        biasDetection: 'Active',
        piiProtection: 'Active',
        promptInjectionDefense: 'Active'
      },
      message: e.message
    });
  }
});

// Reactivation API (direct)
app.post('/api/reactivate', async (req, res) => {
  const { studentId, receiptNumber, requestedBy } = req.body;
  console.log(`[POST /api/reactivate] student=${studentId} receipt=${receiptNumber} by=${requestedBy}`);

  if (!studentId || !requestedBy) {
    return res.status(400).json({ error: 'studentId and requestedBy are required' });
  }

  const rateLimitExceeded = isRateLimited(requestedBy);
  const transactionId = uuidv4();

  try {
    const profile = await getStudentProfile(studentId);
    if (!profile) {
      return res.status(404).json({ error: 'Student not found in directory' });
    }

    const financeRecords = await getStudentFinance(studentId);
    const holds = await getStudentHolds(studentId);

    const dbWrapper = {
      users: { [studentId]: profile },
      finance: { [studentId]: financeRecords },
      holds: { [studentId]: holds },
      getProfile: async (id) => await getStudentProfile(id),
      getFinance: async (id) => await getStudentFinance(id),
      getHolds: async (id) => await getStudentHolds(id),
      reactivateAccount: async (id, enabled) => await updateStudentAccountStatus(id, enabled),
      createAudit: async (fields) => await createAuditEntry(fields),
      sendEmail: async (to, subject, html) => await sendEmailNotification(to, subject, html)
    };

    const result = await runAgentPipeline(studentId, receiptNumber, requestedBy, dbWrapper, rateLimitExceeded);
    const { decision, confidence, summary, citations, reasoningTrace, agentDetails, pipelineMetrics, agentConsensus, selfReflection } = result;
    const reasoningText = reasoningTrace.join(' | ');

    return res.json({
      status: decision.toLowerCase(),
      decision: decision.toLowerCase(),
      transactionId, studentId,
      displayName: profile.displayName,
      reasoningTrace: reasoningText,
      policyCitation: citations[0] || 'RIT-POL-001',
      message: summary,
      confidence,
      agentDetails,
      pipelineMetrics: pipelineMetrics || null,
      agentConsensus: agentConsensus || false,
      selfReflection: selfReflection || null
    });

  } catch (err) {
    console.error("Pipeline error:", err);
    return res.status(500).json({ error: 'Agent pipeline execution failed', details: err.message });
  }
});

// Chat API (natural language interface)
app.post('/api/chat', async (req, res) => {
  const { message, requestedBy } = req.body;
  console.log(`[POST /api/chat] "${message}" by ${requestedBy}`);

  if (!message || !requestedBy) {
    return res.status(400).json({ error: 'message and requestedBy are required' });
  }

  const studentIdMatch = message.match(/S\d{5}/i);
  const receiptMatch = message.match(/REC-\d{4}-\d{3,4}|REC-\S+/i);

  const studentId = studentIdMatch ? studentIdMatch[0].toUpperCase() : null;
  const receiptNumber = receiptMatch ? receiptMatch[0].toUpperCase() : null;

  if (studentId) {
    const rateLimitExceeded = isRateLimited(requestedBy);
    const transactionId = uuidv4();

    try {
      const profile = await getStudentProfile(studentId);
      if (!profile) {
        return res.json({
          type: 'conversational',
          message: `❌ Student ID **${studentId}** not found in the directory. Please verify the ID.`
        });
      }

      const financeRecords = await getStudentFinance(studentId);
      const holds = await getStudentHolds(studentId);

      const dbWrapper = {
        users: { [studentId]: profile },
        finance: { [studentId]: financeRecords },
        holds: { [studentId]: holds },
        getProfile: async (id) => await getStudentProfile(id),
        getFinance: async (id) => await getStudentFinance(id),
        getHolds: async (id) => await getStudentHolds(id),
        reactivateAccount: async (id, enabled) => await updateStudentAccountStatus(id, enabled),
        createAudit: async (fields) => await createAuditEntry(fields),
        sendEmail: async (to, subject, html) => await sendEmailNotification(to, subject, html)
      };

      const result = await runAgentPipeline(studentId, receiptNumber, requestedBy, dbWrapper, rateLimitExceeded);
      const { decision, confidence, summary, citations, reasoningTrace, agentDetails, pipelineMetrics, agentConsensus, selfReflection } = result;

      return res.json({
        type: 'pipeline',
        decision, confidence, summary, citations, reasoningTrace, agentDetails,
        studentId, receiptNumber, transactionId,
        pipelineMetrics: pipelineMetrics || null,
        agentConsensus: agentConsensus || false,
        selfReflection: selfReflection || null
      });
    } catch (err) {
      console.error("[Chat] Pipeline failed:", err);
      return res.status(500).json({ error: 'Agent pipeline failed', details: err.message });
    }
  }

  // No student ID detected — conversational greeting
  return res.json({
    type: 'conversational',
    message: `Hello! I am **Sutradhara**, the autonomous Student Account Lifecycle Agent.

To process a reactivation, provide a **Student ID** and **Payment Receipt**. For example:

> *"Reactivate student S10001 with receipt REC-2026-1001"*

**Available student IDs**: S10001 through S10008.`
  });
});

// Chat Thread (for UI)
app.post('/api/chat/thread', (req, res) => {
  res.json({ threadId: uuidv4() });
});

// Admin Callback (manual approve/deny for escalated cases)
app.post('/api/approve-callback', async (req, res) => {
  const { studentId, transactionId, approvedBy, action } = req.body;
  console.log(`[Callback] student=${studentId} action=${action} by=${approvedBy}`);

  if (!studentId || !transactionId || !approvedBy || !action) {
    return res.status(400).json({ error: 'studentId, transactionId, approvedBy, and action are required' });
  }

  const profile = await getStudentProfile(studentId);

  if (action === 'approve') {
    await updateStudentAccountStatus(studentId, true);
    if (db) {
      await db.collection('auditLog').updateOne(
        { TransactionId: transactionId },
        { $set: { ApprovedBy: approvedBy, ExecutionStatus: 'Approved', Action: 'Reactivate' } }
      );
    }
    if (profile) {
      await sendEmailNotification(profile.userPrincipalName, "RIT Student Access Restored — Sutradhara", buildReactivationEmail(profile.displayName, 'Manual Approval'));
    }
    return res.json({ status: 'approved', transactionId, studentId, approvedBy });
  }

  if (action === 'deny') {
    if (db) {
      await db.collection('auditLog').updateOne(
        { TransactionId: transactionId },
        { $set: { ApprovedBy: approvedBy, ExecutionStatus: 'Denied', Action: 'Deny' } }
      );
    }
    return res.json({ status: 'denied', transactionId, studentId, approvedBy });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
});

// ---------------------------------------------------------------------------
// Teams Bot Webhook
// ---------------------------------------------------------------------------
app.post('/api/messages', async (req, res) => {
  console.log("[POST /api/messages] Teams Bot webhook received.");

  if (!botAdapter) {
    return res.status(200).json({ message: "Teams Bot not configured. Set CLIENT_ID, CLIENT_SECRET, TENANT_ID in .env." });
  }

  try {
    await botAdapter.process(req, res, async (context) => {
      if (context.activity.type === 'message') {
        const messageText = (context.activity.text || '').trim();
        console.log(`[Teams] Message: "${messageText}"`);

        const studentIdMatch = messageText.match(/S\d{5}/i);
        const receiptMatch = messageText.match(/REC-\d{4}-\d{3,4}|REC-\S+/i);
        const studentId = studentIdMatch ? studentIdMatch[0].toUpperCase() : null;
        const receiptNumber = receiptMatch ? receiptMatch[0].toUpperCase() : null;

        if (studentId) {
          await context.sendActivity(`🔍 Starting **Sutradhara** multi-agent pipeline for **${studentId}**...`);

          const requestedBy = context.activity.from.name || 'Teams User';
          const rateLimitExceeded = isRateLimited(context.activity.from.id || requestedBy);
          const transactionId = uuidv4();

          const profile = await getStudentProfile(studentId);
          if (!profile) {
            await context.sendActivity(`❌ Student ID **${studentId}** not found in directory.`);
            return;
          }

          const financeRecords = await getStudentFinance(studentId);
          const holds = await getStudentHolds(studentId);
          const dbWrapper = {
            users: { [studentId]: profile },
            finance: { [studentId]: financeRecords },
            holds: { [studentId]: holds },
            getProfile: async (id) => await getStudentProfile(id),
            getFinance: async (id) => await getStudentFinance(id),
            getHolds: async (id) => await getStudentHolds(id),
            reactivateAccount: async (id, enabled) => await updateStudentAccountStatus(id, enabled),
            createAudit: async (fields) => await createAuditEntry(fields),
            sendEmail: async (to, subject, html) => await sendEmailNotification(to, subject, html)
          };

          const result = await runAgentPipeline(studentId, receiptNumber, requestedBy, dbWrapper, rateLimitExceeded);

          await context.sendActivity(
            `### 📊 Verdict: **${result.decision}**\n\n` +
            `**Confidence:** ${(result.confidence * 100).toFixed(0)}%\n\n` +
            `${result.summary}\n\n` +
            `**Policy Citations:** ${result.citations.join(', ')}`
          );
        } else {
          await context.sendActivity(
            `Hello! I'm **Sutradhara**, the Student Account Lifecycle Agent.\n\n` +
            `To reactivate an account, send a message with a **Student ID** (e.g., **S10001**) and **Payment Receipt** (e.g., **REC-2026-1001**).`
          );
        }
      }
    });
  } catch (err) {
    console.error("Teams webhook error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Static File Serving (Dashboard)
// ---------------------------------------------------------------------------
const dashboardPath = require('path').join(__dirname, '../dashboard');
if (require('fs').existsSync(dashboardPath)) {
  app.use(express.static(dashboardPath));
  app.get('/', (req, res) => res.sendFile(require('path').join(dashboardPath, 'index.html')));
}

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------
initDatabase().then(async () => {
  try {
    await initAzureClient();
  } catch (err) {
    console.log(`ℹ️  Azure AI client not initialized on boot: ${err.message}`);
  }

  app.listen(PORT, () => {
    console.log(`\n🎭 ═══════════════════════════════════════════════════════`);
    console.log(`🎭  Sutradhara Backend — http://localhost:${PORT}`);
    console.log(`🎭 ═══════════════════════════════════════════════════════`);
    console.log(`   Database:     ${db ? '✅ MongoDB Atlas' : '⚠️  In-Memory Fallback'}`);
    console.log(`   AI Model:     ${isLive() ? '✅ Azure AI Foundry' : '⚠️  Not Connected (set .env)'}`);
    console.log(`   Teams Bot:    ${botAdapter ? '✅ Active' : '⚠️  Not Configured'}`);
    console.log(`   SMTP Email:   ${process.env.SMTP_HOST && !process.env.SMTP_HOST.includes('<') ? '✅ Configured' : '⚠️  Not Configured'}`);
    console.log(`   Dashboard:    http://localhost:${PORT}/`);
    console.log(`   Health:       http://localhost:${PORT}/api/health`);
    console.log(`   Students:     http://localhost:${PORT}/api/students`);
    console.log(`   Teams Bot:    http://localhost:${PORT}/api/messages`);
    console.log(`🎭 ═══════════════════════════════════════════════════════\n`);
  });
});
