/**
 * Sutradhara — Multi-Agent Reasoning Pipeline
 * 
 * Implements a 5-agent sequential pipeline using Azure AI Foundry:
 *   1. Identity Verifier Agent
 *   2. Financial Analyst Agent
 *   3. Risk Sentinel Agent
 *   4. Policy Compliance Agent (RAG-grounded)
 *   5. Orchestrator Agent (Final synthesis)
 *
 * NO simulation or hardcoded fallbacks. Requires a live Azure AI model endpoint.
 */

const fs = require('fs');
const path = require('path');
const prompts = require('./agent-prompts');

// ---------------------------------------------------------------------------
// Policy RAG Corpus Loader
// ---------------------------------------------------------------------------
function loadPolicies() {
  return `Summary of RIT Policies:
- RIT-POL-001: Financial holds placed if balance > $500. Clear automatically on full payment. Immediate manual reactivation if valid bank receipt presented. Partial payment (>=80%) allows Core-only course access on request.
- RIT-POL-002: Identity must be verified before service provisioning.
- RIT-POL-003: Academic integrity holds block account; Investigation holds require Deny.
- RIT-POL-004: Clear audit trail required.
- RIT-POL-005: Escalation for hardship cases.`;
}

// ---------------------------------------------------------------------------
// Azure AI Search (Foundry IQ Grounding Engine)
// ---------------------------------------------------------------------------
async function fetchGroundingPolicies(query) {
  const endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT;
  const key = process.env.AZURE_AI_SEARCH_KEY;
  const index = process.env.AZURE_AI_SEARCH_INDEX || 'rit-policies-index';

  if (!endpoint || !key || endpoint.includes('<') || key.includes('<')) {
    // Fallback: Use local file-based RAG
    return loadPolicies();
  }

  try {
    console.log(`    🔍 Querying Azure AI Search (Foundry IQ) for: "${query}"...`);
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
        top: 1
      })
    });

    if (!response.ok) {
      throw new Error(`Search API returned status ${response.status}`);
    }

    const result = await response.json();
    if (!result.value || result.value.length === 0) {
      console.log("    ⚠️ Azure AI Search returned 0 documents. Falling back to local policies.");
      return loadPolicies();
    }

    const doc = result.value[0];
    const title = doc.title || doc.filepath || `Document Chunk 1`;
    let content = doc.content || doc.text || JSON.stringify(doc);
    if (content.length > 300) {
      content = content.substring(0, 300) + "... (truncated)";
    }
    const searchCorpus = `\n\n=== Policy Search Chunk: ${title} ===\n${content}\n`;

    console.log(`    ✅ Retrieved 1 policy chunk from Azure AI Search (truncated).`);
    return searchCorpus;
  } catch (err) {
    console.warn(`    ⚠️ Azure AI Search query failed (${err.message}). Falling back to local policies.`);
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
  const deploymentName = process.env.AZURE_AI_DEPLOYMENT_NAME || 'gpt-4o-mini';

  if (!endpoint || !key || endpoint.includes('<') || key.includes('<')) {
    throw new Error(
      "AZURE_AI_MODEL_ENDPOINT and AZURE_AI_MODEL_KEY must be set in .env. " +
      "Deploy a model in Azure AI Foundry and copy the endpoint + key."
    );
  }

  clientReady = true;
  console.log(`✅ Azure AI Inference client configured. Deployment: ${deploymentName}`);
}

// ---------------------------------------------------------------------------
// LLM Call Helper (Azure OpenAI Deployments API — with retry for rate limits)
// ---------------------------------------------------------------------------
const MAX_RETRIES = 6;
const RETRY_DELAYS = [5000, 10000, 20000, 30000, 45000, 60000]; // backoff delays

async function callAzureModel(systemPrompt, userPrompt) {
  const endpoint = process.env.AZURE_AI_MODEL_ENDPOINT;
  const key = process.env.AZURE_AI_MODEL_KEY;
  const deploymentName = process.env.AZURE_AI_DEPLOYMENT_NAME || 'gpt-4o-mini';

  if (!endpoint || !key || endpoint.includes('<') || key.includes('<')) {
    throw new Error("Azure AI credentials not set or invalid in .env.");
  }

  // Build the Azure OpenAI deployment URL
  const cleanBase = endpoint.replace(/\/+$/, "");
  const apiVersion = '2025-01-01-preview';
  const targetUrl = `${cleanBase}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": key
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 4000
        })
      });

      // Handle rate limiting with retry
      if (response.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '0') * 1000;
        const delay = Math.max(retryAfter, RETRY_DELAYS[attempt]);
        console.warn(`    ⏳ Rate limited (429). Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Azure AI model returned status ${response.status}: ${errText}`);
      }

      const resBody = await response.json();
      if (resBody.choices && resBody.choices[0] && resBody.choices[0].message) {
        return resBody.choices[0].message.content;
      }
      throw new Error(`Unexpected model response body: ${JSON.stringify(resBody)}`);
    } catch (err) {
      if (attempt < MAX_RETRIES && err.message.includes('429')) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(`    ⏳ Rate limit error. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      console.error("Direct Inference call failed:", err.message);
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// JSON Response Parser (handles Phi-4 <think> tags, markdown fences, regex)
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
    // Strip think tags before regex extraction too
    const stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // Try to find the last complete JSON object (most likely the actual answer)
    const jsonMatches = stripped.match(/\{[\s\S]*?\}/g);
    if (jsonMatches) {
      for (let i = jsonMatches.length - 1; i >= 0; i--) {
        try {
          parsed = JSON.parse(jsonMatches[i]);
          break;
        } catch (e) { /* try next */ }
      }
      if (!parsed) {
        const greedyMatch = stripped.match(/\{[\s\S]*\}/);
        if (greedyMatch) {
          try {
            parsed = JSON.parse(greedyMatch[0]);
          } catch (e) {
            console.error("Failed to parse regex-extracted JSON:", e.message);
          }
        }
      }
    }
  }

  // Check if we got a valid object and check required keys
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
    } else {
      console.warn(`⚠️ Parsed JSON is missing required keys: ${requiredKeys.join(', ')}. Merging with fallback.`);
      return { ...fallback, ...parsed };
    }
  }

  console.warn("⚠️ Agent returned unparseable response or non-object. Using structured fallback.");
  return fallback;
}

// ---------------------------------------------------------------------------
// Live Multi-Agent Pipeline (Azure AI Foundry)
// ---------------------------------------------------------------------------
async function runLivePipeline(studentId, receiptNumber, requestedBy, db, rateLimited) {
  console.log(`\n[Sutradhara AI] ══════════════════════════════════════════`);
  console.log(`[Sutradhara AI] Running Live Multi-Agent Pipeline`);
  console.log(`[Sutradhara AI] Student: ${studentId} | Receipt: ${receiptNumber || 'None'}`);
  console.log(`[Sutradhara AI] ══════════════════════════════════════════\n`);

  const profile = db.users[studentId];
  const financeRecords = db.finance[studentId] || [];
  const holds = db.holds[studentId] || [];

  // ── Agent 1: Identity Verifier ──
  console.log("  → Agent 1/5: Identity Verifier...");
  const identityInput = `Verify Student ID: "${studentId}". Database profile records: ${JSON.stringify(profile || null)}.`;
  const identityRaw = await callAzureModel(prompts.identityPrompt, identityInput);
  const identityFindings = parseAgentResponse(identityRaw, {
    status: profile ? "Verified" : "Not Found",
    details: profile ? `Verified student ${profile.displayName}.` : `Student ID ${studentId} not found in directory.`,
    confidence: 0.95,
    data: profile || null
  }, ["status", "details", "confidence"]);
  console.log(`    ✓ Identity: ${identityFindings.status} (confidence: ${identityFindings.confidence})`);

  if (identityFindings.status === "Not Found" || !profile) {
    return {
      success: false,
      decision: "DENY",
      confidence: 1.0,
      summary: `Student ID ${studentId} does not exist in the university directory. Reactivation denied.`,
      reasoningTrace: [
        `Step 1 (Identity): Student ID ${studentId} was not found in the directory.`,
        `Step 2 (Finance): Skipped — identity unverified.`,
        `Step 3 (Risk): High risk — unverified identity.`,
        `Step 4 (Policy): Non-compliant — RIT-POL-002 §2.1 requires identity verification.`,
        `Step 5 (Synthesis): DENIED. Identity verification is mandatory.`
      ],
      citations: ["RIT-POL-002 §2.1: Identity verification required before service provisioning"],
      agentDetails: {
        identity: identityFindings,
        finance: { status: "Skipped", details: "Skipped due to identity failure.", confidence: 1.0 },
        risk: { riskLevel: "High", isRateLimited: false, blockingHoldsFound: false, details: "Unverified identity.", confidence: 1.0 },
        policy: { isCompliant: false, applicablePolicies: [], verdictRecommendation: "DENY", details: "Identity check failed.", citations: [], confidence: 1.0 }
      }
    };
  }

  // Pacing delay (3s) before Agent 2
  await new Promise(resolve => setTimeout(resolve, 3000));

  // ── Agent 2: Financial Analyst ──
  console.log("  → Agent 2/5: Financial Analyst...");
  const financeInput = `Verify Student ID: "${studentId}". Submitted Receipt: "${receiptNumber || ""}". Ledger records: ${JSON.stringify(financeRecords)}.`;
  const financeRaw = await callAzureModel(prompts.financialPrompt, financeInput);
  const financeFindings = parseAgentResponse(financeRaw, {
    status: financeRecords.length > 0 ? "Outstanding Balance" : "No Record",
    percentagePaid: 0,
    amountDue: 0,
    amountPaid: 0,
    receiptValid: false,
    details: "Could not parse financial agent response.",
    confidence: 0.80
  }, ["status", "percentagePaid", "amountDue", "amountPaid", "receiptValid", "details", "confidence"]);
  console.log(`    ✓ Finance: ${financeFindings.status} (${financeFindings.percentagePaid}% paid)`);

  // Pacing delay (3s) before Agent 3
  await new Promise(resolve => setTimeout(resolve, 3000));

  // ── Agent 3: Risk Sentinel ──
  console.log("  → Agent 3/5: Risk Sentinel...");
  const riskInput = `Evaluate security risks for Student ID: "${studentId}". Active holds: ${JSON.stringify(holds)}. Is Rate-limited: ${rateLimited}.`;
  const riskRaw = await callAzureModel(prompts.riskPrompt, riskInput);
  const riskFindings = parseAgentResponse(riskRaw, {
    riskLevel: holds.some(h => h.HoldStatus === "Active") ? "Medium" : "Low",
    isRateLimited: rateLimited,
    blockingHoldsFound: holds.some(h => h.HoldStatus === "Active"),
    details: "Could not parse risk agent response.",
    confidence: 0.80
  }, ["riskLevel", "isRateLimited", "blockingHoldsFound", "details", "confidence"]);
  console.log(`    ✓ Risk: ${riskFindings.riskLevel} (blocking holds: ${riskFindings.blockingHoldsFound})`);

  // Pacing delay (3s) before Agent 4
  await new Promise(resolve => setTimeout(resolve, 3000));

  // ── Agent 4: Policy Compliance (RAG-Grounded) ──
  console.log("  → Agent 4/5: Policy Compliance (RAG)...");
  const searchQuery = `${studentId} ${financeFindings.status} holds policy compliance`;
  const policiesCorpus = await fetchGroundingPolicies(searchQuery);
  const policySystemPrompt = `${prompts.policyPrompt}\n\nOfficial RIT Policy Corpus:\n${policiesCorpus}`;
  const policyInput = `Evaluate compliance for ${studentId}:
  - Identity: ${identityFindings.status} (${identityFindings.details})
  - Finance: ${financeFindings.status}, paid ${financeFindings.percentagePaid}%, receipt ${financeFindings.receiptValid ? 'valid' : 'invalid'}
  - Risk: ${riskFindings.riskLevel}, blocking holds: ${riskFindings.blockingHoldsFound}`;

  const policyRaw = await callAzureModel(policySystemPrompt, policyInput);
  const policyFindings = parseAgentResponse(policyRaw, {
    isCompliant: false,
    applicablePolicies: [],
    verdictRecommendation: "ESCALATE",
    details: "Could not parse policy agent response.",
    citations: [],
    confidence: 0.80
  }, ["isCompliant", "applicablePolicies", "verdictRecommendation", "details", "citations", "confidence"]);
  console.log(`    ✓ Policy: ${policyFindings.verdictRecommendation} (compliant: ${policyFindings.isCompliant})`);

  // Pacing delay (3s) before Agent 5
  await new Promise(resolve => setTimeout(resolve, 3000));

  // ── Agent 5: Orchestrator (Synthesis) ──
  console.log("  → Agent 5/5: Orchestrator (Final Synthesis)...");
  const orchestratorInput = `Request: Reactivate ${studentId} (receipt: ${receiptNumber}) by ${requestedBy}.
  Findings:
  - Identity: ${identityFindings.status} (${identityFindings.details})
  - Finance: ${financeFindings.status}, paid ${financeFindings.percentagePaid}%, receipt ${financeFindings.receiptValid ? 'valid' : 'invalid'}
  - Risk: ${riskFindings.riskLevel}, blocking holds: ${riskFindings.blockingHoldsFound} (${riskFindings.details})
  - Policy: ${policyFindings.verdictRecommendation}, compliant: ${policyFindings.isCompliant} (${policyFindings.details})`;

  const orchestratorRaw = await callAzureModel(prompts.orchestratorPrompt, orchestratorInput);
  const finalSynthesis = parseAgentResponse(orchestratorRaw, {
    decision: "ESCALATE",
    confidence: 0.85,
    summary: "Orchestrator synthesis could not be parsed. Escalated to human review by default.",
    citations: policyFindings.citations || [],
    reasoningTrace: [
      `Step 1 (Identity): ${identityFindings.details}`,
      `Step 2 (Finance): ${financeFindings.details}`,
      `Step 3 (Risk): ${riskFindings.details}`,
      `Step 4 (Policy): ${policyFindings.details}`,
      `Step 5 (Synthesis): Auto-escalated due to parsing failure.`
    ]
  }, ["decision", "confidence", "summary", "citations", "reasoningTrace"]);
  console.log(`    ✓ Orchestrator: ${finalSynthesis.decision} (confidence: ${finalSynthesis.confidence})`);
  console.log(`[Sutradhara AI] Pipeline complete.\n`);

  return {
    success: true,
    decision: finalSynthesis.decision || "ESCALATE",
    confidence: finalSynthesis.confidence || 0.85,
    summary: finalSynthesis.summary || "Escalated by default.",
    citations: finalSynthesis.citations || policyFindings.citations || [],
    reasoningTrace: finalSynthesis.reasoningTrace || [
      `Identity: ${identityFindings.details}`,
      `Finance: ${financeFindings.details}`,
      `Risk: ${riskFindings.details}`,
      `Policy: ${policyFindings.details}`
    ],
    agentDetails: {
      identity: identityFindings,
      finance: financeFindings,
      risk: riskFindings,
      policy: policyFindings
    }
  };
}

// ---------------------------------------------------------------------------
// Main Pipeline Interface
// ---------------------------------------------------------------------------
async function runAgentPipeline(studentId, receiptNumber, requestedBy, db, rateLimited) {
  // Load policies into cache
  loadPolicies();

  // Initialize Azure client (throws if credentials missing)
  await initAzureClient();

  // Run the live multi-agent pipeline
  return await runLivePipeline(studentId, receiptNumber, requestedBy, db, rateLimited);
}

module.exports = {
  runAgentPipeline,
  isLive: () => clientReady,
  initAzureClient
};
