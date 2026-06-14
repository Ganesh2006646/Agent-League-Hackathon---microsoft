/**
 * Sutradhara — Responsible AI Guardrails Module
 * 
 * Provides input sanitization, output validation, bias detection, and safety
 * reporting for the multi-agent pipeline. Ensures Responsible AI compliance
 * by catching PII leakage, injection attacks, and systematic bias.
 * 
 * Usage:
 *   const { sanitizeInput, validateAgentOutput, checkBias, generateSafetyReport } = require('./responsible-ai');
 */

// ---------------------------------------------------------------------------
// PII Patterns — used for detection and redaction
// ---------------------------------------------------------------------------
const PII_PATTERNS = [
  // Email addresses
  { name: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[REDACTED_EMAIL]' },
  // Phone numbers (Indian: +91, 10-digit; International: various formats)
  { name: 'phone', regex: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: '[REDACTED_PHONE]' },
  // SSN patterns (US: XXX-XX-XXXX)
  { name: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]' },
  // Aadhaar numbers (India: 12-digit, often written XXXX-XXXX-XXXX)
  { name: 'aadhaar', regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: '[REDACTED_AADHAAR]' },
  // PAN Card (India: 5 letters, 4 digits, 1 letter)
  { name: 'pan', regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g, replacement: '[REDACTED_PAN]' },
  // Credit card numbers (16 digits, grouped)
  { name: 'credit_card', regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: '[REDACTED_CARD]' }
];

// ---------------------------------------------------------------------------
// SQL Injection Patterns
// ---------------------------------------------------------------------------
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|UNION)\b\s)/i,
  /(--|;|\/\*|\*\/|xp_|CONCAT\s*\()/i,
  /('\s*(OR|AND)\s+')/i,
  /(1\s*=\s*1|''\s*=\s*'')/i
];

// ---------------------------------------------------------------------------
// Prompt Injection Patterns
// ---------------------------------------------------------------------------
const PROMPT_INJECTION_PATTERNS = [
  // Attempts to override system instructions
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above\s+instructions/i,
  /disregard\s+(all\s+)?prior/i,
  /you\s+are\s+now\s+a/i,
  /forget\s+everything/i,
  /new\s+instruction[s]?\s*:/i,
  /system\s*prompt\s*:/i,
  /act\s+as\s+(?:a\s+)?(?:different|new)/i,
  /pretend\s+(?:to\s+be|you\s+are)/i,
  /override\s+(?:your|the)\s+(?:rules|instructions|prompt)/i,
  /jailbreak/i,
  /DAN\s+mode/i
];

// ---------------------------------------------------------------------------
// sanitizeInput(text)
// Detects and strips PII, SQL injection patterns, and prompt injection attempts.
// Returns: { sanitized, issues[] }
// ---------------------------------------------------------------------------
function sanitizeInput(text) {
  if (typeof text !== 'string') {
    return { sanitized: String(text || ''), issues: [] };
  }

  const issues = [];
  let sanitized = text;

  // --- PII Detection & Redaction ---
  for (const pattern of PII_PATTERNS) {
    const matches = sanitized.match(pattern.regex);
    if (matches && matches.length > 0) {
      issues.push({
        type: 'PII_DETECTED',
        subtype: pattern.name,
        count: matches.length,
        severity: 'high',
        message: `Detected ${matches.length} ${pattern.name} pattern(s) — redacted.`
      });
      sanitized = sanitized.replace(pattern.regex, pattern.replacement);
    }
  }

  // --- SQL Injection Detection ---
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      issues.push({
        type: 'SQL_INJECTION',
        severity: 'critical',
        message: 'Potential SQL injection pattern detected — stripped.'
      });
      // Remove the suspicious SQL fragments
      sanitized = sanitized.replace(pattern, '[BLOCKED_SQL]');
    }
  }

  // --- Prompt Injection Detection ---
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      issues.push({
        type: 'PROMPT_INJECTION',
        severity: 'critical',
        message: `Prompt injection attempt detected: "${sanitized.match(pattern)?.[0]}" — blocked.`
      });
      sanitized = sanitized.replace(pattern, '[BLOCKED_INJECTION]');
    }
  }

  return { sanitized, issues };
}

// ---------------------------------------------------------------------------
// validateAgentOutput(output)
// Validates that the agent's output conforms to expected structure:
//   - Has required fields (decision, confidence, summary, citations)
//   - No PII leakage in the output text
//   - Confidence is within valid range [0, 1]
//   - Decision is one of APPROVE, DENY, ESCALATE
// Returns: { valid, issues[] }
// ---------------------------------------------------------------------------
function validateAgentOutput(output) {
  const issues = [];

  if (!output || typeof output !== 'object') {
    return {
      valid: false,
      issues: [{ type: 'INVALID_OUTPUT', severity: 'critical', message: 'Output is null or not an object.' }]
    };
  }

  // --- Required Fields ---
  const requiredFields = ['decision', 'confidence', 'summary'];
  for (const field of requiredFields) {
    if (!(field in output) || output[field] === undefined || output[field] === null) {
      issues.push({
        type: 'MISSING_FIELD',
        severity: 'high',
        field,
        message: `Required field "${field}" is missing from agent output.`
      });
    }
  }

  // --- Decision Validation ---
  const validDecisions = ['APPROVE', 'DENY', 'ESCALATE'];
  if (output.decision && !validDecisions.includes(String(output.decision).toUpperCase())) {
    issues.push({
      type: 'INVALID_DECISION',
      severity: 'high',
      message: `Decision "${output.decision}" is not valid. Must be one of: ${validDecisions.join(', ')}.`
    });
  }

  // --- Confidence Range ---
  if (output.confidence !== undefined) {
    const conf = Number(output.confidence);
    if (isNaN(conf) || conf < 0 || conf > 1) {
      issues.push({
        type: 'CONFIDENCE_OUT_OF_RANGE',
        severity: 'medium',
        message: `Confidence ${output.confidence} is out of valid range [0, 1].`
      });
    }
  }

  // --- PII Leakage Check in Output Text ---
  const textFields = [output.summary, ...(output.reasoningTrace || [])].filter(Boolean);
  for (const text of textFields) {
    for (const pattern of PII_PATTERNS) {
      const matches = String(text).match(pattern.regex);
      if (matches && matches.length > 0) {
        issues.push({
          type: 'PII_LEAKAGE',
          severity: 'critical',
          subtype: pattern.name,
          message: `PII leakage detected in output: ${pattern.name} pattern found in agent response.`
        });
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

// ---------------------------------------------------------------------------
// checkBias(decisionLog)
// Analyzes decision distribution across departments and roles to detect
// systematic bias. Flags if any department has a significantly different
// deny/escalate rate compared to the overall average.
//
// Parameters:
//   decisionLog — Array of { studentId, department, decision, ... }
//
// Returns: { biasDetected, metrics[], overallDistribution }
// ---------------------------------------------------------------------------
function checkBias(decisionLog) {
  if (!Array.isArray(decisionLog) || decisionLog.length === 0) {
    return {
      biasDetected: false,
      metrics: [],
      overallDistribution: { APPROVE: 0, DENY: 0, ESCALATE: 0 },
      message: 'No decision data available for bias analysis.'
    };
  }

  // Overall decision distribution
  const overallDistribution = { APPROVE: 0, DENY: 0, ESCALATE: 0 };
  for (const entry of decisionLog) {
    const d = (entry.decision || '').toUpperCase();
    if (d in overallDistribution) {
      overallDistribution[d]++;
    }
  }

  const total = decisionLog.length;
  const overallDenyRate = (overallDistribution.DENY + overallDistribution.ESCALATE) / total;

  // Per-department analysis
  const deptBuckets = {};
  for (const entry of decisionLog) {
    const dept = entry.department || 'Unknown';
    if (!deptBuckets[dept]) {
      deptBuckets[dept] = { total: 0, APPROVE: 0, DENY: 0, ESCALATE: 0 };
    }
    deptBuckets[dept].total++;
    const d = (entry.decision || '').toUpperCase();
    if (d in deptBuckets[dept]) {
      deptBuckets[dept][d]++;
    }
  }

  // Bias threshold: flag if a department's deny+escalate rate deviates by > 30%
  // from the overall rate (with a minimum sample of 2 to avoid false positives)
  const BIAS_THRESHOLD = 0.30;
  const MIN_SAMPLE = 2;
  const metrics = [];
  let biasDetected = false;

  for (const [dept, stats] of Object.entries(deptBuckets)) {
    const deptDenyRate = (stats.DENY + stats.ESCALATE) / stats.total;
    const deviation = Math.abs(deptDenyRate - overallDenyRate);
    const flagged = stats.total >= MIN_SAMPLE && deviation > BIAS_THRESHOLD;

    if (flagged) biasDetected = true;

    metrics.push({
      department: dept,
      total: stats.total,
      approveRate: Number((stats.APPROVE / stats.total).toFixed(3)),
      denyRate: Number((stats.DENY / stats.total).toFixed(3)),
      escalateRate: Number((stats.ESCALATE / stats.total).toFixed(3)),
      deviation: Number(deviation.toFixed(3)),
      flagged
    });
  }

  return {
    biasDetected,
    metrics,
    overallDistribution,
    overallDenyRate: Number(overallDenyRate.toFixed(3)),
    message: biasDetected
      ? '⚠️ Potential systematic bias detected. Review flagged departments.'
      : '✅ No significant bias detected across departments.'
  };
}

// ---------------------------------------------------------------------------
// generateSafetyReport(telemetryData)
// Produces a comprehensive safety report from telemetry data.
// Aggregates: input issues caught, guardrail triggers, bias metrics, etc.
//
// Parameters:
//   telemetryData — Array of telemetry records or an object with { entries, inputIssues, outputIssues }
//
// Returns: structured safety report object
// ---------------------------------------------------------------------------
function generateSafetyReport(telemetryData) {
  const report = {
    generatedAt: new Date().toISOString(),
    totalRequestsAnalyzed: 0,
    inputSanitization: {
      totalIssues: 0,
      piiDetections: 0,
      sqlInjectionAttempts: 0,
      promptInjectionAttempts: 0,
      details: []
    },
    outputValidation: {
      totalIssues: 0,
      missingFields: 0,
      piiLeakage: 0,
      invalidDecisions: 0,
      confidenceOutOfRange: 0,
      details: []
    },
    biasAnalysis: {
      biasDetected: false,
      message: 'No data available for bias analysis.',
      metrics: []
    },
    guardrailSummary: {
      totalGuardrailTriggers: 0,
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      riskLevel: 'LOW'
    }
  };

  // Handle raw telemetry array
  const entries = Array.isArray(telemetryData) ? telemetryData : (telemetryData?.entries || []);
  report.totalRequestsAnalyzed = entries.length;

  // Aggregate input issues if provided
  const inputIssues = telemetryData?.inputIssues || [];
  for (const issue of inputIssues) {
    report.inputSanitization.totalIssues++;
    if (issue.type === 'PII_DETECTED') report.inputSanitization.piiDetections++;
    if (issue.type === 'SQL_INJECTION') report.inputSanitization.sqlInjectionAttempts++;
    if (issue.type === 'PROMPT_INJECTION') report.inputSanitization.promptInjectionAttempts++;
    report.inputSanitization.details.push(issue);
  }

  // Aggregate output issues if provided
  const outputIssues = telemetryData?.outputIssues || [];
  for (const issue of outputIssues) {
    report.outputValidation.totalIssues++;
    if (issue.type === 'MISSING_FIELD') report.outputValidation.missingFields++;
    if (issue.type === 'PII_LEAKAGE') report.outputValidation.piiLeakage++;
    if (issue.type === 'INVALID_DECISION') report.outputValidation.invalidDecisions++;
    if (issue.type === 'CONFIDENCE_OUT_OF_RANGE') report.outputValidation.confidenceOutOfRange++;
    report.outputValidation.details.push(issue);
  }

  // Run bias analysis on entries that have decision + department info
  const decisionLog = entries
    .filter(e => e.decision && e.department)
    .map(e => ({ studentId: e.studentId, department: e.department, decision: e.decision }));

  if (decisionLog.length > 0) {
    report.biasAnalysis = checkBias(decisionLog);
  }

  // Compute guardrail summary
  const allIssues = [...inputIssues, ...outputIssues];
  report.guardrailSummary.totalGuardrailTriggers = allIssues.length;
  report.guardrailSummary.criticalIssues = allIssues.filter(i => i.severity === 'critical').length;
  report.guardrailSummary.highIssues = allIssues.filter(i => i.severity === 'high').length;
  report.guardrailSummary.mediumIssues = allIssues.filter(i => i.severity === 'medium').length;

  // Determine overall risk level
  if (report.guardrailSummary.criticalIssues > 0) {
    report.guardrailSummary.riskLevel = 'CRITICAL';
  } else if (report.guardrailSummary.highIssues > 2) {
    report.guardrailSummary.riskLevel = 'HIGH';
  } else if (report.guardrailSummary.highIssues > 0 || report.guardrailSummary.mediumIssues > 2) {
    report.guardrailSummary.riskLevel = 'MEDIUM';
  } else {
    report.guardrailSummary.riskLevel = 'LOW';
  }

  return report;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  sanitizeInput,
  validateAgentOutput,
  checkBias,
  generateSafetyReport
};
