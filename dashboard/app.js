/* ==========================================================================
   RIT SUTRADHARA PORTAL ENGINE
   Supports both Simulation Mode and Live Backend Mode (Azure + Graph API)
   ========================================================================== */

// ─── Live Mode Configuration ────────────────────────────────────────────────
let LIVE_MODE = false;
const BACKEND_URL = localStorage.getItem('sutradhara_backend_url') || 'http://localhost:3000';

// API Helper for Live Mode
async function apiCall(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${BACKEND_URL}${path}`, opts);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || resp.statusText);
  }
  return resp.json();
}

// Toggle handler (will be wired to UI button)
function toggleLiveMode() {
  LIVE_MODE = !LIVE_MODE;
  const indicator = document.querySelector('.status-label');
  const dot = document.querySelector('.status-dot');
  if (LIVE_MODE) {
    indicator.textContent = `Live Mode — ${BACKEND_URL}`;
    dot.style.background = '#00e676';
    announceToSR('Switched to Live Backend mode');
  } else {
    indicator.textContent = 'Copilot & Foundry IQ Connected (Simulation)';
    dot.style.background = '';
    announceToSR('Switched to Simulation mode');
  }
}

// 1. Mock Database representing RIT Registries (used in Simulation Mode)
const studentDatabase = {
  "S12345": {
    profile: { id: "S12345", name: "Alice Vance", email: "alice.vance@ritedu.edu", dept: "Computer Science", active: false },
    finance: { due: 12000, paid: 12000, percentage: 100, receipt: "REC-2026-0891", date: "2026-06-07", status: "Verified" },
    holds: []
  },
  "S12346": {
    profile: { id: "S12346", name: "Bob Carter", email: "bob.carter@ritedu.edu", dept: "Electrical Engineering", active: false },
    finance: { due: 15000, paid: 12500, percentage: 83.3, receipt: "REC-2026-0892", date: "2026-06-06", status: "Verified" },
    holds: [
      { id: "H-991", type: "Financial", status: "Active", placed: "2026-05-20", expiry: null, placedBy: "Office of Bursar", reason: "Unpaid tuition balance > $500 threshold" }
    ]
  },
  "S12347": {
    profile: { id: "S12347", name: "Charlie Miller", email: "charlie.miller@ritedu.edu", dept: "Mechanical Engineering", active: false },
    finance: { due: 10000, paid: 10000, percentage: 100, receipt: "REC-2026-0893", date: "2026-06-08", status: "Verified" },
    holds: [
      { id: "H-992", type: "AcademicIntegrity", status: "Expired", placed: "2025-09-15", expiry: "2026-03-15", placedBy: "Dean of Students", reason: "Plagiarism sanction (Expired)" }
    ]
  },
  "S12348": {
    profile: { id: "S12348", name: "Diana Prince", email: "diana.prince@ritedu.edu", dept: "Business Administration", active: false },
    finance: { due: 14000, paid: 14000, percentage: 100, receipt: "REC-2026-0894", date: "2026-06-08", status: "Verified" },
    holds: [
      { id: "H-993", type: "Investigation", status: "Active", placed: "2026-05-28", expiry: null, placedBy: "Dean of Students", reason: "Code of Conduct - Active Disciplinary Investigation" }
    ]
  },
  "S12349": {
    profile: { id: "S12349", name: "Ethan Hunt", email: "ethan.hunt@ritedu.edu", dept: "Public Policy", active: false },
    finance: { due: 12000, paid: 4800, percentage: 40.0, receipt: "REC-2026-0895", date: "2026-06-08", status: "Pending" },
    holds: [
      { id: "H-994", type: "Financial", status: "Active", placed: "2026-05-20", expiry: null, placedBy: "Office of Bursar", reason: "Unpaid tuition balance > $500 threshold" }
    ]
  }
};

// Simulation state variables
let activeStudentId = "";
let currentTransactionId = "";
let requestCount = 0;
let requestTimestamps = [];
let isThrottled = false;

// DOM Selectors
const scenarioButtons = document.querySelectorAll(".scenario-item");
const chatHistory = document.getElementById("chat-history-list");
const activeCardContainer = document.getElementById("active-card-container");
const chatInput = document.getElementById("chat-input-field");
const chatSendBtn = document.getElementById("send-chat-btn");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const toggleThemeBtn = document.getElementById("toggle-theme-btn");
const srAnnouncer = document.getElementById("sr-announcer");

// Enterprise Records panels
const profilePanel = document.getElementById("rit-student-profile");
const financePanel = document.getElementById("rit-finance-ledger");
const holdsPanel = document.getElementById("rit-hold-registry");
const graphConsole = document.getElementById("graph-api-logs");
const auditRows = document.getElementById("sharepoint-audit-rows");

// Generate GUID helper
function generateGuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 2. High Contrast / Theme switcher
toggleThemeBtn.addEventListener("click", () => {
  document.body.classList.toggle("light-theme");
  const isLight = document.body.classList.contains("light-theme");
  announceToSR(isLight ? "Switched to high-contrast light theme" : "Switched to dark theme");
});

function announceToSR(message) {
  srAnnouncer.textContent = message;
}

// 3. Tab switching logic
tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    tabContents.forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// 4. Scenario Loader
scenarioButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    scenarioButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const scenarioNum = btn.dataset.scenario;
    executeScenario(scenarioNum);
  });
});

// Reset simulation layout
function clearReactivationState() {
  activeCardContainer.innerHTML = `<div class="card-placeholder">Adaptive approval cards will render here when human-in-the-loop validation is triggered.</div>`;
}

// Write to Graph API log panel
function logGraphRequest(method, url, body = null) {
  const time = new Date().toLocaleTimeString();
  let logText = `<span class="console-req">[${time}] HTTP ${method} ${url}</span>\n`;
  if (body) {
    logText += `Payload: ${JSON.stringify(body, null, 2)}\n`;
  }
  graphConsole.innerHTML += logText;
  graphConsole.scrollTop = graphConsole.scrollHeight;
}

function logGraphResponse(statusCode, data = null) {
  const time = new Date().toLocaleTimeString();
  let logText = `<span class="console-res">[${time}] RESPONSE ${statusCode}</span>\n`;
  if (data) {
    logText += `${JSON.stringify(data, null, 2)}\n`;
  }
  logText += `--------------------------------------------------\n`;
  graphConsole.innerHTML += logText;
  graphConsole.scrollTop = graphConsole.scrollHeight;
}

// Populate student profile/hold grids
function updateEnterpriseUI(studentId) {
  const student = studentDatabase[studentId];
  if (!student) return;

  // Profile
  profilePanel.innerHTML = `
    <div class="data-row"><strong>Name:</strong> <span>${student.profile.name}</span></div>
    <div class="data-row"><strong>Student ID:</strong> <span>${student.profile.id}</span></div>
    <div class="data-row"><strong>Email:</strong> <span>${student.profile.email}</span></div>
    <div class="data-row"><strong>Department:</strong> <span>${student.profile.dept}</span></div>
    <div class="data-row"><strong>Account Status:</strong> <span class="badge ${student.profile.active ? 'badge-success' : 'badge-danger'}">${student.profile.active ? 'ENABLED' : 'DISABLED'}</span></div>
  `;

  // Finance
  financePanel.innerHTML = `
    <div class="data-row"><strong>Total Due:</strong> <span>$${student.finance.due.toLocaleString()}</span></div>
    <div class="data-row"><strong>Amount Paid:</strong> <span>$${student.finance.paid.toLocaleString()}</span></div>
    <div class="data-row"><strong>Clearance %:</strong> <span>${student.finance.percentage.toFixed(1)}%</span></div>
    <div class="data-row"><strong>Receipt Ref:</strong> <span>${student.finance.receipt}</span></div>
    <div class="data-row"><strong>Ledger Status:</strong> <span class="badge ${student.finance.status === 'Verified' ? 'badge-success' : 'badge-warning'}">${student.finance.status}</span></div>
  `;

  // Holds
  if (student.holds.length === 0) {
    holdsPanel.innerHTML = `<div class="placeholder-text">No active or expired holds. Student is in good standing.</div>`;
  } else {
    holdsPanel.innerHTML = student.holds.map(hold => `
      <div style="border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px; margin-bottom: 8px;">
        <div class="data-row"><strong>Hold Type:</strong> <span class="badge ${hold.status === 'Active' ? 'badge-danger' : 'badge-info'}">${hold.type} (${hold.status})</span></div>
        <div class="data-row"><strong>Placed Date:</strong> <span>${hold.placed}</span></div>
        <div class="data-row"><strong>Expiry Date:</strong> <span>${hold.expiry || 'Indefinite'}</span></div>
        <div class="data-row"><strong>Placed By:</strong> <span>${hold.placedBy}</span></div>
        <div class="data-row" style="flex-direction:column; align-items:flex-start;"><strong>Reason:</strong> <span style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">${hold.reason}</span></div>
      </div>
    `).join('');
  }
}

// Append rows to SharePoint Audit log
function addAuditRow(studentId, action, citation, authorizer, trace) {
  const tableBody = document.getElementById("sharepoint-audit-rows");
  const emptyRow = tableBody.querySelector(".empty-row");
  if (emptyRow) emptyRow.remove();

  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><code>${timestamp}</code></td>
    <td><code>${studentId}</code></td>
    <td><span class="badge ${action === 'Reactivate' ? 'badge-success' : action === 'Deny' ? 'badge-danger' : 'badge-warning'}">${action}</span></td>
    <td><code>${citation}</code></td>
    <td><span style="font-size:0.7rem;">${authorizer}</span></td>
  `;
  tableBody.insertBefore(row, tableBody.firstChild);
  
  // Also log the reasoning details in graph or accessibility announcer
  announceToSR(`SharePoint audit logged: student ${studentId} reactivated under policy ${citation}`);
}

// Append message to Copilot Chat
function addChatMessage(sender, content, role) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `chat-message ${role}`;
  msgDiv.innerHTML = `
    <div class="message-sender">${sender}</div>
    <div class="message-content">${content}</div>
    <div class="message-timestamp">Just now</div>
  `;
  chatHistory.appendChild(msgDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  announceToSR(`${sender} says: ${content}`);
}

// 5. Main Scenario Driver (Simulation or Live)
function executeScenario(scenarioNum) {
  clearReactivationState();
  currentTransactionId = generateGuid();

  // Handle Scenario 6 Rate Limiting Anomaly independently
  if (scenarioNum === "6") {
    triggerRateLimitingAnomaly();
    return;
  }

  const scenarioMappings = {
    "1": "S12345", "2": "S12346", "3": "S12347",
    "4": "S12348", "5": "S12349"
  };

  const studentId = scenarioMappings[scenarioNum];
  activeStudentId = studentId;
  trackRequestRate();

  if (LIVE_MODE) {
    executeLiveScenario(studentId);
  } else {
    executeSimulatedScenario(studentId);
  }
}

// ─── LIVE MODE: calls real Express backend ───────────────────────────────────
async function executeLiveScenario(studentId) {
  addChatMessage("Front Desk Operator", `Process account reactivation request for Student ID: ${studentId}`, "user");
  addChatMessage("Sutradhara Agent", `Initiating <b>LIVE</b> verification sequence. Transaction: <code>${currentTransactionId}</code>`, "agent");

  try {
    // Step 1: Fetch student from backend (which calls real Graph + SharePoint)
    logGraphRequest("GET", `/api/student/${studentId}`);
    const data = await apiCall("GET", `/api/student/${studentId}`);
    logGraphResponse(200, data);

    // Populate the UI with live data
    const liveStudent = {
      profile: {
        id: studentId,
        name: data.profile.displayName,
        email: data.profile.userPrincipalName,
        dept: data.profile.department || 'N/A',
        active: data.profile.accountEnabled
      },
      finance: data.finance ? {
        due: data.finance.AmountDue || 0,
        paid: data.finance.AmountPaid || 0,
        percentage: data.finance.AmountDue > 0 ? ((data.finance.AmountPaid / data.finance.AmountDue) * 100) : 0,
        receipt: data.finance.ReceiptNumber || 'N/A',
        status: data.finance.VerificationStatus || 'Unknown'
      } : { due: 0, paid: 0, percentage: 0, receipt: 'N/A', status: 'No Record' },
      holds: (data.holds || []).map(h => ({
        id: h.id || 'N/A',
        type: h.HoldType,
        status: h.HoldStatus,
        placed: h.PlacedDate ? h.PlacedDate.substring(0, 10) : 'N/A',
        expiry: h.ExpiryDate ? h.ExpiryDate.substring(0, 10) : null,
        placedBy: h.PlacedBy || 'System',
        reason: h.Reason || ''
      }))
    };

    // Update enterprise system panels with real data
    studentDatabase[studentId] = liveStudent; // cache for UI reuse
    updateEnterpriseUI(studentId);

    // Step 2: Call the reactivation reasoning endpoint
    addChatMessage("Sutradhara Agent", `Data retrieved. Running policy reasoning engine against live policies...`, "agent");
    logGraphRequest("POST", `/api/reactivate`);

    const result = await apiCall("POST", `/api/reactivate`, {
      studentId,
      receiptNumber: liveStudent.finance.receipt,
      requestedBy: "frontdesk.operator@ritedu.edu"
    });
    logGraphResponse(200, result);

    // Display the reasoning result
    addChatMessage("Sutradhara Agent",
      `<b>Live Reasoning Complete.</b><br><b>Decision:</b> ${result.decision.toUpperCase()}<br><b>Policy:</b> ${result.policyCitation}<br><em>${result.reasoningTrace}</em>`,
      "agent"
    );

    // Re-fetch to update account status after reactivation
    if (result.decision === 'approve') {
      liveStudent.profile.active = true;
      updateEnterpriseUI(studentId);
      addChatMessage("Sutradhara Agent", `✅ Account reactivated via Microsoft Graph API. Student notified via Outlook.`, "agent");
    }

    // Add audit row
    addAuditRow(studentId, result.decision === 'approve' ? 'Reactivate' : result.decision === 'deny' ? 'Deny' : 'Escalate',
      result.policyCitation, result.approvedBy || 'Sutradhara (Autonomous)', result.reasoningTrace);

  } catch (err) {
    addChatMessage("Sutradhara Agent", `❌ <b>Live Backend Error:</b> ${err.message}<br>Ensure the backend is running at <code>${BACKEND_URL}</code>`, "agent");
    logGraphResponse(500, { error: err.message });
  }
}

// ─── SIMULATION MODE: uses mock data ─────────────────────────────────────────
function executeSimulatedScenario(studentId) {
  const student = studentDatabase[studentId];
  updateEnterpriseUI(studentId);

  addChatMessage("Front Desk Operator", `Process account reactivation request for Student ID: ${studentId}, receipt number ${student.finance.receipt}`, "user");

  setTimeout(() => {
    addChatMessage("Sutradhara Agent", `Initiating verification sequence. Transaction ID: <code>${currentTransactionId}</code>. Checking ledgers...`, "agent");
    logGraphRequest("GET", `/users/${studentId}`);
    
    setTimeout(() => {
      logGraphResponse(200, {
        id: student.profile.id,
        displayName: student.profile.name,
        accountEnabled: student.profile.active,
        department: student.profile.dept
      });

      logGraphRequest("GET", `/sites/BursarOffice/lists/FinanceLedger/items?$filter=fields/StudentID eq '${studentId}'`);
      setTimeout(() => {
        logGraphResponse(200, { value: [{ fields: student.finance }] });
        
        logGraphRequest("GET", `/sites/BursarOffice/lists/HoldRegistry/items?$filter=fields/StudentID eq '${studentId}'`);
        
        setTimeout(() => {
          logGraphResponse(200, { value: student.holds.map(h => ({ fields: h })) });
          runAgentReasoning(studentId, student);
        }, 600);
      }, 500);
    }, 600);
  }, 1000);
}

// Multi-step reasoning implementation
function runAgentReasoning(studentId, student) {
  // Query policy grounding details from internal Foundry IQ mock
  const pct = student.finance.percentage;
  const holds = student.holds;

  let policyCitation = "";
  let reasoningTrace = "";
  let recommendation = ""; // "approve" | "deny" | "escalate" | "temporary"

  // Rule 1: Active investigation or disciplinary holds take absolute priority (RIT-POL-003 §3)
  const activeInvestigation = holds.find(h => h.type === "Investigation" && h.status === "Active");
  const activeIntegrity = holds.find(h => h.type === "AcademicIntegrity" && h.status === "Active");
  
  if (activeInvestigation) {
    policyCitation = "RIT-POL-003 §3 (Active Disciplinary Investigations Block)";
    reasoningTrace = `Student has an active Disciplinary Investigation Hold placed by ${activeInvestigation.placedBy} on ${activeInvestigation.placed}. Per the priority matrix, active investigations override payment clearance. Automatic reactivation is BLOCKED.`;
    recommendation = "deny";
  } 
  else if (activeIntegrity) {
    policyCitation = "RIT-POL-003 §3 (Active Academic Sanctions Block)";
    reasoningTrace = `Student has an active Academic Integrity Hold. Active academic sanctions take precedence over finance clearance. Reactivation request must be denied.`;
    recommendation = "deny";
  }
  // Rule 2: Expired academic integrity holds (RIT-POL-003 §4)
  else {
    const expiredHolds = holds.filter(h => h.status === "Expired" || (h.expiry && new Date(h.expiry) < new Date("2026-06-08")));
    
    // Check payment threshold (RIT-POL-001)
    if (pct === 100) {
      if (expiredHolds.length > 0) {
        policyCitation = "RIT-POL-003 §4 (Expired Hold Clearance)";
        reasoningTrace = `Tuition is paid in full (100%). Student has a history of ${expiredHolds[0].type} hold, but expiration was on ${expiredHolds[0].expiry} (Expired). Proceeding with standard reactivation. Registry flag marked for database cleanup.`;
        recommendation = "approve";
      } else {
        policyCitation = "RIT-POL-001 §6.3 (Standard Full Clearance)";
        reasoningTrace = "Tuition balance paid in full (100%). No holds in registry. Account meets all criteria for full reactivation.";
        recommendation = "approve";
      }
    }
    // Rule 3: Partial payment threshold (RIT-POL-001 §7)
    else if (pct >= 80) {
      policyCitation = "RIT-POL-001 §7.2 (Restructured Course Access)";
      reasoningTrace = `Tuition payment is at ${pct.toFixed(1)}% (which is ≥ 80% threshold). Account is eligible for Restructured Course Access. Core LMS courses will be enabled; physical library and elective courses remain restricted.`;
      recommendation = "approve-partial";
    }
    // Rule 4: Hardship temporary access (RIT-POL-005 §2)
    else {
      // Check if student has applied for hardship (simulated by payment method or ledger notes)
      if (studentId === "S12349") { // Ethan Hunt scenario
        policyCitation = "RIT-POL-005 §2 (Emergency Hardship Temporary Access)";
        reasoningTrace = `Tuition paid is 40.0% (below 80% threshold). However, a Financial Hardship Application has been filed. Under policy RIT-POL-005, the student is eligible for a temporary 72-hour emergency access extension.`;
        recommendation = "temporary";
      } else {
        policyCitation = "RIT-POL-001 §4.1 (Tuition Payment Default)";
        reasoningTrace = `Tuition balance paid is ${pct}%, which is below the 80% threshold. No hardship application is on file. Reactivation request is rejected.`;
        recommendation = "deny-default";
      }
    }
  }

  // Render reasoning details in chat
  addChatMessage("Sutradhara Agent", `Reasoning Complete. Grounding in policies via Foundry IQ...<br><b>Result:</b> Recommended Action is <b>${recommendation.toUpperCase()}</b>.<br><b>Rule:</b> ${policyCitation}`, "agent");

  // Trigger Adaptive Card rendering
  setTimeout(() => {
    renderAdaptiveCard(studentId, student, recommendation, policyCitation, reasoningTrace);
  }, 500);
}

// Adaptive Card renderer emulating Teams Framework
function renderAdaptiveCard(studentId, student, recommendation, citation, trace) {
  let headerColorStyle = "hsl(220, 15%, 25%)";
  let badgeClass = "badge-info";
  let alertMessage = "";
  
  if (recommendation.includes("approve")) {
    headerColorStyle = "var(--color-success-bg)";
    badgeClass = "badge-success";
  } else if (recommendation.includes("deny")) {
    headerColorStyle = "var(--color-danger-bg)";
    badgeClass = "badge-danger";
  } else if (recommendation === "temporary") {
    headerColorStyle = "var(--color-warning-bg)";
    badgeClass = "badge-warning";
    alertMessage = `<div class="ac-alert-container">⚠️ **ALERT**: Emergency access will automatically expire in 72 hours.</div>`;
  }

  const activeHoldsText = student.holds.length > 0 ? student.holds.map(h => h.type).join(', ') : "None";
  const holdExpirationsText = student.holds.length > 0 ? student.holds.map(h => h.expiry || 'Indefinite').join(', ') : "N/A";

  const cardHtml = `
    <div class="ac-card">
      <div class="ac-header" style="background:${headerColorStyle}">
        <span class="ac-header-title">🛡️ RIT SUTRADHARA APPROVAL REQUEST (HITL)</span>
        <span class="badge ${badgeClass}">${recommendation.toUpperCase()}</span>
      </div>
      <div class="ac-body">
        <div class="ac-fact-group">
          <span class="ac-fact-title">Student Name:</span>
          <span>${student.profile.name} (${studentId})</span>
          <span class="ac-fact-title">Department:</span>
          <span>${student.profile.dept}</span>
          <span class="ac-fact-title">Receipt Number:</span>
          <span>${student.finance.receipt}</span>
        </div>
        
        <div class="ac-section-title">💵 Tuition Coverage</div>
        <div class="ac-fact-group">
          <span class="ac-fact-title">Total Due:</span>
          <span>$${student.finance.due.toLocaleString()}</span>
          <span class="ac-fact-title">Amount Paid:</span>
          <span>$${student.finance.paid.toLocaleString()} (${student.finance.percentage.toFixed(1)}%)</span>
        </div>

        <div class="ac-section-title">⚠️ Holds Registry</div>
        <div class="ac-fact-group">
          <span class="ac-fact-title">Active Holds:</span>
          <span>${activeHoldsText}</span>
          <span class="ac-fact-title">Expirations:</span>
          <span>${holdExpirationsText}</span>
        </div>

        <div class="ac-section-title">🧠 Agent Decision & Citations</div>
        <div class="ac-reasoning">
          <p><strong>Citation:</strong> ${citation}</p>
          <p style="margin-top: 4px; color:var(--text-secondary); font-size:0.7rem;">${trace}</p>
        </div>
        ${alertMessage}
      </div>
      <div class="ac-actions">
        ${recommendation.includes("deny") ? `
          <button class="ac-btn ac-btn-danger" onclick="processITAction('deny', '${studentId}', '${citation}', '${trace}')">Dismiss Request</button>
        ` : `
          <button class="ac-btn ac-btn-primary" onclick="processITAction('approve', '${studentId}', '${citation}', '${trace}', '${recommendation}')">Approve Reactivation</button>
          <button class="ac-btn" onclick="processITAction('deny', '${studentId}', '${citation}', '${trace}')">Deny Request</button>
        `}
        <button class="ac-btn" onclick="processITAction('escalate', '${studentId}', '${citation}', '${trace}')">Escalate to Dean</button>
      </div>
    </div>
  `;

  activeCardContainer.innerHTML = cardHtml;
  announceToSR("IT Approval card loaded. Human verification required.");
}

// Handle IT Approver click actions
window.processITAction = function(action, studentId, citation, trace, recommendationType = "approve") {
  addChatMessage("IT Lead", `${action.toUpperCase()} verification request for student ${studentId}`, "user");
  clearReactivationState();

  if (action === "approve") {
    addChatMessage("Sutradhara Agent", `Approval received. Executing Microsoft Graph provisioning...`, "agent");
    
    // Simulate Graph Update call
    logGraphRequest("PATCH", `/users/${studentId}`, { accountEnabled: true });
    
    setTimeout(() => {
      logGraphResponse(204);
      
      // Update local mock database state
      studentDatabase[studentId].profile.active = true;
      updateEnterpriseUI(studentId);

      // RESTORE SCOPE TEXT (for partial payment support)
      let scopeText = "🟢 M365 Account restored. 🟢 Canvas LMS restored. 🟢 Library physical services restored.";
      let auditAction = "Reactivate";
      let libraryStatus = "🟢 Fully Restored";
      let noticeText = "Your access has been fully restored. Please allow up to 15 minutes for all active academic systems to synchronize your credentials.";

      if (recommendationType === "approve-partial") {
        scopeText = "🟢 M365 Account restored. 🟡 Canvas LMS core course access restored. 🔴 Library physical access remains restricted.";
        libraryStatus = "🔴 Restricted (Core Courses Only)";
        noticeText = "Your account is restored on a limited schedule. Elective classes and physical libraries are restricted under RIT-POL-001 §7.2.";
      } else if (recommendationType === "temporary") {
        scopeText = "🟢 M365 Account restored. 🟡 Canvas LMS restored. (Temporary 72 Hours Extension).";
        auditAction = "TemporaryAccess";
        libraryStatus = "🟡 Temporary 72 Hours Access";
        noticeText = "This is a temporary 72-hour hardship extension. Access will automatically suspend on 2026-06-11 at 11:59 PM PT unless a payment plan is established.";
      }

      addChatMessage("Sutradhara Agent", `Account reactivated successfully. Access Level: ${scopeText}`, "agent");
      
      // Write to SharePoint Audit list
      logGraphRequest("POST", `/sites/BursarOffice/lists/AuditLog/items`, {
        fields: {
          StudentID: studentId,
          Action: auditAction,
          PolicyCitation: citation,
          ReasoningTrace: trace,
          ApprovedBy: "it.lead@ritedu.edu"
        }
      });
      setTimeout(() => {
        logGraphResponse(201, { id: "ITEM-" + Math.floor(Math.random()*1000) });
        addAuditRow(studentId, auditAction, citation, "it.lead@ritedu.edu", trace);
      }, 300);

    }, 800);
  } 
  else if (action === "deny") {
    addChatMessage("Sutradhara Agent", `Reactivation Denied. Writing rejection registry entries...`, "agent");
    setTimeout(() => {
      addChatMessage("Sutradhara Agent", `Reactivation request rejected in compliance with policy. Student notification dispatched.`, "agent");
      addAuditRow(studentId, "Deny", citation, "it.lead@ritedu.edu", trace);
    }, 400);
  }
  else if (action === "escalate") {
    addChatMessage("Sutradhara Agent", `Request escalated. Forwarding payload to Dean of Students office.`, "agent");
    setTimeout(() => {
      addChatMessage("Sutradhara Agent", `Escalation successful. Case ticket #TKT-${Math.floor(Math.random()*10000)} generated.`, "agent");
      addAuditRow(studentId, "Escalate", citation, "it.lead@ritedu.edu", trace);
    }, 500);
  }
};

// 6. Security Rate-Limiting Anomaly (Scenario 6)
function triggerRateLimitingAnomaly() {
  addChatMessage("Front Desk Operator", `Bulk request run: Reactivate student accounts for S12345, S12346, S12347, S12348.`, "user");
  
  // Force 4 requests in immediate succession
  isThrottled = true;
  
  setTimeout(() => {
    addChatMessage("Sutradhara Agent", `Processing batch...`, "agent");
    
    setTimeout(() => {
      // Trigger RIT-POL-004 §4 Anomaly Detection
      addChatMessage("Sutradhara Agent", `🔴 <b>RATE-LIMIT BREACH</b>: Multiple account lifecycle changes detected in under 10 minutes from session. Triggering security protocol [RIT-POL-004 §4].`, "agent");
      
      // Render Anomaly Adaptive Card
      const anomalyCard = `
        <div class="ac-card ac-alert-container" style="border-color: var(--color-danger); background: var(--color-danger-bg);">
          <div class="ac-header" style="background: rgba(244, 67, 54, 0.2)">
            <span class="ac-header-title" style="color:var(--color-danger)">🚨 RIT SECURITY OPERATION CENTER WARNING</span>
            <span class="badge badge-danger">SECURITY ALERT</span>
          </div>
          <div class="ac-body">
            <p><strong>Trigger Condition:</strong> Operator request frequency threshold exceeded (>3 requests / 10 min).</p>
            <div class="ac-fact-group" style="margin-top: 10px;">
              <span class="ac-fact-title">Operator Email:</span>
              <span>frontdesk.operator@ritedu.edu</span>
              <span class="ac-fact-title">Action Status:</span>
              <span style="color:var(--color-danger); font-weight:bold;">Operator Session Locked</span>
              <span class="ac-fact-title">Policy Breach:</span>
              <span>RIT-POL-004 §4 (Security Rate-Limiting)</span>
            </div>
          </div>
          <div class="ac-actions">
            <button class="ac-btn ac-btn-primary" onclick="resetSecurityThrottle()">🔓 Unlock Operator Session</button>
            <button class="ac-btn" onclick="confirmSecurityLock()">🔒 Escalate Incident & Email SOC</button>
          </div>
        </div>
      `;
      activeCardContainer.innerHTML = anomalyCard;
      announceToSR("Security rate limit exceeded. Operator session suspended.");
    }, 800);
  }, 400);
}

window.resetSecurityThrottle = function() {
  isThrottled = false;
  requestCount = 0;
  requestTimestamps = [];
  clearReactivationState();
  addChatMessage("Sutradhara Agent", "Security throttle cleared. Front desk operator session restored to active status.", "agent");
  announceToSR("Operator session unlocked");
};

window.confirmSecurityLock = function() {
  clearReactivationState();
  addChatMessage("Sutradhara Agent", "Incident ticket filed with the Security Operations Center. All administrative access from this workstation has been suspended.", "agent");
  announceToSR("Operator account suspended indefinitely");
};

// Request tracker to prevent automated spam
function trackRequestRate() {
  const now = Date.now();
  requestTimestamps.push(now);
  // Filter for requests in last 10 minutes
  requestTimestamps = requestTimestamps.filter(t => now - t < 10 * 60 * 1000);
  requestCount = requestTimestamps.length;
}
