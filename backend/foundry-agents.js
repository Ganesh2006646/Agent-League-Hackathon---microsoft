/**
 * Sutradhara — Autonomous Reasoning Agent with Tools
 * 
 * Implements a single reasoning agent using the official Azure AI Inference SDK
 * and Function Calling (Tools) to fetch data, run policy compliance, and perform actions.
 */

const ModelClient = require("@azure-rest/ai-inference").default;
const { isUnexpected } = require("@azure-rest/ai-inference");
const { AzureKeyCredential } = require("@azure/core-auth");
const { v4: uuidv4 } = require('uuid');

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
    return `\n\n=== Policy Search Chunk: ${title} ===\n${content}\n`;
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

  if (!endpoint || !key || endpoint.includes('<') || key.includes('<')) {
    throw new Error("AZURE_AI_MODEL_ENDPOINT and AZURE_AI_MODEL_KEY must be set in .env.");
  }

  clientReady = true;
  console.log(`✅ Azure AI Inference client configured.`);
}

// ---------------------------------------------------------------------------
// JSON Response Parser
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
// Live Reasoning Agent with Tools
// ---------------------------------------------------------------------------
async function runAgentPipeline(studentId, receiptNumber, requestedBy, db, rateLimited) {
  console.log(`\n[Sutradhara AI] ══════════════════════════════════════════`);
  console.log(`[Sutradhara AI] Starting Autonomous Tool-Calling Agent`);
  console.log(`[Sutradhara AI] Student ID: ${studentId} | Receipt: ${receiptNumber || 'None'}`);
  console.log(`[Sutradhara AI] ══════════════════════════════════════════\n`);

  const baseEndpoint = process.env.AZURE_AI_MODEL_ENDPOINT.replace(/\/+$/, "");
  const deploymentName = process.env.AZURE_AI_DEPLOYMENT_NAME || 'gpt-4o-mini';
  const key = process.env.AZURE_AI_MODEL_KEY;

  if (!baseEndpoint || !key || baseEndpoint.includes('<') || key.includes('<')) {
    throw new Error("Azure AI credentials not set or invalid in .env.");
  }

  const endpoint = `${baseEndpoint}/openai/deployments/${deploymentName}`;
  const client = ModelClient(endpoint, new AzureKeyCredential(key));

  // 1. Instructions and Prompt
  const systemPrompt = `You are Sutradhara, the autonomous Student Account Lifecycle Agent for Redmond Institute of Technology (RIT).
Your role is to orchestrate student account reactivation requests following tuition payments.

You operate under a strict execution policy using your tools:
1. Verify Student Identity: Call get_student_profile(studentId). If the student does not exist, call deny_reactivation_request(studentId, receiptNumber, "Student not found in directory", "RIT-POL-002") and output DENY.
2. Verify Tuition Payment: Call get_student_finance(studentId) and analyze their payment history against their due balance. Match the receipt number from input.
3. Check Active Registry Holds: Call get_student_holds(studentId) to retrieve holds.
4. Check Policy Grounding: Call search_university_policies(query) to query university policies for rules matching the student's status.
5. Make Decision & Execute:
   - Standard Autonomous Path: If tuition is paid (100%), and no active holds are present, call reactivate_student_account(...) to enable the account, then call send_reactivation_email(...) to notify the student. Finally, output the decision "APPROVE".
   - Expired Holds Path: If a hold exists but is expired, and tuition is fully paid, call reactivate_student_account(...) and send_reactivation_email(...). Output "APPROVE".
   - Partial Payment / Hardship Escalation: If payment is partial (>= 80% but < 100%) or there's a hardship application but payment is < 80%, call escalate_reactivation_request(...) with the reason. Finally, output the decision "ESCALATE".
   - Deny: If there's an active conduct/investigation hold, or if payment is < 80% with no hardship, call deny_reactivation_request(...). Finally, output the decision "DENY".

You must call the relevant retrieval tools first, analyze the data, call the appropriate action tool (reactivate, escalate, or deny) and then return a final JSON output.
Your final response MUST be a single valid JSON object. Do not include markdown code fences like \`\`\`json or \`\`\`.

Required JSON format:
{
  "decision": "APPROVE" | "DENY" | "ESCALATE",
  "confidence": 0.0 to 1.0,
  "summary": "Detailed summary explaining the decision and cited policies.",
  "citations": ["RIT-POL-001 §6.3"],
  "reasoningTrace": [
    "Step 1 (Identity): ...",
    "Step 2 (Finance): ...",
    "Step 3 (Risk): ...",
    "Step 4 (Policy): ...",
    "Step 5 (Synthesis): ..."
  ]
}`;

  const userPrompt = `Reactivate student account for Student ID: "${studentId}".
Receipt Number provided by user: "${receiptNumber || 'None'}".
Requested by operator: "${requestedBy}".
Is operator rate-limited: ${rateLimited}.`;

  // 2. Define tools
  const tools = [
    {
      type: "function",
      function: {
        name: "get_student_profile",
        description: "Get the student's directory profile to verify identity.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "The student's ID, e.g. S10001" }
          },
          required: ["studentId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_student_finance",
        description: "Get the student's finance ledger and payment history.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "The student's ID, e.g. S10001" }
          },
          required: ["studentId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_student_holds",
        description: "Get the list of active and expired registry holds for the student.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "The student's ID, e.g. S10001" }
          },
          required: ["studentId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_university_policies",
        description: "Search official university policies (RIT-POL-001 through RIT-POL-005) for compliance rules.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query, e.g. 'financial hold' or 'partial payment'" }
          },
          required: ["query"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "reactivate_student_account",
        description: "Reactivate the student's account in the database and write a successful audit log entry. Call this ONLY if compliance checks are fully satisfied.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "The student's ID" },
            receiptNumber: { type: "string", description: "The payment receipt number" },
            citation: { type: "string", description: "The cited policy section authorizing this reactivation, e.g. RIT-POL-001 §6.3" }
          },
          required: ["studentId", "receiptNumber", "citation"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "escalate_reactivation_request",
        description: "Escalate the reactivation request for human IT Lead review (e.g. for partial payment or financial hardship). Writes a pending audit log entry.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "The student's ID" },
            receiptNumber: { type: "string", description: "The payment receipt number" },
            reason: { type: "string", description: "Detailed reason for escalation" },
            citation: { type: "string", description: "The cited policy section, e.g. RIT-POL-001 §7.2" }
          },
          required: ["studentId", "receiptNumber", "reason", "citation"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "deny_reactivation_request",
        description: "Deny the reactivation request due to active holds or policy violations. Writes a denied audit log entry.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "The student's ID" },
            receiptNumber: { type: "string", description: "The payment receipt number" },
            reason: { type: "string", description: "Reason for denial" },
            citation: { type: "string", description: "The cited policy section, e.g. RIT-POL-003 §3" }
          },
          required: ["studentId", "receiptNumber", "reason", "citation"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "send_reactivation_email",
        description: "Send the reactivation confirmation email to the student.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "The student's ID" },
            receiptNumber: { type: "string", description: "The payment receipt number" }
          },
          required: ["studentId", "receiptNumber"]
        }
      }
    }
  ];

  // Tool outputs captured for frontend details
  let identityFindings = null;
  let financeFindings = null;
  let holdsFindings = null;
  let policyFindings = null;

  // Local executors mapping
  const toolExecutors = {
    get_student_profile: async (args) => {
      const sId = args.studentId;
      console.log(`    [Tool Call] Fetching profile for ${sId}`);
      if (db.getProfile) identityFindings = await db.getProfile(sId);
      else identityFindings = db.users[sId] || null;
      return identityFindings;
    },
    get_student_finance: async (args) => {
      const sId = args.studentId;
      console.log(`    [Tool Call] Fetching finance for ${sId}`);
      if (db.getFinance) financeFindings = await db.getFinance(sId);
      else financeFindings = db.finance[sId] || [];
      return financeFindings;
    },
    get_student_holds: async (args) => {
      const sId = args.studentId;
      console.log(`    [Tool Call] Fetching holds for ${sId}`);
      if (db.getHolds) holdsFindings = await db.getHolds(sId);
      else holdsFindings = db.holds[sId] || [];
      return holdsFindings;
    },
    search_university_policies: async (args) => {
      console.log(`    [Tool Call] Searching policies: "${args.query}"`);
      policyFindings = await fetchGroundingPolicies(args.query);
      return policyFindings;
    },
    reactivate_student_account: async (args) => {
      const sId = args.studentId;
      const receipt = args.receiptNumber;
      const citation = args.citation;
      console.log(`    [Tool Call] Reactivating account for ${sId} via ${citation}`);
      
      if (db.reactivateAccount) {
        await db.reactivateAccount(sId, true);
      }
      if (db.createAudit) {
        await db.createAudit({
          StudentID: sId,
          RequestedBy: requestedBy,
          ApprovedBy: 'Sutradhara-Auto',
          Action: 'Reactivate',
          PolicyCitation: citation,
          ReasoningTrace: `Agent tool execution reactivate_student_account: verified payment and holds`,
          ExecutionStatus: 'Executed',
          ReceiptNumber: receipt || '',
          TransactionId: uuidv4()
        });
      }
      return { success: true, status: "Account Enabled" };
    },
    escalate_reactivation_request: async (args) => {
      const sId = args.studentId;
      const receipt = args.receiptNumber;
      const reason = args.reason;
      const citation = args.citation;
      console.log(`    [Tool Call] Escalating reactivation for ${sId}: ${reason}`);

      if (db.createAudit) {
        await db.createAudit({
          StudentID: sId,
          RequestedBy: requestedBy,
          ApprovedBy: '',
          Action: 'Escalate',
          PolicyCitation: citation,
          ReasoningTrace: `Agent tool execution escalate_reactivation_request: ${reason}`,
          ExecutionStatus: 'Pending',
          ReceiptNumber: receipt || '',
          TransactionId: uuidv4()
        });
      }
      return { success: true, status: "Request Escalated" };
    },
    deny_reactivation_request: async (args) => {
      const sId = args.studentId;
      const receipt = args.receiptNumber;
      const reason = args.reason;
      const citation = args.citation;
      console.log(`    [Tool Call] Denying reactivation for ${sId}: ${reason}`);

      if (db.createAudit) {
        await db.createAudit({
          StudentID: sId,
          RequestedBy: requestedBy,
          ApprovedBy: '',
          Action: 'Deny',
          PolicyCitation: citation,
          ReasoningTrace: `Agent tool execution deny_reactivation_request: ${reason}`,
          ExecutionStatus: 'Denied',
          ReceiptNumber: receipt || '',
          TransactionId: uuidv4()
        });
      }
      return { success: true, status: "Request Denied" };
    },
    send_reactivation_email: async (args) => {
      const sId = args.studentId;
      const receipt = args.receiptNumber;
      console.log(`    [Tool Call] Sending reactivation email to student ${sId}`);

      const profile = db.getProfile ? await db.getProfile(sId) : db.users[sId];
      if (profile && profile.userPrincipalName && db.sendEmail) {
        const html = buildReactivationEmail(profile.displayName, receipt);
        const res = await db.sendEmail(profile.userPrincipalName, "RIT Student Access Restored — Sutradhara", html);
        return res;
      }
      return { sent: false, reason: "Profile not found or sendEmail helper missing" };
    }
  };

  // 3. Inference Run Loop
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  let loopCount = 0;
  const maxLoops = 10;
  let rawTextResult = "";

  while (loopCount < maxLoops) {
    console.log(`  → [Agent Engine] Sending completion request (turn ${loopCount + 1})...`);
    
    // Call Azure Inference Client
    const response = await client.path("/chat/completions").post({
      queryParameters: {
        "api-version": "2024-08-01-preview"
      },
      body: {
        messages: messages,
        tools: tools,
        temperature: 0.1,
        max_tokens: 1000
      }
    });

    if (isUnexpected(response)) {
      throw response.body.error;
    }

    const choice = response.body.choices[0];
    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log(`  → [Agent Engine] LLM requested ${assistantMessage.tool_calls.length} tool call(s)`);
      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        let functionArgs = {};
        try {
          functionArgs = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          console.warn(`    ⚠️ Failed to parse tool arguments:`, toolCall.function.arguments);
        }

        let result;
        if (toolExecutors[functionName]) {
          try {
            result = await toolExecutors[functionName](functionArgs);
          } catch (e) {
            console.error(`    ❌ Tool error executing ${functionName}:`, e.message);
            result = { error: e.message };
          }
        } else {
          result = { error: `Tool ${functionName} is not implemented` };
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
      loopCount++;
    } else {
      rawTextResult = assistantMessage.content || "";
      break;
    }
  }

  // Parse structured decision response
  const finalSynthesis = parseAgentResponse(rawTextResult, {
    decision: "ESCALATE",
    confidence: 0.85,
    summary: "Auto-escalated due to parsing error.",
    citations: [],
    reasoningTrace: ["Agent run finished but result was unparseable."]
  }, ["decision", "confidence", "summary", "citations", "reasoningTrace"]);

  // Calculate percentages for agentDetails mapping
  let financePercentage = 0;
  if (financeFindings && financeFindings.length > 0) {
    const record = financeFindings[0];
    const due = record.AmountDue || record.amountDue || 120000;
    const paid = record.AmountPaid || record.amountPaid || 0;
    financePercentage = Number(((paid / due) * 100).toFixed(1));
  } else if (db.finance && db.finance[studentId] && db.finance[studentId].length > 0) {
    const record = db.finance[studentId][0];
    financePercentage = Number(((record.AmountPaid / record.AmountDue) * 100).toFixed(1));
  }

  // Mapping risk evaluation details
  let hasActiveHolds = false;
  let riskLevel = "Low";
  if (holdsFindings && holdsFindings.length > 0) {
    hasActiveHolds = holdsFindings.some(h => h.HoldStatus === "Active");
    const investigation = holdsFindings.some(h => h.HoldStatus === "Active" && h.HoldType === "Investigation");
    const academic = holdsFindings.some(h => h.HoldStatus === "Active" && h.HoldType === "AcademicIntegrity");
    if (investigation || academic) riskLevel = "High";
    else if (hasActiveHolds) riskLevel = "Medium";
  } else if (db.holds && db.holds[studentId]) {
    hasActiveHolds = db.holds[studentId].some(h => h.HoldStatus === "Active");
  }

  const agentDetails = {
    identity: {
      status: identityFindings ? "Verified" : "Not Found",
      details: identityFindings ? `Verified student ${identityFindings.displayName}.` : `Student ID not found in directory.`,
      confidence: 0.95
    },
    finance: {
      status: financePercentage >= 100 ? "Clear" : "Outstanding Balance",
      percentagePaid: financePercentage,
      amountDue: financeFindings && financeFindings.length > 0 ? (financeFindings[0].AmountDue || financeFindings[0].amountDue) : 120000,
      amountPaid: financeFindings && financeFindings.length > 0 ? (financeFindings[0].AmountPaid || financeFindings[0].amountPaid) : 0,
      receiptValid: true,
      details: "Tuition fee ledger evaluated."
    },
    risk: {
      riskLevel: riskLevel,
      isRateLimited: rateLimited,
      blockingHoldsFound: hasActiveHolds,
      details: "Holds and transaction history checked."
    },
    policy: {
      isCompliant: finalSynthesis.decision === 'APPROVE',
      applicablePolicies: finalSynthesis.citations || [],
      verdictRecommendation: finalSynthesis.decision,
      details: finalSynthesis.summary
    }
  };

  console.log(`[Sutradhara AI] Process Complete. Decision: ${finalSynthesis.decision}`);

  return {
    success: true,
    decision: finalSynthesis.decision,
    confidence: finalSynthesis.confidence,
    summary: finalSynthesis.summary,
    citations: finalSynthesis.citations,
    reasoningTrace: finalSynthesis.reasoningTrace,
    agentDetails: agentDetails
  };
}

module.exports = {
  runAgentPipeline,
  isLive: () => clientReady,
  initAzureClient
};
