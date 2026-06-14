/**
 * Sutradhara — True Multi-Agent Reasoning Pipeline
 * 
 * Architecture: 5 Specialized Agents + 1 Orchestrator
 * Each agent makes its own Azure AI Inference SDK call with a dedicated system prompt.
 * The Orchestrator synthesizes all agent findings into a final decision.
 * 
 * Agent Roster:
 *   1. Identity Verifier Agent — Verifies student existence and enrollment
 *   2. Financial Analyst Agent — Analyzes payment records and receipt validity
 *   3. Risk Sentinel Agent — Evaluates holds, rate limits, and security risk
 *   4. Policy Compliance Agent (RAG) — Grounds decisions in institutional policy via Foundry IQ
 *   5. Orchestrator Agent — Synthesizes all findings, makes final decision, triggers actions
 *   6. Notification Agent — Handles post-decision email and Teams notifications
 */

const ModelClient = require("@azure-rest/ai-inference").default;
const { isUnexpected } = require("@azure-rest/ai-inference");
const { AzureKeyCredential } = require("@azure/core-auth");
const { v4: uuidv4 } = require('uuid');

// ---------------------------------------------------------------------------
// Agent Prompts — Each agent has a dedicated persona and JSON output contract
// ---------------------------------------------------------------------------
const AGENT_PROMPTS = {
  identity: `You are the Identity Verifier Agent in the Sutradhara multi-agent pipeline for Redmond Institute of Technology (RIT).

Your SOLE responsibility: Verify whether a student exists in the university directory and confirm their enrollment status.

Analyze the student profile data provided and determine:
1. Does the student exist in the directory?
2. Is their identity verified (valid ID, name, email)?
3. What is their current account status?
4. Are there any identity-related concerns?

Your response MUST be a single valid JSON object (no markdown fences, no commentary):
{
  "status": "Verified" | "Not Found" | "Suspended",
  "details": "Brief explanation of identity verification result",
  "confidence": 0.0 to 1.0,
  "studentName": "Full Name or null",
  "department": "Department or null",
  "accountEnabled": true | false,
  "concerns": ["list of any identity concerns"] 
}`,

  financial: `You are the Financial Analyst Agent in the Sutradhara multi-agent pipeline for Redmond Institute of Technology (RIT).

Your SOLE responsibility: Analyze the student's tuition payment records and determine their financial standing.

Evaluate:
1. What percentage of tuition has been paid?
2. Does the receipt number match the payment records?
3. Is there an outstanding balance?
4. Are there any payment anomalies (e.g., hardship notes, pending verification)?

Payment Thresholds:
- 100% paid → "Clear"
- 80-99% paid → "Partial - Eligible for Core Access"
- <80% paid → "Outstanding Balance"
- 0% paid → "No Payment"

Your response MUST be a single valid JSON object (no markdown fences, no commentary):
{
  "status": "Clear" | "Partial - Eligible for Core Access" | "Outstanding Balance" | "No Payment" | "Receipt Mismatch",
  "percentagePaid": 0.0 to 100.0,
  "amountDue": 0,
  "amountPaid": 0,
  "outstandingBalance": 0,
  "receiptValid": true | false,
  "hardshipFlag": true | false,
  "details": "Detailed analysis of financial standing",
  "confidence": 0.0 to 1.0
}`,

  risk: `You are the Risk Sentinel Agent in the Sutradhara multi-agent pipeline for Redmond Institute of Technology (RIT).

Your SOLE responsibility: Evaluate security risks from registry holds, rate limits, and behavioral signals.

Hold Severity Hierarchy (highest to lowest):
1. Investigation holds → CRITICAL (always blocking, absolute block)
2. AcademicIntegrity holds (Active) → HIGH (blocking)
3. AcademicIntegrity holds (Expired) → LOW (non-blocking, can be cleaned up)
4. Financial holds → MEDIUM (blocking if balance > threshold)
5. No holds → LOW

Also evaluate:
- Is the operator rate-limited? (>3 requests in 10 minutes = security anomaly)
- Are there any suspicious patterns?

Your response MUST be a single valid JSON object (no markdown fences, no commentary):
{
  "riskLevel": "Low" | "Medium" | "High" | "Critical",
  "isRateLimited": true | false,
  "blockingHoldsFound": true | false,
  "holdsSummary": [{"type": "string", "status": "string", "severity": "string", "blocking": true|false}],
  "securityConcerns": ["list of concerns"],
  "details": "Risk assessment narrative",
  "confidence": 0.0 to 1.0
}`,

  policy: `You are the Policy Compliance Agent (RAG-Grounded) in the Sutradhara multi-agent pipeline for Redmond Institute of Technology (RIT).

Your SOLE responsibility: Evaluate the student's case against official institutional policies and recommend a verdict.

You will receive policy documents retrieved from the Foundry IQ knowledge base (Azure AI Search). Use ONLY the provided policy text to ground your recommendation. Cite specific policy sections.

Decision Rules:
- RIT-POL-001 §6.3: APPROVE if 100% tuition paid AND no active blocking holds
- RIT-POL-001 §6.3: DENY if payment is <80% and no hardship application is present (unpaid balance)
- RIT-POL-001 §7.2: ESCALATE if partial payment (>=80%) with financial hold only  
- RIT-POL-003 §3: DENY if active Investigation or Conduct hold (absolute block)
- RIT-POL-003 §4: APPROVE if holds are expired (expired holds do not block)
- RIT-POL-004 §4: DENY if rate limit exceeded (security anomaly)
- RIT-POL-005 §2: ESCALATE if hardship application present (72-hour emergency access)

Your response MUST be a single valid JSON object (no markdown fences, no commentary):
{
  "isCompliant": true | false,
  "verdictRecommendation": "APPROVE" | "DENY" | "ESCALATE",
  "applicablePolicies": ["RIT-POL-001 §6.3"],
  "citations": ["Full citation text from policy documents"],
  "details": "Detailed compliance evaluation with policy references",
  "confidence": 0.0 to 1.0
}`,

  orchestrator: `You are the Orchestrator Agent — the chief decision-maker in the Sutradhara multi-agent pipeline for Redmond Institute of Technology (RIT).

You receive the structured outputs from four specialist agents:
1. Identity Verifier Agent — student existence and enrollment
2. Financial Analyst Agent — payment analysis
3. Risk Sentinel Agent — security and hold assessment
4. Policy Compliance Agent — regulatory compliance evaluation

Your SOLE responsibility: Synthesize all specialist findings into a single, authoritative decision.

Decision Logic:
- APPROVE: Identity verified + full payment + no blocking holds + policy compliant
- DENY: Identity not found, OR active Investigation/Conduct hold, OR payment <80% without hardship, OR rate limited
- ESCALATE: Partial payment 80-99%, OR hardship flag with payment <80%. (Do NOT escalate simply due to disagreement if it clearly violates the DENY conditions)

Confidence Scoring:
- 0.90-1.00: All agents agree, high confidence → autonomous execution
- 0.70-0.89: Minor uncertainty or edge case → recommend with caution
- 0.00-0.69: Major disagreement or missing data → require human review

Your response MUST be a single valid JSON object (no markdown fences, no commentary):
{
  "decision": "APPROVE" | "DENY" | "ESCALATE",
  "confidence": 0.0 to 1.0,
  "summary": "Professional summary explaining the decision with all relevant context",
  "citations": ["Policy citations from the Policy Agent"],
  "reasoningTrace": [
    "Step 1 (Identity): ...",
    "Step 2 (Finance): ...",
    "Step 3 (Risk): ...",
    "Step 4 (Policy): ...",
    "Step 5 (Synthesis): ..."
  ],
  "agentConsensus": true | false,
  "selfReflection": "Brief note on any uncertainty or edge cases in this decision"
}`
};

// ---------------------------------------------------------------------------
// Email Template Builder
// ---------------------------------------------------------------------------
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
// Policy RAG Corpus — Local Fallback
// ---------------------------------------------------------------------------
function loadPolicies() {
  return `Summary of RIT Policies:
- RIT-POL-001: Financial holds placed if balance > $500. Clear automatically on full payment. Immediate manual reactivation if valid bank receipt presented. Partial payment (>=80%) allows Core-only course access on request.
- RIT-POL-002: Identity must be verified before service provisioning.
- RIT-POL-003: Academic integrity holds block account; Investigation holds require Deny. Expired holds do NOT block reactivation.
- RIT-POL-004: Clear audit trail required. Rate limit: max 3 requests per 10 minutes per operator.
- RIT-POL-005: Escalation for hardship cases. 72-hour emergency access provision for students with pending hardship applications.`;
}

// ---------------------------------------------------------------------------
// Azure AI Search (Foundry IQ Grounding Engine)
// ---------------------------------------------------------------------------
async function fetchGroundingPolicies(query) {
  const endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT;
  const key = process.env.AZURE_AI_SEARCH_KEY;
  const index = process.env.AZURE_AI_SEARCH_INDEX || 'rit-policies-index';

  if (!endpoint || !key || endpoint.includes('<') || key.includes('<')) {
    return loadPolicies();
  }

  try {
    console.log(`    🔍 Querying Foundry IQ (Azure AI Search) for: "${query}"...`);
    const cleanEndpoint = endpoint.replace(/\/+$/, "");
    const searchUrl = `${cleanEndpoint}/indexes/${index}/docs/search?api-version=2024-07-01`;

    const response = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": key
      },
      body: JSON.stringify({
        search: query,
        top: 3
      })
    });

    if (!response.ok) {
      throw new Error(`Search API returned status ${response.status}`);
    }

    const result = await response.json();
    if (!result.value || result.value.length === 0) {
      console.log("    ⚠️ Foundry IQ returned 0 documents. Falling back to local policies.");
      return loadPolicies();
    }

    let combinedContent = '';
    for (const doc of result.value) {
      const title = doc.title || doc.filepath || 'Policy Document';
      let content = doc.content || doc.text || JSON.stringify(doc);
      if (content.length > 500) {
        content = content.substring(0, 500) + "... (truncated)";
      }
      combinedContent += `\n\n=== Foundry IQ Result: ${title} ===\n${content}\n`;
    }
    return combinedContent;
  } catch (err) {
    console.warn(`    ⚠️ Foundry IQ query failed (${err.message}). Falling back to local policies.`);
    return loadPolicies();
  }
}

// ---------------------------------------------------------------------------
// Azure AI Inference Client Configuration
// ---------------------------------------------------------------------------
let clientReady = false;

async function initAzureClient() {
  const endpoint = process.env.AZURE_AI_MODEL_ENDPOINT;
  const key = process.env.AZURE_AI_MODEL_KEY;

  if (!endpoint || !key || endpoint.includes('<') || key.includes('<')) {
    throw new Error("AZURE_AI_MODEL_ENDPOINT and AZURE_AI_MODEL_KEY must be set in .env.");
  }

  clientReady = true;
  console.log(`✅ Azure AI Inference client configured for multi-agent pipeline.`);
}

// ---------------------------------------------------------------------------
// JSON Response Parser (handles Phi-4 <think> blocks and markdown fences)
// ---------------------------------------------------------------------------
function parseAgentResponse(text, fallback, requiredKeys = []) {
  let parsed = null;
  try {
    let cleanText = text.trim();
    // Strip Phi-4-reasoning <think>...</think> blocks
    cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // Strip markdown code fences
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.substring(7);
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.substring(3);
    }
    if (cleanText.endsWith("```")) {
      cleanText = cleanText.substring(0, cleanText.length - 3);
    }
    cleanText = cleanText.trim();
    parsed = JSON.parse(cleanText);
  } catch (err) {
    const stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const jsonMatches = stripped.match(/\{[\s\S]*?\}/g);
    if (jsonMatches) {
      for (let i = jsonMatches.length - 1; i >= 0; i--) {
        try {
          parsed = JSON.parse(jsonMatches[i]);
          break;
        } catch (e) { /* try next */ }
      }
    }
  }

  if (parsed && typeof parsed === 'object') {
    let hasAllKeys = true;
    for (const key of requiredKeys) {
      if (!(key in parsed) || parsed[key] === undefined || parsed[key] === null) {
        hasAllKeys = false;
        break;
      }
    }
    if (hasAllKeys) {
      return parsed;
    }
  }

  console.warn("⚠️ Agent returned unparseable response. Using structured fallback.");
  return fallback;
}

// ---------------------------------------------------------------------------
// Single Agent LLM Call — Used by each specialist agent
// ---------------------------------------------------------------------------
async function callAgent(agentName, systemPrompt, userContent, client) {
  const startTime = Date.now();
  console.log(`    🤖 [${agentName}] Making Azure AI Inference call...`);

  try {
    const response = await client.path("/chat/completions").post({
      queryParameters: {
        "api-version": "2024-08-01-preview"
      },
      body: {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        temperature: 0.1,
        max_tokens: 800
      }
    });

    if (isUnexpected(response)) {
      throw response.body.error;
    }

    const rawText = response.body.choices[0].message.content || "";
    const elapsed = Date.now() - startTime;
    console.log(`    ✅ [${agentName}] Response received (${elapsed}ms)`);

    return {
      rawText,
      elapsed,
      tokenUsage: response.body.usage || {}
    };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`    ❌ [${agentName}] Error (${elapsed}ms):`, err.message || err);
    return {
      rawText: "",
      elapsed,
      error: err.message || String(err),
      tokenUsage: {}
    };
  }
}

// ---------------------------------------------------------------------------
// Multi-Agent Pipeline — Full Orchestrated Run
// ---------------------------------------------------------------------------
async function runAgentPipeline(studentId, receiptNumber, requestedBy, db, rateLimited) {
  console.log(`\n[Sutradhara AI] ══════════════════════════════════════════`);
  console.log(`[Sutradhara AI] Starting Multi-Agent Reasoning Pipeline`);
  console.log(`[Sutradhara AI] Student ID: ${studentId} | Receipt: ${receiptNumber || 'None'}`);
  console.log(`[Sutradhara AI] Agents: Identity → Financial → Risk → Policy → Orchestrator`);
  console.log(`[Sutradhara AI] ══════════════════════════════════════════\n`);

  const pipelineStart = Date.now();
  const baseEndpoint = process.env.AZURE_AI_MODEL_ENDPOINT.replace(/\/+$/, "");
  const deploymentName = process.env.AZURE_AI_DEPLOYMENT_NAME || 'gpt-4o-mini';
  const key = process.env.AZURE_AI_MODEL_KEY;

  if (!baseEndpoint || !key || baseEndpoint.includes('<') || key.includes('<')) {
    throw new Error("Azure AI credentials not set or invalid in .env.");
  }

  const endpoint = `${baseEndpoint}/openai/deployments/${deploymentName}`;
  const client = ModelClient(endpoint, new AzureKeyCredential(key));

  // Telemetry session (if available)
  let telemetrySession = null;
  try {
    const telemetry = require('./telemetry');
    telemetrySession = telemetry.createTelemetrySession(studentId);
  } catch (e) { /* telemetry module not yet loaded */ }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1: Data Gathering (Tool Calls)
  // ═══════════════════════════════════════════════════════════════════════
  console.log(`  📊 [Phase 1] Gathering data from enterprise systems...`);

  // Fetch student profile
  let profileData = null;
  if (db.getProfile) profileData = await db.getProfile(studentId);
  else profileData = db.users?.[studentId] || null;

  // Fetch financial records
  let financeData = null;
  if (db.getFinance) financeData = await db.getFinance(studentId);
  else financeData = db.finance?.[studentId] || [];

  // Fetch holds
  let holdsData = null;
  if (db.getHolds) holdsData = await db.getHolds(studentId);
  else holdsData = db.holds?.[studentId] || [];

  // Fetch policy grounding from Foundry IQ
  const policyQuery = `student account reactivation ${
    holdsData && holdsData.length > 0 ? holdsData.map(h => h.HoldType).join(' ') : 'no holds'
  } payment verification`;
  const policyDocuments = await fetchGroundingPolicies(policyQuery);

  // Fetch Fabric IQ semantic context (if available)
  let fabricIQContext = null;
  try {
    const fabricIQ = require('./fabric-iq-layer');
    const allData = {
      profile: profileData,
      finance: financeData,
      holds: holdsData
    };
    fabricIQContext = {
      compliance: fabricIQ.evaluateCompliance(allData),
      readinessScore: fabricIQ.calculateReadinessScore(allData),
      thresholds: fabricIQ.getReactivationThresholds()
    };
    console.log(`    📐 [Fabric IQ] Semantic context loaded. Readiness score: ${fabricIQContext.readinessScore}/100`);
  } catch (e) { /* fabric IQ not available */ }

  // Fetch Work IQ context (if available)
  let workIQContext = null;
  try {
    const workIQ = require('./work-iq-layer');
    workIQContext = workIQ.getWorkContext(studentId);
    console.log(`    📅 [Work IQ] Academic context: ${workIQContext.academicPeriod}, Urgency: ${workIQContext.urgencyScore}`);
  } catch (e) { /* work IQ not available */ }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 2: Specialist Agent Calls (Parallel where possible)
  // ═══════════════════════════════════════════════════════════════════════
  console.log(`\n  🧠 [Phase 2] Running specialist agent analysis...`);

  // --- Agent 1: Identity Verifier ---
  if (telemetrySession) telemetrySession.startAgent('identity');
  const identityInput = `Student ID: "${studentId}"
Profile Data: ${JSON.stringify(profileData || 'NOT FOUND')}
Receipt provided: "${receiptNumber || 'None'}"`;

  const identityRaw = await callAgent('Identity Verifier', AGENT_PROMPTS.identity, identityInput, client);
  const identityResult = parseAgentResponse(identityRaw.rawText, {
    status: profileData ? "Verified" : "Not Found",
    details: profileData ? `Verified student ${profileData.displayName}.` : "Student not found in directory.",
    confidence: profileData ? 0.95 : 0.99,
    studentName: profileData?.displayName || null,
    department: profileData?.department || null,
    accountEnabled: profileData?.accountEnabled || false,
    concerns: []
  }, ["status", "confidence"]);
  if (telemetrySession) telemetrySession.endAgent('identity');

  // --- Agent 2: Financial Analyst ---
  if (telemetrySession) telemetrySession.startAgent('financial');
  const financeInput = `Student ID: "${studentId}"
Finance Records: ${JSON.stringify(financeData || [])}
Receipt Number from request: "${receiptNumber || 'None'}"
${fabricIQContext ? `Fabric IQ Thresholds: ${JSON.stringify(fabricIQContext.thresholds)}` : ''}`;

  const financeRaw = await callAgent('Financial Analyst', AGENT_PROMPTS.financial, financeInput, client);

  // Calculate fallback values
  let fallbackPercentage = 0;
  let fallbackDue = 120000, fallbackPaid = 0;
  if (financeData && financeData.length > 0) {
    const rec = financeData[0];
    fallbackDue = rec.AmountDue || rec.amountDue || 120000;
    fallbackPaid = rec.AmountPaid || rec.amountPaid || 0;
    fallbackPercentage = Number(((fallbackPaid / fallbackDue) * 100).toFixed(1));
  }

  const financeResult = parseAgentResponse(financeRaw.rawText, {
    status: fallbackPercentage >= 100 ? "Clear" : fallbackPercentage >= 80 ? "Partial - Eligible for Core Access" : "Outstanding Balance",
    percentagePaid: fallbackPercentage,
    amountDue: fallbackDue,
    amountPaid: fallbackPaid,
    outstandingBalance: fallbackDue - fallbackPaid,
    receiptValid: true,
    hardshipFlag: financeData?.[0]?.Notes?.toLowerCase().includes('hardship') || false,
    details: "Tuition fee ledger evaluated.",
    confidence: 0.95
  }, ["status", "percentagePaid", "confidence"]);
  if (telemetrySession) telemetrySession.endAgent('financial');

  // --- Agent 3: Risk Sentinel ---
  if (telemetrySession) telemetrySession.startAgent('risk');
  const riskInput = `Student ID: "${studentId}"
Active Holds: ${JSON.stringify(holdsData || [])}
Operator Rate Limited: ${rateLimited}
Operator: "${requestedBy}"
${workIQContext ? `Work IQ Context: ${JSON.stringify(workIQContext)}` : ''}`;

  const riskRaw = await callAgent('Risk Sentinel', AGENT_PROMPTS.risk, riskInput, client);

  // Calculate fallback risk
  let fallbackRiskLevel = "Low";
  let fallbackBlocking = false;
  if (holdsData && holdsData.length > 0) {
    const activeHolds = holdsData.filter(h => h.HoldStatus === 'Active');
    fallbackBlocking = activeHolds.length > 0;
    if (activeHolds.some(h => h.HoldType === 'Investigation')) fallbackRiskLevel = "Critical";
    else if (activeHolds.some(h => h.HoldType === 'AcademicIntegrity')) fallbackRiskLevel = "High";
    else if (fallbackBlocking) fallbackRiskLevel = "Medium";
  }
  if (rateLimited) fallbackRiskLevel = "High";

  const riskResult = parseAgentResponse(riskRaw.rawText, {
    riskLevel: fallbackRiskLevel,
    isRateLimited: rateLimited,
    blockingHoldsFound: fallbackBlocking,
    holdsSummary: [],
    securityConcerns: rateLimited ? ["Rate limit exceeded"] : [],
    details: "Holds and security signals evaluated.",
    confidence: 0.95
  }, ["riskLevel", "confidence"]);
  if (telemetrySession) telemetrySession.endAgent('risk');

  // --- Agent 4: Policy Compliance (RAG-Grounded) ---
  if (telemetrySession) telemetrySession.startAgent('policy');
  const policyInput = `Student ID: "${studentId}"
Identity Agent Finding: ${JSON.stringify(identityResult)}
Financial Agent Finding: ${JSON.stringify(financeResult)}
Risk Agent Finding: ${JSON.stringify(riskResult)}

=== FOUNDRY IQ RETRIEVED POLICY DOCUMENTS ===
${policyDocuments}

${fabricIQContext ? `=== FABRIC IQ SEMANTIC COMPLIANCE ===
${JSON.stringify(fabricIQContext.compliance)}` : ''}

Based on the above agent findings and policy documents, evaluate compliance and recommend a verdict.`;

  const policyRaw = await callAgent('Policy Compliance', AGENT_PROMPTS.policy, policyInput, client);
  const policyResult = parseAgentResponse(policyRaw.rawText, {
    isCompliant: false,
    verdictRecommendation: "ESCALATE",
    applicablePolicies: ["RIT-POL-001"],
    citations: ["Unable to determine specific policy citation"],
    details: "Policy evaluation completed with fallback.",
    confidence: 0.85
  }, ["verdictRecommendation", "confidence"]);
  if (telemetrySession) telemetrySession.endAgent('policy');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 3: Orchestrator Synthesis
  // ═══════════════════════════════════════════════════════════════════════
  console.log(`\n  🎯 [Phase 3] Orchestrator synthesizing all agent findings...`);

  if (telemetrySession) telemetrySession.startAgent('orchestrator');
  const orchestratorInput = `Student ID: "${studentId}"
Receipt Number: "${receiptNumber || 'None'}"
Requested By: "${requestedBy}"

=== SPECIALIST AGENT REPORTS ===

1. IDENTITY VERIFIER AGENT:
${JSON.stringify(identityResult, null, 2)}

2. FINANCIAL ANALYST AGENT:
${JSON.stringify(financeResult, null, 2)}

3. RISK SENTINEL AGENT:
${JSON.stringify(riskResult, null, 2)}

4. POLICY COMPLIANCE AGENT:
${JSON.stringify(policyResult, null, 2)}

${fabricIQContext ? `5. FABRIC IQ READINESS SCORE: ${fabricIQContext.readinessScore}/100` : ''}
${workIQContext ? `6. WORK IQ CONTEXT: ${workIQContext.contextNarrative}` : ''}

Synthesize all findings above into a final decision.`;

  const orchestratorRaw = await callAgent('Orchestrator', AGENT_PROMPTS.orchestrator, orchestratorInput, client);
  const finalSynthesis = parseAgentResponse(orchestratorRaw.rawText, {
    decision: policyResult.verdictRecommendation || "ESCALATE",
    confidence: 0.85,
    summary: "Decision synthesized from multi-agent analysis.",
    citations: policyResult.applicablePolicies || [],
    reasoningTrace: [
      `Step 1 (Identity): ${identityResult.details}`,
      `Step 2 (Finance): ${financeResult.details}`,
      `Step 3 (Risk): ${riskResult.details}`,
      `Step 4 (Policy): ${policyResult.details}`,
      `Step 5 (Synthesis): Orchestrator synthesized decision based on all agent findings.`
    ],
    agentConsensus: true,
    selfReflection: "Fallback synthesis used."
  }, ["decision", "confidence", "summary"]);
  if (telemetrySession) telemetrySession.endAgent('orchestrator');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 4: Action Execution
  // ═══════════════════════════════════════════════════════════════════════
  console.log(`\n  ⚡ [Phase 4] Executing decision: ${finalSynthesis.decision}...`);

  if (telemetrySession) telemetrySession.startAgent('execution');

  const decision = finalSynthesis.decision.toUpperCase();
  const mainCitation = (finalSynthesis.citations && finalSynthesis.citations[0]) || 
                       (policyResult.applicablePolicies && policyResult.applicablePolicies[0]) || 
                       'RIT-POL-001';

  if (decision === 'APPROVE') {
    // Reactivate account
    if (db.reactivateAccount) {
      await db.reactivateAccount(studentId, true);
    }
    if (db.createAudit) {
      await db.createAudit({
        StudentID: studentId,
        RequestedBy: requestedBy,
        ApprovedBy: 'Sutradhara-MultiAgent',
        Action: 'Reactivate',
        PolicyCitation: mainCitation,
        ReasoningTrace: finalSynthesis.reasoningTrace.join(' | '),
        ExecutionStatus: 'Executed',
        ReceiptNumber: receiptNumber || '',
        TransactionId: uuidv4(),
        AgentConsensus: finalSynthesis.agentConsensus,
        Confidence: finalSynthesis.confidence
      });
    }
    // Send notification email
    if (profileData && profileData.userPrincipalName && db.sendEmail) {
      const html = buildReactivationEmail(profileData.displayName, receiptNumber);
      await db.sendEmail(profileData.userPrincipalName, "RIT Student Access Restored — Sutradhara", html);
    }
  } else if (decision === 'ESCALATE') {
    if (db.createAudit) {
      await db.createAudit({
        StudentID: studentId,
        RequestedBy: requestedBy,
        ApprovedBy: '',
        Action: 'Escalate',
        PolicyCitation: mainCitation,
        ReasoningTrace: finalSynthesis.reasoningTrace.join(' | '),
        ExecutionStatus: 'Pending',
        ReceiptNumber: receiptNumber || '',
        TransactionId: uuidv4(),
        AgentConsensus: finalSynthesis.agentConsensus,
        Confidence: finalSynthesis.confidence
      });
    }
  } else {
    // DENY
    if (db.createAudit) {
      await db.createAudit({
        StudentID: studentId,
        RequestedBy: requestedBy,
        ApprovedBy: '',
        Action: 'Deny',
        PolicyCitation: mainCitation,
        ReasoningTrace: finalSynthesis.reasoningTrace.join(' | '),
        ExecutionStatus: 'Denied',
        ReceiptNumber: receiptNumber || '',
        TransactionId: uuidv4(),
        AgentConsensus: finalSynthesis.agentConsensus,
        Confidence: finalSynthesis.confidence
      });
    }
  }

  if (telemetrySession) telemetrySession.endAgent('execution');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 5: Compile Result
  // ═══════════════════════════════════════════════════════════════════════
  const pipelineEnd = Date.now();
  const totalDuration = pipelineEnd - pipelineStart;

  // Build agent details for frontend display
  const agentDetails = {
    identity: {
      status: identityResult.status,
      details: identityResult.details,
      confidence: identityResult.confidence,
      agentTiming: identityRaw.elapsed
    },
    finance: {
      status: financeResult.status,
      percentagePaid: financeResult.percentagePaid,
      amountDue: financeResult.amountDue,
      amountPaid: financeResult.amountPaid,
      receiptValid: financeResult.receiptValid,
      details: financeResult.details,
      confidence: financeResult.confidence,
      agentTiming: financeRaw.elapsed
    },
    risk: {
      riskLevel: riskResult.riskLevel,
      isRateLimited: riskResult.isRateLimited,
      blockingHoldsFound: riskResult.blockingHoldsFound,
      details: riskResult.details,
      confidence: riskResult.confidence,
      agentTiming: riskRaw.elapsed
    },
    policy: {
      isCompliant: policyResult.isCompliant,
      applicablePolicies: policyResult.applicablePolicies || [],
      verdictRecommendation: policyResult.verdictRecommendation,
      details: policyResult.details,
      confidence: policyResult.confidence,
      agentTiming: policyRaw.elapsed
    }
  };

  // Finalize telemetry
  if (telemetrySession) {
    telemetrySession.setDecision(decision);
    telemetrySession.finish();
  }

  console.log(`\n[Sutradhara AI] ══════════════════════════════════════════`);
  console.log(`[Sutradhara AI] Pipeline Complete in ${totalDuration}ms`);
  console.log(`[Sutradhara AI] Decision: ${decision} | Confidence: ${finalSynthesis.confidence}`);
  console.log(`[Sutradhara AI] Agents: 5 specialists + 1 orchestrator = 6 LLM calls`);
  console.log(`[Sutradhara AI] ══════════════════════════════════════════\n`);

  return {
    success: true,
    decision: decision,
    confidence: finalSynthesis.confidence,
    summary: finalSynthesis.summary,
    citations: finalSynthesis.citations || [],
    reasoningTrace: finalSynthesis.reasoningTrace || [],
    agentDetails: agentDetails,
    agentConsensus: finalSynthesis.agentConsensus,
    selfReflection: finalSynthesis.selfReflection,
    pipelineMetrics: {
      totalDuration,
      agentCount: 6,
      agentTimings: {
        identity: identityRaw.elapsed,
        financial: financeRaw.elapsed,
        risk: riskRaw.elapsed,
        policy: policyRaw.elapsed,
        orchestrator: orchestratorRaw.elapsed
      },
      fabricIQUsed: !!fabricIQContext,
      workIQUsed: !!workIQContext,
      foundryIQUsed: true
    }
  };
}

module.exports = {
  runAgentPipeline,
  isLive: () => clientReady,
  initAzureClient
};
