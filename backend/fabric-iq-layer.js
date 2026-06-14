/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Sutradhara — Fabric IQ Semantic Layer
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This module implements a **Fabric IQ semantic layer** — a structured
 * knowledge model inspired by Microsoft's Fabric IQ concept. Fabric IQ
 * brings together **data**, **meaning**, and **actions** into a unified
 * semantic layer that sits above raw data stores.
 *
 * Instead of scattering business logic across API routes, database queries,
 * and agent prompts, this layer provides:
 *
 *   1. **Entity Definitions** — A formal ontology of business objects
 *      (Student, Enrollment, Course, FinancialRecord, Hold, Policy, Audit)
 *      with typed schemas that any consumer can introspect.
 *
 *   2. **Semantic Rules Engine** — Declarative compliance rules that
 *      encode institutional policies (RIT-POL-001 through RIT-POL-005)
 *      as evaluatable logic, producing structured verdicts with full
 *      traceability.
 *
 *   3. **Relationship Queries** — Pre-built "semantic joins" that compose
 *      entity data into unified views (student context, department
 *      insights, threshold lookups) without requiring consumers to know
 *      the underlying data shape.
 *
 *   4. **Semantic Scoring** — A multi-factor readiness score (0–100) that
 *      distils a student's reactivation eligibility into a single,
 *      explainable number.
 *
 * All exports are pure functions with zero external dependencies.
 * This file uses `module.exports` for CommonJS compatibility with the
 * rest of the Sutradhara backend.
 *
 * @module fabric-iq-layer
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// §1  ENTITY DEFINITIONS (Ontology)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} StudentEntity
 * @property {string}  id              - Unique student identifier (e.g. "S10001")
 * @property {string}  name            - Full display name
 * @property {string}  department      - Academic department
 * @property {number}  enrollmentYear  - Year of first enrollment
 * @property {string}  semester        - Current semester label
 * @property {boolean} accountStatus   - Whether the university account is enabled
 */
const StudentSchema = {
  entity: 'Student',
  description: 'A registered student in the university directory.',
  fields: {
    id:              { type: 'string',  required: true,  description: 'Unique student identifier (e.g. S10001)' },
    name:            { type: 'string',  required: true,  description: 'Full display name' },
    department:      { type: 'string',  required: true,  description: 'Academic department' },
    enrollmentYear:  { type: 'number',  required: true,  description: 'Year of first enrollment' },
    semester:        { type: 'string',  required: false, description: 'Current semester label (e.g. Semester 6)' },
    accountStatus:   { type: 'boolean', required: true,  description: 'Whether the university account is enabled' }
  }
};

/**
 * @typedef {Object} EnrollmentEntity
 * @property {string} studentId  - FK → Student.id
 * @property {string} department - Department of study
 * @property {string} program    - Degree program
 * @property {number} year       - Enrollment year
 */
const EnrollmentSchema = {
  entity: 'Enrollment',
  description: "A student's enrollment record mapping them to a department and program.",
  fields: {
    studentId:  { type: 'string', required: true,  description: 'FK → Student.id' },
    department: { type: 'string', required: true,  description: 'Department of study' },
    program:    { type: 'string', required: false, description: 'Degree program (e.g. B.Tech, MBA)' },
    year:       { type: 'number', required: true,  description: 'Academic year of enrollment' }
  }
};

/**
 * @typedef {Object} CertificationCourseEntity
 * @property {string}   department     - Owning department
 * @property {string[]} requirements   - List of requirement descriptions
 * @property {string[]} prerequisites  - List of prerequisite course IDs
 */
const CertificationCourseSchema = {
  entity: 'CertificationCourse',
  description: 'Department-level certification or course requirements and prerequisites.',
  fields: {
    department:    { type: 'string', required: true,  description: 'Owning department' },
    requirements:  { type: 'array',  required: false, description: 'List of requirement descriptions' },
    prerequisites: { type: 'array',  required: false, description: 'List of prerequisite course IDs' }
  }
};

/**
 * @typedef {Object} FinancialRecordEntity
 * @property {string} studentId      - FK → Student.id
 * @property {number} amountDue      - Total amount owed (₹)
 * @property {number} amountPaid     - Total amount paid (₹)
 * @property {string} paymentStatus  - Verified | Pending | Unpaid
 * @property {number} holdThreshold  - Outstanding balance (₹) above which a hold is placed
 */
const FinancialRecordSchema = {
  entity: 'FinancialRecord',
  description: "A student's financial ledger summarising dues, payments, and status.",
  fields: {
    studentId:     { type: 'string', required: true,  description: 'FK → Student.id' },
    amountDue:     { type: 'number', required: true,  description: 'Total amount owed (₹)' },
    amountPaid:    { type: 'number', required: true,  description: 'Total amount paid (₹)' },
    paymentStatus: { type: 'string', required: true,  description: 'Verified | Pending | Unpaid' },
    holdThreshold: { type: 'number', required: false, description: 'Outstanding balance (₹) above which a financial hold is placed (default ₹50,000)' }
  }
};

/**
 * @typedef {Object} HoldEntity
 * @property {string} studentId     - FK → Student.id
 * @property {string} type          - Financial | AcademicIntegrity | Investigation
 * @property {string} status        - Active | Expired | Cleared
 * @property {string} severity      - Critical | High | Medium | Low
 * @property {string} blockingLevel - Full | Partial | None
 */
const HoldSchema = {
  entity: 'Hold',
  description: "An administrative hold placed on a student's account.",
  fields: {
    studentId:     { type: 'string', required: true,  description: 'FK → Student.id' },
    type:          { type: 'string', required: true,  description: 'Hold category: Financial | AcademicIntegrity | Investigation' },
    status:        { type: 'string', required: true,  description: 'Active | Expired | Cleared' },
    severity:      { type: 'string', required: false, description: 'Critical | High | Medium | Low' },
    blockingLevel: { type: 'string', required: false, description: 'Full | Partial | None — determines what the hold blocks' }
  }
};

/**
 * @typedef {Object} PolicyEntity
 * @property {string} id        - Policy identifier (e.g. RIT-POL-001)
 * @property {string} title     - Human-readable title
 * @property {string} section   - Section reference (e.g. §6.3)
 * @property {string} rule      - Plain-English rule description
 * @property {string} action    - Prescribed action (Approve | Deny | Escalate)
 * @property {number} threshold - Numeric threshold if applicable
 */
const PolicySchema = {
  entity: 'Policy',
  description: 'An institutional policy rule that governs student account lifecycle decisions.',
  fields: {
    id:        { type: 'string', required: true,  description: 'Policy identifier (e.g. RIT-POL-001)' },
    title:     { type: 'string', required: true,  description: 'Human-readable title' },
    section:   { type: 'string', required: false, description: 'Section reference (e.g. §6.3)' },
    rule:      { type: 'string', required: true,  description: 'Plain-English rule description' },
    action:    { type: 'string', required: true,  description: 'Prescribed action: Approve | Deny | Escalate' },
    threshold: { type: 'number', required: false, description: 'Numeric threshold if applicable (e.g. 80 for 80% payment)' }
  }
};

/**
 * @typedef {Object} AuditRecordEntity
 * @property {string}   decision   - APPROVE | DENY | ESCALATE
 * @property {string}   timestamp  - ISO-8601 timestamp
 * @property {string[]} citations  - Policy citations backing the decision
 * @property {string}   agent      - Name of the agent / operator
 */
const AuditRecordSchema = {
  entity: 'AuditRecord',
  description: 'An immutable record of a compliance decision and its justification.',
  fields: {
    decision:  { type: 'string', required: true,  description: 'APPROVE | DENY | ESCALATE' },
    timestamp: { type: 'string', required: true,  description: 'ISO-8601 timestamp of the decision' },
    citations: { type: 'array',  required: true,  description: 'Policy citations backing the decision' },
    agent:     { type: 'string', required: true,  description: 'Name of the deciding agent or operator' }
  }
};

/**
 * All entity schemas bundled for introspection / tooling.
 */
const EntitySchemas = {
  Student:             StudentSchema,
  Enrollment:          EnrollmentSchema,
  CertificationCourse: CertificationCourseSchema,
  FinancialRecord:     FinancialRecordSchema,
  Hold:                HoldSchema,
  Policy:              PolicySchema,
  AuditRecord:         AuditRecordSchema
};


// ═══════════════════════════════════════════════════════════════════════════
// §2  POLICY KNOWLEDGE BASE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Canonical policy rules used by the Semantic Rules Engine.
 * These mirror RIT-POL-001 through RIT-POL-005 in structured form.
 */
const POLICY_RULES = [
  // ── Financial Policies ──────────────────────────────────────────────
  {
    id: 'RIT-POL-001', section: '§6.3', title: 'Full Payment Reactivation',
    rule: 'If tuition is paid in full (100%), and no active blocking holds exist, the account shall be reactivated immediately.',
    action: 'Approve', threshold: 100
  },
  {
    id: 'RIT-POL-001', section: '§7.1', title: 'Partial Payment — Core Access',
    rule: 'If tuition payment is ≥80% but <100%, the student may request Core-only course access. Requires escalation to IT Lead.',
    action: 'Escalate', threshold: 80
  },
  {
    id: 'RIT-POL-001', section: '§7.2', title: 'Insufficient Payment',
    rule: 'If tuition payment is <80%, the reactivation request shall be denied unless a hardship application is on file.',
    action: 'Deny', threshold: 0
  },
  {
    id: 'RIT-POL-001', section: '§7.3', title: 'Hardship Provision',
    rule: 'If a hardship application is pending and payment is <80%, escalate for Dean review rather than outright denial.',
    action: 'Escalate', threshold: 0
  },
  {
    id: 'RIT-POL-001', section: '§4.1', title: 'Financial Hold Threshold',
    rule: 'A financial hold is automatically placed if the outstanding balance exceeds ₹50,000.',
    action: 'Hold', threshold: 50000
  },

  // ── Identity & Integrity Policies ───────────────────────────────────
  {
    id: 'RIT-POL-002', section: '§2', title: 'Identity Verification',
    rule: 'Identity must be verified against the student directory before any service provisioning.',
    action: 'Verify', threshold: null
  },
  {
    id: 'RIT-POL-003', section: '§3', title: 'Academic Integrity Hold',
    rule: 'Active academic integrity holds block account reactivation. The request must be denied.',
    action: 'Deny', threshold: null
  },
  {
    id: 'RIT-POL-003', section: '§3.1', title: 'Investigation Hold',
    rule: 'Active investigation / conduct holds are the highest priority and block all account actions. Must deny.',
    action: 'Deny', threshold: null
  },

  // ── Audit & Escalation Policies ─────────────────────────────────────
  {
    id: 'RIT-POL-004', section: '§1', title: 'Audit Trail Requirement',
    rule: 'Every reactivation decision must produce a complete audit trail with citations, reasoning, and timestamps.',
    action: 'Audit', threshold: null
  },
  {
    id: 'RIT-POL-005', section: '§1', title: 'Hardship Escalation',
    rule: 'Hardship cases (financial distress noted in payment records) must be escalated for Dean/IT Lead review.',
    action: 'Escalate', threshold: null
  }
];

/**
 * Hold type priority hierarchy.
 * Higher number = higher priority = blocks with greater authority.
 *
 * Investigation > AcademicIntegrity > Financial
 */
const HOLD_PRIORITY = {
  Investigation:     100,
  AcademicIntegrity: 80,
  Financial:         40
};

/**
 * Severity mapping for hold types.
 */
const HOLD_SEVERITY_MAP = {
  Investigation:     'Critical',
  AcademicIntegrity: 'High',
  Financial:         'Medium'
};

/**
 * Blocking level per hold type.
 */
const HOLD_BLOCKING_MAP = {
  Investigation:     'Full',
  AcademicIntegrity: 'Full',
  Financial:         'Partial'
};


// ═══════════════════════════════════════════════════════════════════════════
// §3  SEMANTIC RULES ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluate a student's compliance posture against all applicable policies.
 *
 * This is the core of the Fabric IQ semantic layer — it translates raw
 * data into a structured compliance verdict with full traceability back
 * to the originating policy rules.
 *
 * @param {Object} studentData - Unified student context object:
 * @param {Object} studentData.profile  - Student directory record
 * @param {Array}  studentData.finance  - Array of financial records
 * @param {Array}  studentData.holds    - Array of hold records
 * @returns {Object} Structured compliance result
 */
function evaluateCompliance(studentData) {
  const { profile, finance, holds } = studentData;

  const result = {
    studentId: profile?.id || 'UNKNOWN',
    timestamp: new Date().toISOString(),
    recommendedAction: 'DENY',           // pessimistic default
    confidence: 0,
    applicableRules: [],
    thresholdsCrossed: [],
    holdAnalysis: [],
    financialSummary: {},
    reasoning: [],
    escalationReasons: []
  };

  // ── 1. Identity Check ───────────────────────────────────────────────
  if (!profile || !profile.id) {
    result.reasoning.push('Identity verification failed — student not found in directory.');
    result.applicableRules.push({ id: 'RIT-POL-002', section: '§2', action: 'Deny' });
    result.confidence = 0.99;
    return result;
  }
  result.reasoning.push(`Identity verified: ${profile.displayName || profile.name} (${profile.id}).`);

  // ── 2. Financial Analysis ───────────────────────────────────────────
  const finRecord = (finance && finance.length > 0) ? finance[0] : null;
  const amountDue  = finRecord ? (finRecord.AmountDue  || finRecord.amountDue  || 0) : 0;
  const amountPaid = finRecord ? (finRecord.AmountPaid || finRecord.amountPaid || 0) : 0;
  const paymentPct = amountDue > 0 ? (amountPaid / amountDue) * 100 : 0;
  const outstanding = amountDue - amountPaid;
  const hasHardship = finRecord
    ? /hardship/i.test(finRecord.Notes || finRecord.notes || '')
    : false;

  result.financialSummary = {
    amountDue,
    amountPaid,
    outstanding,
    paymentPercentage: Math.round(paymentPct * 10) / 10,
    hasHardshipApplication: hasHardship,
    verificationStatus: finRecord ? (finRecord.VerificationStatus || finRecord.verificationStatus || 'Unknown') : 'No Record'
  };

  if (paymentPct >= 100) {
    result.reasoning.push(`Full payment confirmed (${result.financialSummary.paymentPercentage}%). Meets RIT-POL-001 §6.3.`);
    result.applicableRules.push({ id: 'RIT-POL-001', section: '§6.3', action: 'Approve' });
  } else if (paymentPct >= 80) {
    result.reasoning.push(`Partial payment (${result.financialSummary.paymentPercentage}%). Eligible for Core-only access under RIT-POL-001 §7.1.`);
    result.applicableRules.push({ id: 'RIT-POL-001', section: '§7.1', action: 'Escalate' });
    result.thresholdsCrossed.push({ rule: 'RIT-POL-001 §7.1', threshold: 80, actual: result.financialSummary.paymentPercentage, direction: 'above' });
    result.escalationReasons.push('Partial payment ≥80% — requires IT Lead approval for Core-only access.');
  } else {
    // < 80%
    if (hasHardship) {
      result.reasoning.push(`Payment below 80% (${result.financialSummary.paymentPercentage}%) but hardship application found. Escalating per RIT-POL-001 §7.3 / RIT-POL-005.`);
      result.applicableRules.push({ id: 'RIT-POL-001', section: '§7.3', action: 'Escalate' });
      result.applicableRules.push({ id: 'RIT-POL-005', section: '§1', action: 'Escalate' });
      result.escalationReasons.push('Hardship application on file — requires Dean review.');
    } else {
      result.reasoning.push(`Payment below 80% (${result.financialSummary.paymentPercentage}%) with no hardship application. Denying per RIT-POL-001 §7.2.`);
      result.applicableRules.push({ id: 'RIT-POL-001', section: '§7.2', action: 'Deny' });
    }
    result.thresholdsCrossed.push({ rule: 'RIT-POL-001 §7.2', threshold: 80, actual: result.financialSummary.paymentPercentage, direction: 'below' });
  }

  // Financial hold threshold check
  if (outstanding > 50000) {
    result.thresholdsCrossed.push({ rule: 'RIT-POL-001 §4.1', threshold: 50000, actual: outstanding, direction: 'above', unit: '₹' });
    result.reasoning.push(`Outstanding balance ₹${outstanding.toLocaleString()} exceeds ₹50,000 hold threshold.`);
  }

  // ── 3. Hold Analysis ───────────────────────────────────────────────
  const activeHolds = (holds || []).filter(h => (h.HoldStatus || h.status) === 'Active');
  const expiredHolds = (holds || []).filter(h => (h.HoldStatus || h.status) === 'Expired');

  // Sort active holds by priority (highest first)
  activeHolds.sort((a, b) => {
    const typeA = a.HoldType || a.type || '';
    const typeB = b.HoldType || b.type || '';
    return (HOLD_PRIORITY[typeB] || 0) - (HOLD_PRIORITY[typeA] || 0);
  });

  let hasBlockingHold = false;

  for (const hold of activeHolds) {
    const holdType = hold.HoldType || hold.type || 'Unknown';
    const severity = HOLD_SEVERITY_MAP[holdType] || 'Low';
    const blocking = HOLD_BLOCKING_MAP[holdType] || 'None';
    const priority = HOLD_PRIORITY[holdType] || 0;

    const analysis = {
      type: holdType,
      status: 'Active',
      severity,
      blockingLevel: blocking,
      priority,
      reason: hold.Reason || hold.reason || '',
      placedBy: hold.PlacedBy || hold.placedBy || ''
    };

    result.holdAnalysis.push(analysis);

    if (holdType === 'Investigation') {
      result.reasoning.push(`BLOCKING: Active Investigation hold (priority ${priority}). Must deny per RIT-POL-003 §3.1.`);
      result.applicableRules.push({ id: 'RIT-POL-003', section: '§3.1', action: 'Deny' });
      hasBlockingHold = true;
    } else if (holdType === 'AcademicIntegrity') {
      result.reasoning.push(`BLOCKING: Active Academic Integrity hold (priority ${priority}). Must deny per RIT-POL-003 §3.`);
      result.applicableRules.push({ id: 'RIT-POL-003', section: '§3', action: 'Deny' });
      hasBlockingHold = true;
    } else if (holdType === 'Financial') {
      result.reasoning.push(`Active Financial hold detected (priority ${priority}). This is non-blocking if payment threshold is met.`);
    }
  }

  for (const hold of expiredHolds) {
    const holdType = hold.HoldType || hold.type || 'Unknown';
    result.holdAnalysis.push({
      type: holdType,
      status: 'Expired',
      severity: 'None',
      blockingLevel: 'None',
      priority: 0,
      reason: hold.Reason || hold.reason || '',
      placedBy: hold.PlacedBy || hold.placedBy || ''
    });
    result.reasoning.push(`Expired ${holdType} hold found — does not block reactivation.`);
  }

  // ── 4. Final Decision Synthesis ─────────────────────────────────────
  if (hasBlockingHold) {
    result.recommendedAction = 'DENY';
    result.confidence = 0.97;
    result.reasoning.push('VERDICT: Denied due to active blocking hold(s).');
  } else if (paymentPct >= 100) {
    result.recommendedAction = 'APPROVE';
    result.confidence = 0.98;
    result.reasoning.push('VERDICT: Approved — full payment confirmed, no blocking holds.');
  } else if (paymentPct >= 80 || hasHardship) {
    result.recommendedAction = 'ESCALATE';
    result.confidence = 0.90;
    result.reasoning.push('VERDICT: Escalated for human review (partial payment or hardship).');
  } else {
    result.recommendedAction = 'DENY';
    result.confidence = 0.95;
    result.reasoning.push('VERDICT: Denied — insufficient payment and no hardship provision.');
  }

  // Audit rule citation
  result.applicableRules.push({ id: 'RIT-POL-004', section: '§1', action: 'Audit' });

  return result;
}


// ═══════════════════════════════════════════════════════════════════════════
// §4  RELATIONSHIP QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a complete semantic view for a single student by joining
 * profile, finance, and holds data into a unified context object.
 *
 * This is the Fabric IQ equivalent of a "semantic join" — it composes
 * multiple entity types into a single, richly annotated view.
 *
 * @param {string} studentId - The student's identifier
 * @param {Object} allData   - Data source containing users, finance, holds
 * @param {Object} allData.users   - Map or array of student profiles
 * @param {Object} allData.finance - Map or array of financial records
 * @param {Object} allData.holds   - Map or array of hold records
 * @returns {Object|null} Unified student context, or null if not found
 */
function getStudentCompleteContext(studentId, allData) {
  // ── Resolve profile ──
  let profile = null;
  if (allData.users) {
    if (typeof allData.users === 'object' && !Array.isArray(allData.users)) {
      profile = allData.users[studentId] || null;
    } else if (Array.isArray(allData.users)) {
      profile = allData.users.find(u => u.id === studentId) || null;
    }
  }

  if (!profile) return null;

  // ── Resolve finance ──
  let financeRecords = [];
  if (allData.finance) {
    if (typeof allData.finance === 'object' && !Array.isArray(allData.finance)) {
      financeRecords = allData.finance[studentId] || [];
    } else if (Array.isArray(allData.finance)) {
      financeRecords = allData.finance.filter(f => (f.StudentID || f.studentId) === studentId);
    }
  }

  // ── Resolve holds ──
  let holdRecords = [];
  if (allData.holds) {
    if (typeof allData.holds === 'object' && !Array.isArray(allData.holds)) {
      holdRecords = allData.holds[studentId] || [];
    } else if (Array.isArray(allData.holds)) {
      holdRecords = allData.holds.filter(h => (h.StudentID || h.studentId) === studentId);
    }
  }

  // ── Compute derived fields ──
  const finRecord = financeRecords.length > 0 ? financeRecords[0] : null;
  const amountDue  = finRecord ? (finRecord.AmountDue  || finRecord.amountDue  || 0) : 0;
  const amountPaid = finRecord ? (finRecord.AmountPaid || finRecord.amountPaid || 0) : 0;
  const paymentPct = amountDue > 0 ? Math.round((amountPaid / amountDue) * 1000) / 10 : 0;

  const activeHolds  = holdRecords.filter(h => (h.HoldStatus || h.status) === 'Active');
  const expiredHolds = holdRecords.filter(h => (h.HoldStatus || h.status) === 'Expired');
  const highestHold  = activeHolds.reduce((max, h) => {
    const type = h.HoldType || h.type || '';
    const prio = HOLD_PRIORITY[type] || 0;
    return prio > max.priority ? { type, priority: prio } : max;
  }, { type: 'None', priority: 0 });

  return {
    studentId,
    profile: {
      id: profile.id,
      displayName: profile.displayName || profile.name,
      email: profile.userPrincipalName || profile.email || null,
      department: profile.department,
      semester: profile.semester,
      enrollmentYear: profile.enrollmentYear,
      accountEnabled: profile.accountEnabled ?? profile.accountStatus ?? false
    },
    financial: {
      amountDue,
      amountPaid,
      outstanding: amountDue - amountPaid,
      paymentPercentage: paymentPct,
      records: financeRecords
    },
    holds: {
      total: holdRecords.length,
      active: activeHolds.length,
      expired: expiredHolds.length,
      highestPriorityHold: highestHold.type,
      details: holdRecords.map(h => ({
        type: h.HoldType || h.type,
        status: h.HoldStatus || h.status,
        severity: HOLD_SEVERITY_MAP[h.HoldType || h.type] || 'Low',
        reason: h.Reason || h.reason || '',
        placedBy: h.PlacedBy || h.placedBy || '',
        expiryDate: h.ExpiryDate || h.expiryDate || null
      }))
    },
    readinessScore: calculateReadinessScore({ profile, finance: financeRecords, holds: holdRecords }),
    generatedAt: new Date().toISOString()
  };
}

/**
 * Aggregate semantic insights for an entire department.
 *
 * Returns high-level metrics such as total students, average payment
 * percentage, hold distribution, and reactivation readiness.
 *
 * @param {string} department - Department name to filter by
 * @param {Object} allData    - Full data source (users, finance, holds)
 * @returns {Object} Department-level insight summary
 */
function getDepartmentInsights(department, allData) {
  // ── Resolve all students in this department ──
  let allStudents = [];
  if (allData.users) {
    const source = Array.isArray(allData.users) ? allData.users : Object.values(allData.users);
    allStudents = source.filter(u => u.department === department);
  }

  if (allStudents.length === 0) {
    return {
      department,
      totalStudents: 0,
      message: 'No students found in this department.',
      generatedAt: new Date().toISOString()
    };
  }

  let totalPaymentPct = 0;
  let totalActive = 0;
  let totalInactive = 0;
  let holdCounts = { Financial: 0, AcademicIntegrity: 0, Investigation: 0 };
  let readyForReactivation = 0;
  let needsEscalation = 0;
  let blocked = 0;

  for (const student of allStudents) {
    const ctx = getStudentCompleteContext(student.id, allData);
    if (!ctx) continue;

    totalPaymentPct += ctx.financial.paymentPercentage;

    if (ctx.profile.accountEnabled) {
      totalActive++;
    } else {
      totalInactive++;
    }

    // Count holds
    for (const holdDetail of ctx.holds.details) {
      if (holdDetail.status === 'Active' && holdCounts[holdDetail.type] !== undefined) {
        holdCounts[holdDetail.type]++;
      }
    }

    // Readiness classification
    const score = ctx.readinessScore;
    if (score >= 80) readyForReactivation++;
    else if (score >= 50) needsEscalation++;
    else blocked++;
  }

  return {
    department,
    totalStudents: allStudents.length,
    activeAccounts: totalActive,
    inactiveAccounts: totalInactive,
    averagePaymentPercentage: Math.round((totalPaymentPct / allStudents.length) * 10) / 10,
    holdDistribution: holdCounts,
    reactivationReadiness: {
      readyForReactivation,
      needsEscalation,
      blocked
    },
    generatedAt: new Date().toISOString()
  };
}

/**
 * Return all reactivation policy thresholds as structured data.
 *
 * Useful for dashboards and agents that need to understand the decision
 * boundaries without re-parsing policy documents.
 *
 * @returns {Object} Structured thresholds keyed by policy section
 */
function getReactivationThresholds() {
  return {
    financialHoldThreshold: {
      policy: 'RIT-POL-001 §4.1',
      description: 'Outstanding balance above which a financial hold is placed.',
      value: 50000,
      unit: '₹'
    },
    fullPaymentApproval: {
      policy: 'RIT-POL-001 §6.3',
      description: 'Payment percentage required for autonomous approval.',
      value: 100,
      unit: '%'
    },
    partialPaymentEscalation: {
      policy: 'RIT-POL-001 §7.1',
      description: 'Minimum payment percentage to qualify for Core-only access (requires escalation).',
      value: 80,
      unit: '%'
    },
    insufficientPaymentDenial: {
      policy: 'RIT-POL-001 §7.2',
      description: 'Payment below this threshold results in denial (unless hardship applies).',
      value: 80,
      unit: '%',
      exception: 'Hardship application on file triggers RIT-POL-001 §7.3 escalation instead.'
    },
    holdPriorityHierarchy: {
      policy: 'RIT-POL-003',
      description: 'Hold types ranked by blocking priority (highest blocks all).',
      hierarchy: [
        { type: 'Investigation',     priority: HOLD_PRIORITY.Investigation,     blocking: 'Full',    action: 'Deny' },
        { type: 'AcademicIntegrity', priority: HOLD_PRIORITY.AcademicIntegrity, blocking: 'Full',    action: 'Deny' },
        { type: 'Financial',         priority: HOLD_PRIORITY.Financial,         blocking: 'Partial', action: 'Conditional' }
      ]
    },
    generatedAt: new Date().toISOString()
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// §5  SEMANTIC SCORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate a numerical readiness score (0–100) representing how ready
 * a student is for account reactivation.
 *
 * **Factor Weights:**
 * | Factor                  | Weight |
 * |-------------------------|--------|
 * | Payment percentage      |   40%  |
 * | Hold severity           |   30%  |
 * | Enrollment standing     |   15%  |
 * | Historical compliance   |   15%  |
 *
 * @param {Object} studentData
 * @param {Object} studentData.profile  - Student directory record
 * @param {Array}  studentData.finance  - Financial records
 * @param {Array}  studentData.holds    - Hold records
 * @returns {number} Readiness score between 0 and 100 (inclusive)
 */
function calculateReadinessScore(studentData) {
  const { profile, finance, holds } = studentData;
  let score = 0;

  // ── Factor 1: Payment Percentage (40 pts max) ──────────────────────
  const finRecord = (finance && finance.length > 0) ? finance[0] : null;
  const amountDue  = finRecord ? (finRecord.AmountDue  || finRecord.amountDue  || 0) : 0;
  const amountPaid = finRecord ? (finRecord.AmountPaid || finRecord.amountPaid || 0) : 0;
  const paymentPct = amountDue > 0 ? (amountPaid / amountDue) : 0;

  // Linear mapping: 0% → 0 pts, 100% → 40 pts, capped at 40
  const paymentScore = Math.min(paymentPct * 40, 40);
  score += paymentScore;

  // ── Factor 2: Hold Severity (30 pts max) ───────────────────────────
  // No holds = 30 pts.  Only expired = 25 pts.
  // Active Financial = 15 pts.  Active AcademicIntegrity = 5 pts.
  // Active Investigation = 0 pts.
  const activeHolds = (holds || []).filter(h => (h.HoldStatus || h.status) === 'Active');
  const expiredHolds = (holds || []).filter(h => (h.HoldStatus || h.status) === 'Expired');

  if (activeHolds.length === 0 && expiredHolds.length === 0) {
    score += 30;
  } else if (activeHolds.length === 0 && expiredHolds.length > 0) {
    score += 25; // only expired holds — mostly fine
  } else {
    // Deduct based on worst active hold
    const worstPriority = activeHolds.reduce((max, h) => {
      const type = h.HoldType || h.type || '';
      return Math.max(max, HOLD_PRIORITY[type] || 0);
    }, 0);

    if (worstPriority >= HOLD_PRIORITY.Investigation) {
      score += 0;   // Investigation — full block
    } else if (worstPriority >= HOLD_PRIORITY.AcademicIntegrity) {
      score += 5;   // Academic integrity — heavy penalty
    } else {
      score += 15;  // Financial only — moderate penalty
    }
  }

  // ── Factor 3: Enrollment Standing (15 pts max) ─────────────────────
  // Students closer to graduation (higher semester) get more points.
  // Semester 6+ = 15, Semester 4 = 12, Semester 2 = 9, unknown = 7
  const semesterStr = profile?.semester || '';
  const semesterMatch = semesterStr.match(/\d+/);
  const semesterNum = semesterMatch ? parseInt(semesterMatch[0], 10) : 0;

  if (semesterNum >= 6) {
    score += 15;
  } else if (semesterNum >= 4) {
    score += 12;
  } else if (semesterNum >= 2) {
    score += 9;
  } else {
    score += 7;
  }

  // ── Factor 4: Historical Compliance (15 pts max) ───────────────────
  // Heuristic: payment verification status and absence of past issues.
  // Verified payment = 15, Pending = 10, Unpaid = 3, No Record = 5
  const verificationStatus = finRecord
    ? (finRecord.VerificationStatus || finRecord.verificationStatus || 'Unknown')
    : 'No Record';

  if (verificationStatus === 'Verified') {
    score += 15;
  } else if (verificationStatus === 'Pending') {
    score += 10;
  } else if (verificationStatus === 'No Record' || verificationStatus === 'Unknown') {
    score += 5;
  } else {
    // Unpaid or other
    score += 3;
  }

  // ── Clamp to 0–100 ─────────────────────────────────────────────────
  return Math.max(0, Math.min(100, Math.round(score)));
}


// ═══════════════════════════════════════════════════════════════════════════
// §6  UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Look up the severity label for a given hold type.
 *
 * @param {string} holdType - Financial | AcademicIntegrity | Investigation
 * @returns {string} Severity label
 */
function getHoldSeverity(holdType) {
  return HOLD_SEVERITY_MAP[holdType] || 'Low';
}

/**
 * Look up the blocking level for a given hold type.
 *
 * @param {string} holdType - Financial | AcademicIntegrity | Investigation
 * @returns {string} Blocking level: Full | Partial | None
 */
function getHoldBlockingLevel(holdType) {
  return HOLD_BLOCKING_MAP[holdType] || 'None';
}

/**
 * Check whether a hold is currently expired (based on ExpiryDate).
 *
 * @param {Object} hold - A hold record
 * @returns {boolean} true if the hold has an expiry date in the past
 */
function isHoldExpired(hold) {
  const expiry = hold.ExpiryDate || hold.expiryDate;
  if (!expiry) return false;
  return new Date(expiry) < new Date();
}

/**
 * Return a human-readable summary of the Fabric IQ layer's capabilities.
 *
 * @returns {Object} Layer metadata
 */
function getLayerInfo() {
  return {
    name: 'Sutradhara Fabric IQ Semantic Layer',
    version: '1.0.0',
    description: 'A structured knowledge model that represents the relationships between business entities in the university student lifecycle system. Inspired by Microsoft Fabric IQ.',
    capabilities: [
      'Entity Ontology (7 entity types with typed schemas)',
      'Semantic Rules Engine (policy-driven compliance evaluation)',
      'Relationship Queries (student context, department insights, threshold lookup)',
      'Semantic Scoring (multi-factor readiness score 0–100)'
    ],
    entityCount: Object.keys(EntitySchemas).length,
    policyRuleCount: POLICY_RULES.length,
    scoringFactors: [
      { name: 'Payment Percentage', weight: '40%' },
      { name: 'Hold Severity',      weight: '30%' },
      { name: 'Enrollment Standing', weight: '15%' },
      { name: 'Historical Compliance', weight: '15%' }
    ]
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// §7  MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // ── Entity Schemas ──
  EntitySchemas,
  StudentSchema,
  EnrollmentSchema,
  CertificationCourseSchema,
  FinancialRecordSchema,
  HoldSchema,
  PolicySchema,
  AuditRecordSchema,

  // ── Policy Knowledge Base ──
  POLICY_RULES,
  HOLD_PRIORITY,
  HOLD_SEVERITY_MAP,
  HOLD_BLOCKING_MAP,

  // ── Semantic Rules Engine ──
  evaluateCompliance,

  // ── Relationship Queries ──
  getStudentCompleteContext,
  getDepartmentInsights,
  getReactivationThresholds,

  // ── Semantic Scoring ──
  calculateReadinessScore,

  // ── Utilities ──
  getHoldSeverity,
  getHoldBlockingLevel,
  isHoldExpired,
  getLayerInfo
};
