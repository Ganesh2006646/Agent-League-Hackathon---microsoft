/* ==========================================================================
   RIT SUTRADHARA PORTAL ENGINE
   Pure Conversational Interface with Multi-Agent Reasoning Animation
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

// Toggle handler
function toggleLiveMode() {
  LIVE_MODE = !LIVE_MODE;
  const indicator = document.querySelector('.status-label');
  const dot = document.querySelector('.status-dot');
  const btn = document.getElementById('toggle-live-btn');
  
  if (LIVE_MODE) {
    indicator.textContent = `Live Mode — ${BACKEND_URL}`;
    dot.style.background = '#00e676';
    btn.textContent = "🔌 Sim Mode";
    btn.style.borderColor = '#00e676';
    announceToSR('Switched to Live Backend mode');
    fetchBackendStatus();
    syncAuditLogs();
  } else {
    indicator.textContent = 'Copilot & Foundry IQ Connected (Simulation)';
    dot.style.background = '';
    btn.textContent = "⚡ Live Mode";
    btn.style.borderColor = '';
    announceToSR('Switched to Simulation mode');
  }
}

async function fetchBackendStatus() {
  try {
    const data = await apiCall("GET", "/api/agents/status");
    const indicator = document.querySelector('.status-label');
    indicator.textContent = `Live Mode (${data.mode}) — ${BACKEND_URL}`;
  } catch (err) {
    console.error("Failed to fetch backend status:", err);
  }
}

async function syncAuditLogs() {
  if (!LIVE_MODE) return;
  try {
    const logs = await apiCall("GET", "/api/audit");
    const tableBody = document.getElementById("sharepoint-audit-rows");
    tableBody.innerHTML = "";
    if (logs.length === 0) {
      tableBody.innerHTML = `<tr class="empty-row"><td colspan="5">No audit records generated.</td></tr>`;
      return;
    }
    logs.forEach(log => {
      const time = log.Timestamp ? log.Timestamp.replace('T', ' ').substring(0, 19) : 'N/A';
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><code>${time}</code></td>
        <td><code>${log.StudentID}</code></td>
        <td><span class="badge ${log.Action === 'Reactivate' || log.Action === 'TemporaryAccess' ? 'badge-success' : log.Action === 'Deny' ? 'badge-danger' : 'badge-warning'}">${log.Action}</span></td>
        <td><code>${log.PolicyCitation || 'POL-001'}</code></td>
        <td><span style="font-size:0.7rem;">${log.ApprovedBy || 'Sutradhara'}</span></td>
      `;
      tableBody.appendChild(row);
    });
  } catch (err) {
    console.error("Failed to sync audit logs:", err);
  }
}

// 1. Mock Database representing RIT Registries (used in Simulation Mode)
// 1. Mock Database representing RIT Registries (used in Simulation Mode)
const studentDatabase = {
  "S10001": {
    profile: { id: "S10001", name: "Aarav Sharma", email: "aarav.sharma@ritedu.edu", dept: "Computer Science", active: false },
    finance: { due: 125000, paid: 125000, percentage: 100, receipt: "REC-2026-1001", date: "2026-06-01", status: "Verified" },
    holds: []
  },
  "S10002": {
    profile: { id: "S10002", name: "Priya Nair", email: "priya.nair@ritedu.edu", dept: "Electronics & Communication", active: false },
    finance: { due: 150000, paid: 125000, percentage: 83.3, receipt: "REC-2026-1002", date: "2026-05-28", status: "Verified" },
    holds: [
      { id: "H-991", type: "Financial", status: "Active", placed: "2026-05-20", expiry: null, placedBy: "Office of Accounts", reason: "Unpaid tuition balance > ₹50,000 threshold" }
    ]
  },
  "S10003": {
    profile: { id: "S10003", name: "Rohan Deshmukh", email: "rohan.deshmukh@ritedu.edu", dept: "Mechanical Engineering", active: false },
    finance: { due: 100000, paid: 100000, percentage: 100, receipt: "REC-2026-1003", date: "2026-06-02", status: "Verified" },
    holds: [
      { id: "H-992", type: "AcademicIntegrity", status: "Expired", placed: "2025-09-15", expiry: "2026-03-15", placedBy: "Dean of Academics", reason: "Plagiarism sanction (probation ended March 2026)" }
    ]
  },
  "S10004": {
    profile: { id: "S10004", name: "Ananya Iyer", email: "ananya.iyer@ritedu.edu", dept: "Business Administration", active: false },
    finance: { due: 140000, paid: 140000, percentage: 100, receipt: "REC-2026-1004", date: "2026-05-25", status: "Verified" },
    holds: [
      { id: "H-993", type: "Investigation", status: "Active", placed: "2026-05-28", expiry: null, placedBy: "Dean of Students", reason: "Code of Conduct — Active Disciplinary Investigation" }
    ]
  },
  "S10005": {
    profile: { id: "S10005", name: "Karthik Reddy", email: "karthik.reddy@ritedu.edu", dept: "Civil Engineering", active: false },
    finance: { due: 120000, paid: 48000, percentage: 40.0, receipt: "REC-2026-1005", date: "2026-05-30", status: "Pending" },
    holds: [
      { id: "H-994", type: "Financial", status: "Active", placed: "2026-05-20", expiry: null, placedBy: "Office of Accounts", reason: "Unpaid tuition balance > ₹50,000 threshold" }
    ]
  },
  "S10006": {
    profile: { id: "S10006", name: "Meera Joshi", email: "meera.joshi@ritedu.edu", dept: "Data Science", active: false },
    finance: { due: 130000, paid: 130000, percentage: 100, receipt: "REC-2026-1006", date: "2026-06-03", status: "Verified" },
    holds: []
  },
  "S10007": {
    profile: { id: "S10007", name: "Arjun Patel", email: "arjun.patel@ritedu.edu", dept: "Information Technology", active: false },
    finance: { due: 110000, paid: 88000, percentage: 80.0, receipt: "REC-2026-1007", date: "2026-05-27", status: "Verified" },
    holds: [
      { id: "H-995", type: "Financial", status: "Active", placed: "2026-05-22", expiry: null, placedBy: "Office of Accounts", reason: "Outstanding balance of ₹22,000" }
    ]
  },
  "S10008": {
    profile: { id: "S10008", name: "Diya Krishnan", email: "diya.krishnan@ritedu.edu", dept: "Biotechnology", active: false },
    finance: { due: 135000, paid: 0, percentage: 0.0, receipt: "", date: "", status: "Unpaid" },
    holds: [
      { id: "H-996", type: "Financial", status: "Active", placed: "2026-05-15", expiry: null, placedBy: "Office of Accounts", reason: "Full semester fees unpaid" }
    ]
  }
};

// State variables
let activeStudentId = "";
let currentTransactionId = "";
let requestCount = 0;
let requestTimestamps = [];

// DOM Selectors
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

// Theme Switcher
toggleThemeBtn.addEventListener("click", () => {
  document.body.classList.toggle("light-theme");
  const isLight = document.body.classList.contains("light-theme");
  announceToSR(isLight ? "Switched to high-contrast light theme" : "Switched to dark theme");
});

function announceToSR(message) {
  srAnnouncer.textContent = message;
}

// Tab Switching
tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    tabContents.forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

function clearReactivationState() {
  activeCardContainer.innerHTML = `<div class="card-placeholder">Adaptive approval cards will render here when human-in-the-loop validation is triggered.</div>`;
}

// Graph API Console loggers
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
    <div class="data-row"><strong>Total Due:</strong> <span>₹${student.finance.due.toLocaleString()}</span></div>
    <div class="data-row"><strong>Amount Paid:</strong> <span>₹${student.finance.paid.toLocaleString()}</span></div>
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
    <td><span class="badge ${action === 'Reactivate' || action === 'TemporaryAccess' ? 'badge-success' : action === 'Deny' ? 'badge-danger' : 'badge-warning'}">${action}</span></td>
    <td><code>${citation}</code></td>
    <td><span style="font-size:0.7rem;">${authorizer}</span></td>
  `;
  tableBody.insertBefore(row, tableBody.firstChild);
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

// ─── AGENT PIPELINE ANIMATION ──────────────────────────────────────────────
function animateAgentPipeline(decision, agentDetails, callback) {
  const nodes = [
    { id: 'node-identity', conn: 'conn-1', key: 'identity' },
    { id: 'node-finance', conn: 'conn-2', key: 'finance' },
    { id: 'node-risk', conn: 'conn-3', key: 'risk' },
    { id: 'node-policy', conn: 'conn-4', key: 'policy' },
    { id: 'node-orchestrator', conn: null, key: 'orchestrator' }
  ];
  
  nodes.forEach(node => {
    const el = document.getElementById(node.id);
    if (el) el.className = 'pipeline-node';
    if (node.conn) {
      const connEl = document.getElementById(node.conn);
      if (connEl) connEl.className = 'pipeline-connector';
    }
  });
  
  let step = 0;
  
  function nextStep() {
    if (step >= nodes.length) {
      const orchNode = document.getElementById('node-orchestrator');
      if (orchNode) {
        orchNode.classList.remove('active');
        if (decision === 'APPROVE') orchNode.classList.add('completed');
        else if (decision === 'DENY') orchNode.classList.add('denied');
        else orchNode.classList.add('escalated');
      }
      if (callback) callback();
      return;
    }
    
    const node = nodes[step];
    const nodeEl = document.getElementById(node.id);
    if (nodeEl) {
      if (step > 0) {
        const prevNode = nodes[step - 1];
        const prevNodeEl = document.getElementById(prevNode.id);
        if (prevNodeEl) {
          prevNodeEl.classList.remove('active');
          const details = agentDetails ? agentDetails[prevNode.key] : null;
          
          if (details && (details.status === 'Not Found' || details.status === 'No Record' || details.blockingHoldsFound || details.isRateLimited || details.riskLevel === 'High')) {
            prevNodeEl.classList.add('denied');
          } else {
            prevNodeEl.classList.add('completed');
          }
        }
        
        if (prevNode.conn) {
          const prevConnEl = document.getElementById(prevNode.conn);
          if (prevConnEl) {
            prevConnEl.classList.remove('active');
            prevConnEl.classList.add('completed');
          }
        }
      }
      
      nodeEl.classList.add('active');
      if (node.conn) {
        const connEl = document.getElementById(node.conn);
        if (connEl) connEl.classList.add('active');
      }
    }
    
    step++;
    setTimeout(nextStep, 600);
  }
  
  nextStep();
}

// ─── AGENT REASONING TAB UPDATE ────────────────────────────────────────────
function updateReasoningUI(decision, confidence, summary, citations, reasoningTrace, agentDetails) {
  const container = document.getElementById('agent-reasoning-trace-box');
  if (!container) return;
  
  // Auto-switch to reasoning tab
  tabButtons.forEach(b => b.classList.remove("active"));
  tabContents.forEach(c => c.classList.remove("active"));
  
  const reasonTabBtn = Array.from(tabButtons).find(b => b.dataset.tab === 'reasoning');
  if (reasonTabBtn) reasonTabBtn.classList.add('active');
  const reasonTabContent = document.getElementById('tab-reasoning');
  if (reasonTabContent) reasonTabContent.classList.add('active');
  
  let html = `
    <div style="margin-bottom: 16px;">
      <h3 style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase; margin-bottom: 8px;">Final Synthesis Verdict</h3>
      <div class="profile-card" style="border-left: 4px solid ${decision === 'APPROVE' ? 'var(--color-success)' : decision === 'DENY' ? 'var(--color-danger)' : 'var(--color-warning)'}">
        <div class="data-row"><strong>Verdict:</strong> <span class="badge ${decision === 'APPROVE' ? 'badge-success' : decision === 'DENY' ? 'badge-danger' : 'badge-warning'}">${decision}</span></div>
        <p style="margin-top: 8px; font-size: 0.8rem; line-height: 1.4;">${summary}</p>
        
        <div class="confidence-meter">
          <span>Confidence:</span>
          <div class="confidence-bar">
            <div class="confidence-bar-fill" style="width: ${(confidence || 0.9) * 100}%; background: ${decision === 'APPROVE' ? 'var(--color-success)' : decision === 'DENY' ? 'var(--color-danger)' : 'var(--color-warning)'}"></div>
          </div>
          <span style="font-weight:bold;">${((confidence || 0.9) * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  `;
  
  if (agentDetails) {
    html += `<h3 style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase; margin-bottom: 8px; margin-top: 16px;">Specialist Agent Details</h3>`;
    
    // Identity Verifier Agent
    const idDetails = agentDetails.identity || {};
    html += `
      <div class="reasoning-card" style="margin-bottom: 10px;">
        <h4>
          <span>🪪 Identity Verifier Agent</span>
          <span class="agent-badge" style="background:var(--color-success-bg); color:var(--color-success)">${idDetails.status || 'Verified'}</span>
        </h4>
        <p>${idDetails.details || 'Identity checked in directory.'}</p>
      </div>
    `;
    
    // Financial Analyst Agent
    const finDetails = agentDetails.finance || {};
    html += `
      <div class="reasoning-card" style="margin-bottom: 10px;">
        <h4>
          <span>💰 Financial Analyst Agent</span>
          <span class="agent-badge" style="background: ${finDetails.status === 'Clear' ? 'var(--color-success-bg)' : 'var(--color-warning-bg)'}; color: ${finDetails.status === 'Clear' ? 'var(--color-success)' : 'var(--color-warning)'}">${finDetails.status || 'Verified'}</span>
        </h4>
        <p>${finDetails.details || 'Ledger checked.'}</p>
        ${finDetails.percentagePaid !== undefined ? `
          <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 4px;">
            Payment Ratio: ${finDetails.percentagePaid.toFixed(1)}% (₹${finDetails.amountPaid.toLocaleString()} paid of ₹${finDetails.amountDue.toLocaleString()} due)
          </div>
        ` : ''}
      </div>
    `;
    
    // Risk Sentinel Agent
    const riskDetails = agentDetails.risk || {};
    const riskColor = riskDetails.riskLevel === 'High' ? 'var(--color-danger)' : riskDetails.riskLevel === 'Medium' ? 'var(--color-warning)' : 'var(--color-success)';
    html += `
      <div class="reasoning-card" style="margin-bottom: 10px;">
        <h4>
          <span>🛡️ Risk Sentinel Agent</span>
          <span class="agent-badge" style="background: ${riskDetails.riskLevel === 'High' ? 'var(--color-danger-bg)' : riskDetails.riskLevel === 'Medium' ? 'var(--color-warning-bg)' : 'var(--color-success-bg)'}; color: ${riskColor}">${riskDetails.riskLevel || 'Low'} Risk</span>
        </h4>
        <p>${riskDetails.details || 'Holds registry evaluated.'}</p>
        <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 4px;">
          Active Holds: ${riskDetails.blockingHoldsFound ? 'Yes' : 'No'} | Rate Limited: ${riskDetails.isRateLimited ? 'Yes' : 'No'}
        </div>
      </div>
    `;
    
    // Policy Compliance Agent
    const polDetails = agentDetails.policy || {};
    html += `
      <div class="reasoning-card" style="margin-bottom: 10px;">
        <h4>
          <span>📜 Policy Compliance Agent (RAG)</span>
          <span class="agent-badge" style="background: ${polDetails.isCompliant ? 'var(--color-success-bg)' : 'var(--color-danger-bg)'}; color: ${polDetails.isCompliant ? 'var(--color-success)' : 'var(--color-danger)'}">${polDetails.isCompliant ? 'Compliant' : 'Non-Compliant'}</span>
        </h4>
        <p>${polDetails.details || 'Grounding completed.'}</p>
        ${polDetails.applicablePolicies && polDetails.applicablePolicies.length > 0 ? `
          <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 4px;">
            Applied: ${polDetails.applicablePolicies.join(', ')}
          </div>
        ` : ''}
      </div>
    `;
  }
  
  if (citations && citations.length > 0) {
    html += `
      <div class="citations-list">
        <h5>Grounding Citations</h5>
        <ul>
          ${citations.map(c => `<li><code>${c}</code></li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

// Simulated Pipeline Data (Fallback)
function runSimulatedPipelineData(studentId, receiptNumber, isRateLimited) {
  const student = studentDatabase[studentId];
  if (!student) return null;
  
  const percentage = student.finance.percentage;
  const receiptMatch = student.finance.receipt === receiptNumber;
  const activeHolds = student.holds.filter(h => h.status === 'Active');
  
  if (isRateLimited) {
    return {
      decision: "DENY",
      confidence: 0.99,
      summary: "Reactivation requests for this user have exceeded the rate limit of 3 requests per 10 minutes. Blocked under security policy POL-004 §4.",
      citations: ["RIT-POL-004 §4"],
      reasoningTrace: [
        "Step 1 (Identity): Student verified in directory.",
        "Step 2 (Finance): Skipped due to security rate limit hold.",
        "Step 3 (Risk): Risk assessed as High. Rate limit threshold exceeded.",
        "Step 4 (Policy): Non-compliant. Rate limit violation under POL-004 §4.",
        "Step 5 (Synthesis): Denied. Rate limit block active."
      ],
      agentDetails: {
        identity: { status: "Verified", details: `Verified ${student.profile.name}.`, confidence: 0.99 },
        finance: { status: "Clear", percentagePaid: percentage, amountDue: student.finance.due, amountPaid: student.finance.paid, receiptValid: receiptMatch, details: "Skipped." },
        risk: { riskLevel: "High", isRateLimited: true, blockingHoldsFound: true, details: "Rate limit exceeded." },
        policy: { isCompliant: false, applicablePolicies: ["POL-004 §4"], verdictRecommendation: "DENY", details: "Rate limit violation." }
      }
    };
  }
  
  if (studentId === "S10001") {
    return {
      decision: "APPROVE",
      confidence: 0.98,
      summary: "Identity and tuition tuition payment verified. No active holds or security flags present. Account reactivation approved under RIT-POL-001 §6.3.",
      citations: ["RIT-POL-001 §6.3"],
      reasoningTrace: [
        `Step 1 (Identity): Verified student Aarav Sharma. Account is currently disabled.`,
        `Step 2 (Finance): Confirmed 100% payment (₹1,25,000 / ₹1,25,000). Receipt ${receiptNumber || student.finance.receipt} matches bank record.`,
        `Step 3 (Risk): Risk level is Low. Rate limits are within bounds. No active holds found.`,
        `Step 4 (Policy): Fully compliant with RIT-POL-001 §6.3. Immediate reactivation is authorized.`,
        `Step 5 (Synthesis): Approved. All compliance checks passed. Re-enabling student directory account.`
      ],
      agentDetails: {
        identity: { status: "Verified", details: "Verified Aarav Sharma (CS). Account disabled.", confidence: 0.99 },
        finance: { status: "Clear", percentagePaid: 100.0, amountDue: 125000, amountPaid: 125000, receiptValid: true, details: "100% paid. Receipt REC-2026-1001 is valid." },
        risk: { riskLevel: "Low", isRateLimited: false, blockingHoldsFound: false, details: "No holds. Low rate limit usage." },
        policy: { isCompliant: true, applicablePolicies: ["POL-001 §6.3"], verdictRecommendation: "APPROVE", details: "Meets full payment criteria." }
      }
    };
  }
  
  if (studentId === "S10002") {
    return {
      decision: "ESCALATE",
      confidence: 0.94,
      summary: "Student Priya Nair has paid 83.3% of tuition (₹1,25,000 / ₹1,50,000) which is above the 80% threshold for Restructured Course Access. Escalating to IT Administration for manual activation under POL-001 §7.2.",
      citations: ["RIT-POL-001 §7.2"],
      reasoningTrace: [
        `Step 1 (Identity): Verified student Priya Nair. Account is currently disabled.`,
        `Step 2 (Finance): Payment verified at 83.3% (₹1,25,000 paid, ₹25,000 due). Receipt ${receiptNumber || student.finance.receipt} is valid.`,
        `Step 3 (Risk): Risk level is Medium. Active Financial Hold placed by Office of Accounts. Outstanding balance is ₹25,000.`,
        `Step 4 (Policy): Matches RIT-POL-001 §7.2 criteria. Restructured access to core classes permitted pending IT callback.`,
        `Step 5 (Synthesis): Escalated. Student meets the 80% payment threshold. Awaiting human administrator approval.`
      ],
      agentDetails: {
        identity: { status: "Verified", details: "Verified Priya Nair (ECE). Account disabled.", confidence: 0.99 },
        finance: { status: "Outstanding Balance", percentagePaid: 83.3, amountDue: 150000, amountPaid: 125000, receiptValid: true, details: "83.3% paid. ₹25,000 remaining balance." },
        risk: { riskLevel: "Medium", isRateLimited: false, blockingHoldsFound: true, details: "Active Financial Hold (₹25,000 outstanding)." },
        policy: { isCompliant: true, applicablePolicies: ["POL-001 §7.2"], verdictRecommendation: "ESCALATE", details: "Meets partial access criteria (83.3% >= 80%)." }
      }
    };
  }
  
  if (studentId === "S10003") {
    return {
      decision: "APPROVE",
      confidence: 0.95,
      summary: "Full payment verified. Active academic integrity hold has expired as of 2026-03-15. Reactivation approved under POL-003 §4 and POL-001 §6.3.",
      citations: ["RIT-POL-001 §6.3", "RIT-POL-003 §4"],
      reasoningTrace: [
        `Step 1 (Identity): Verified student Rohan Deshmukh. Account is currently disabled.`,
        `Step 2 (Finance): Verified 100% payment (₹1,00,000 / ₹1,00,000). Receipt ${receiptNumber || student.finance.receipt} is valid.`,
        `Step 3 (Risk): Risk level is Low. AcademicIntegrity hold was found, but status is Expired (probation ended March 2026).`,
        `Step 4 (Policy): Compliant. Expired holds cannot block account reactivation per POL-003 §4.`,
        `Step 5 (Synthesis): Approved. Reactivation authorized since payment is complete and hold has expired.`
      ],
      agentDetails: {
        identity: { status: "Verified", details: "Verified Rohan Deshmukh (Mech). Account disabled.", confidence: 0.99 },
        finance: { status: "Clear", percentagePaid: 100.0, amountDue: 100000, amountPaid: 100000, receiptValid: true, details: "100% paid. Receipt REC-2026-1003 is valid." },
        risk: { riskLevel: "Low", isRateLimited: false, blockingHoldsFound: false, details: "Academic Integrity hold has expired." },
        policy: { isCompliant: true, applicablePolicies: ["POL-001 §6.3", "POL-003 §4"], verdictRecommendation: "APPROVE", details: "Expired hold bypassed per policy." }
      }
    };
  }
  
  if (studentId === "S10004") {
    return {
      decision: "DENY",
      confidence: 0.99,
      summary: "Full tuition payment verified, but student Ananya Iyer has an active Investigation hold (Code of Conduct disciplinary investigation). Reactivation is strictly denied under POL-003 §3.",
      citations: ["RIT-POL-003 §3"],
      reasoningTrace: [
        `Step 1 (Identity): Verified student Ananya Iyer. Account is currently disabled.`,
        `Step 2 (Finance): Verified 100% payment (₹1,40,000 / ₹1,40,000). Receipt ${receiptNumber || student.finance.receipt} is valid.`,
        `Step 3 (Risk): Risk level is High. Active Investigation hold placed by Dean of Students.`,
        `Step 4 (Policy): Non-compliant. Active disciplinary investigation holds require manual resolution by the Dean's office.`,
        `Step 5 (Synthesis): Denied. Reactivation blocked by active disciplinary hold.`
      ],
      agentDetails: {
        identity: { status: "Verified", details: "Verified Ananya Iyer (Business). Account disabled.", confidence: 0.99 },
        finance: { status: "Clear", percentagePaid: 100.0, amountDue: 140000, amountPaid: 140000, receiptValid: true, details: "100% paid. Receipt REC-2026-1004 is valid." },
        risk: { riskLevel: "High", isRateLimited: false, blockingHoldsFound: true, details: "Active Disciplinary Investigation hold." },
        policy: { isCompliant: false, applicablePolicies: ["POL-003 §3"], verdictRecommendation: "DENY", details: "Active disciplinary investigation hold blocks reactivation." }
      }
    };
  }
  
  if (studentId === "S10005") {
    return {
      decision: "ESCALATE",
      confidence: 0.92,
      summary: "Student Karthik Reddy has paid 40% (₹48,000 / ₹1,20,000), but has an active financial hold with a Hardship Provision note. Escalating to IT for 72-hour temporary access under RIT-POL-005 §2.",
      citations: ["RIT-POL-005 §2"],
      reasoningTrace: [
        `Step 1 (Identity): Verified student Karthik Reddy. Account is currently disabled.`,
        `Step 2 (Finance): Payment at 40% (₹48,000 paid). Note detected: 'Hardship application pending'. Receipt ${receiptNumber || student.finance.receipt} matches.`,
        `Step 3 (Risk): Risk level is Medium. Active Financial Hold (Office of Accounts Hold) of ₹72,000.`,
        `Step 4 (Policy): Matches RIT-POL-005 §2. Hardship provision enables a 72-hour temporary reactivation pending review.`,
        `Step 5 (Synthesis): Escalated. Hardship provision requires IT admin confirmation for temporary 72-hour access.`
      ],
      agentDetails: {
        identity: { status: "Verified", details: "Verified Karthik Reddy (Civil). Account disabled.", confidence: 0.99 },
        finance: { status: "Outstanding Balance", percentagePaid: 40.0, amountDue: 120000, amountPaid: 48000, receiptValid: true, details: "40% paid. Hardship note present." },
        risk: { riskLevel: "Medium", isRateLimited: false, blockingHoldsFound: true, details: "Active Office of Accounts Hold (₹72,000 outstanding)." },
        policy: { isCompliant: true, applicablePolicies: ["POL-005 §2"], verdictRecommendation: "ESCALATE", details: "Meets hardship temporary access criteria." }
      }
    };
  }
  
  return {
    decision: "ESCALATE",
    confidence: 0.85,
    summary: `Reactivation request parsed. Escalating to administrator for manual verification.`,
    citations: ["RIT-POL-001"],
    reasoningTrace: [
      "Step 1 (Identity): Checked student registry.",
      "Step 2 (Finance): Evaluated payment ledger.",
      "Step 3 (Risk): Assessed account status and holds.",
      "Step 4 (Policy): Compared with RIT guidelines.",
      "Step 5 (Synthesis): Escalated by default guidelines."
    ],
    agentDetails: {
      identity: { status: "Verified", details: `Verified student ID ${studentId}.`, confidence: 0.95 },
      finance: { status: "Pending", percentagePaid: percentage, amountDue: student.finance.due, amountPaid: student.finance.paid, receiptValid: receiptMatch, details: "Payment ledger analyzed." },
      risk: { riskLevel: "Medium", isRateLimited: false, blockingHoldsFound: activeHolds.length > 0, details: "Default risk assessment." },
      policy: { isCompliant: true, applicablePolicies: ["POL-001"], verdictRecommendation: "ESCALATE", details: "Referenced standard policy guidelines." }
    }
  };
}

// ─── ADAPTIVE CARD RENDERER ────────────────────────────────────────────────
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
          <span>₹${student.finance.due.toLocaleString()}</span>
          <span class="ac-fact-title">Amount Paid:</span>
          <span>₹${student.finance.paid.toLocaleString()} (${student.finance.percentage.toFixed(1)}%)</span>
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
window.processITAction = async function(action, studentId, citation, trace, recommendationType = "approve") {
  addChatMessage("IT Lead", `${action.toUpperCase()} verification request for student ${studentId}`, "user");
  clearReactivationState();

  if (LIVE_MODE) {
    try {
      logGraphRequest("POST", `/api/approve-callback`, {
        studentId,
        transactionId: currentTransactionId,
        approvedBy: "it.lead@ritedu.edu",
        action: action === 'approve' ? 'approve' : action === 'deny' ? 'deny' : 'escalate'
      });
      
      const response = await apiCall("POST", `/api/approve-callback`, {
        studentId,
        transactionId: currentTransactionId,
        approvedBy: "it.lead@ritedu.edu",
        action: action === 'approve' ? 'approve' : action === 'deny' ? 'deny' : 'escalate'
      });
      logGraphResponse(200, response);
      
      if (action === "approve") {
        studentDatabase[studentId].profile.active = true;
        updateEnterpriseUI(studentId);
        
        let scopeText = "🟢 M365 Account restored. 🟢 Canvas LMS restored. 🟢 Library physical services restored.";
        if (recommendationType === "approve-partial") {
          scopeText = "🟢 M365 Account restored. 🟡 Canvas LMS core course access restored. 🔴 Library physical access remains restricted.";
        } else if (recommendationType === "temporary") {
          scopeText = "🟢 M365 Account restored. 🟡 Canvas LMS restored. (Temporary 72 Hours Extension).";
        }
        
        addChatMessage("Sutradhara Agent", `Account reactivated successfully. Access Level: ${scopeText}`, "agent");
        addAuditRow(studentId, recommendationType === 'temporary' ? 'TemporaryAccess' : 'Reactivate', citation, "it.lead@ritedu.edu", trace);
        syncAuditLogs();
      } else if (action === "deny") {
        addChatMessage("Sutradhara Agent", `Reactivation Denied. Rejection audit entry created.`, "agent");
        addAuditRow(studentId, "Deny", citation, "it.lead@ritedu.edu", trace);
        syncAuditLogs();
      } else {
        addChatMessage("Sutradhara Agent", `Request escalated. Forwarding payload to Dean of Students office.`, "agent");
        addAuditRow(studentId, "Escalate", citation, "it.lead@ritedu.edu", trace);
        syncAuditLogs();
      }
    } catch (err) {
      addChatMessage("Sutradhara Agent", `❌ <b>Approval Callback Failed:</b> ${err.message}`, "agent");
    }
  } else {
    // Simulated Action
    if (action === "approve") {
      addChatMessage("Sutradhara Agent", `Approval received. Executing Microsoft Graph provisioning...`, "agent");
      logGraphRequest("PATCH", `/users/${studentId}`, { accountEnabled: true });
      
      setTimeout(() => {
        logGraphResponse(204);
        studentDatabase[studentId].profile.active = true;
        updateEnterpriseUI(studentId);

        let scopeText = "🟢 M365 Account restored. 🟢 Canvas LMS restored. 🟢 Library physical services restored.";
        let auditAction = "Reactivate";
        
        if (recommendationType === "approve-partial") {
          scopeText = "🟢 M365 Account restored. 🟡 Canvas LMS core course access restored. 🔴 Library physical access remains restricted.";
        } else if (recommendationType === "temporary") {
          scopeText = "🟢 M365 Account restored. 🟡 Canvas LMS restored. (Temporary 72 Hours Extension).";
          auditAction = "TemporaryAccess";
        }

        addChatMessage("Sutradhara Agent", `Account reactivated successfully. Access Level: ${scopeText}`, "agent");
        
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
  }
};

// Request tracker to prevent spam
function trackRequestRate() {
  const now = Date.now();
  requestTimestamps.push(now);
  requestTimestamps = requestTimestamps.filter(t => now - t < 10 * 60 * 1000);
  requestCount = requestTimestamps.length;
}

// ─── INTERACTIVE USER CHAT HANDLER ──────────────────────────────────────────
async function submitUserChat() {
  const messageText = chatInput.value.trim();
  if (!messageText) return;
  
  chatInput.value = "";
  addChatMessage("Front Desk Operator", messageText, "user");
  
  const studentIdMatch = messageText.match(/S\d{5}/i);
  const studentId = studentIdMatch ? studentIdMatch[0].toUpperCase() : null;
  const receiptMatch = messageText.match(/REC-\d{4}-\d{4}|REC-\d{4}-\d{3,4}|REC-\S+/i);
  const receiptNumber = receiptMatch ? receiptMatch[0].toUpperCase() : null;
  
  currentTransactionId = generateGuid();
  clearReactivationState();
  
  if (studentId) {
    activeStudentId = studentId;
    trackRequestRate();
    
    addChatMessage("Sutradhara Agent", `Initiating multi-agent reasoning verification. Transaction ID: <code>${currentTransactionId}</code>...`, "agent");
    
    // Reset nodes in UI
    const nodes = ['node-identity', 'node-finance', 'node-risk', 'node-policy', 'node-orchestrator'];
    nodes.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = 'pipeline-node';
    });
    const conns = ['conn-1', 'conn-2', 'conn-3', 'conn-4'];
    conns.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = 'pipeline-connector';
    });

    if (LIVE_MODE) {
      try {
        logGraphRequest("POST", `/api/chat`, { message: messageText, requestedBy: "frontdesk.operator@ritedu.edu" });
        const response = await apiCall("POST", `/api/chat`, {
          message: messageText,
          requestedBy: "frontdesk.operator@ritedu.edu"
        });
        logGraphResponse(200, response);
        
        if (response.type === 'pipeline') {
          // Fetch registry details to sync UI
          logGraphRequest("GET", `/api/student/${studentId}`);
          const data = await apiCall("GET", `/api/student/${studentId}`);
          logGraphResponse(200, data);
          
          const liveStudent = {
            profile: {
              id: studentId,
              name: data.profile.displayName,
              email: data.profile.userPrincipalName,
              dept: data.profile.department || 'N/A',
              active: data.profile.accountEnabled
            },
            finance: data.finance && data.finance.length > 0 ? {
              due: data.finance[0].AmountDue || 0,
              paid: data.finance[0].AmountPaid || 0,
              percentage: data.finance[0].AmountDue > 0 ? ((data.finance[0].AmountPaid / data.finance[0].AmountDue) * 100) : 0,
              receipt: data.finance[0].ReceiptNumber || 'N/A',
              status: data.finance[0].VerificationStatus || 'Unknown'
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
          studentDatabase[studentId] = liveStudent;
          updateEnterpriseUI(studentId);
          
          // Pipeline animation
          const agentDecision = response.decision ? response.decision.toUpperCase() : 'ESCALATE';
          animateAgentPipeline(agentDecision, response.agentDetails, () => {
            addChatMessage("Sutradhara Agent", 
              `<b>Reasoning Synthesis Verdict:</b> ${agentDecision}<br><b>Citations:</b> ${response.citations.join(', ')}<br><br>${response.summary}`, 
              "agent"
            );
            
            if (response.decision === 'APPROVE') {
              liveStudent.profile.active = true;
              updateEnterpriseUI(studentId);
              addChatMessage("Sutradhara Agent", `✅ Account reactivated via Microsoft Graph API. Student notified via Outlook.`, "agent");
            }
            
            addAuditRow(studentId, response.decision === 'APPROVE' ? 'Reactivate' : response.decision === 'DENY' ? 'Deny' : 'Escalate',
              response.citations[0] || 'RIT-POL-001', "Sutradhara (Autonomous)", response.reasoningTrace.join(' | '));
            syncAuditLogs();
            
            updateReasoningUI(agentDecision, response.confidence, response.summary, response.citations, response.reasoningTrace, response.agentDetails);
            
            const cardRecommendation = agentDecision === 'APPROVE' ? 'approve' : agentDecision === 'DENY' ? 'deny' : (studentId === 'S10005' ? 'temporary' : 'approve-partial');
            renderAdaptiveCard(studentId, liveStudent, cardRecommendation, response.citations[0] || 'RIT-POL-001', response.summary);
          });
        } else {
          // Conversational response
          addChatMessage("Sutradhara Agent", response.message, "agent");
        }
      } catch (err) {
        addChatMessage("Sutradhara Agent", `❌ <b>Live Backend Error:</b> ${err.message}`, "agent");
      }
    } else {
      // Simulation Mode
      const student = studentDatabase[studentId];
      if (student) {
        updateEnterpriseUI(studentId);
        
        logGraphRequest("GET", `/users/${studentId}`);
        setTimeout(() => {
          logGraphResponse(200, { id: student.profile.id, displayName: student.profile.name, accountEnabled: student.profile.active });
          
          logGraphRequest("GET", `/sites/BursarOffice/lists/FinanceLedger/items`);
          setTimeout(() => {
            logGraphResponse(200, { value: [{ fields: student.finance }] });
            
            logGraphRequest("GET", `/sites/BursarOffice/lists/HoldRegistry/items`);
            setTimeout(() => {
              logGraphResponse(200, { value: student.holds });
              
              const isRateLimited = (requestCount > 3);
              const pipelineResult = runSimulatedPipelineData(studentId, receiptNumber || student.finance.receipt, isRateLimited);
              
              animateAgentPipeline(pipelineResult.decision, pipelineResult.agentDetails, () => {
                addChatMessage("Sutradhara Agent", 
                  `<b>Reasoning synthesis complete.</b><br><b>Decision:</b> ${pipelineResult.decision}<br><b>Citations:</b> ${pipelineResult.citations.join(', ')}<br><br>${pipelineResult.summary}`, 
                  "agent"
                );
                
                updateReasoningUI(pipelineResult.decision, pipelineResult.confidence, pipelineResult.summary, pipelineResult.citations, pipelineResult.reasoningTrace, pipelineResult.agentDetails);
                
                const rec = pipelineResult.decision === 'APPROVE' ? 'approve' : pipelineResult.decision === 'DENY' ? 'deny' : 'escalate';
                const recType = rec === 'escalate' ? (studentId === 'S10005' ? 'temporary' : 'approve-partial') : rec;
                renderAdaptiveCard(studentId, student, recType, pipelineResult.citations[0], pipelineResult.summary);
              });
            }, 400);
          }, 300);
        }, 400);
      } else {
        setTimeout(() => {
          addChatMessage("Sutradhara Agent", `Verification failed. Student ID **${studentId}** does not exist in our Entra ID records. Reactivation aborted.`, "agent");
        }, 800);
      }
    }
  } else {
    // Non-reactivation chat query
    addChatMessage("Sutradhara Agent", `Thinking...`, "agent");
    setTimeout(async () => {
      chatHistory.removeChild(chatHistory.lastChild); // remove thinking
      
      if (LIVE_MODE) {
        try {
          const response = await apiCall("POST", `/api/chat`, {
            message: messageText,
            requestedBy: "frontdesk.operator@ritedu.edu"
          });
          addChatMessage("Sutradhara Agent", response.message, "agent");
        } catch (err) {
          addChatMessage("Sutradhara Agent", `I am **Sutradhara**. Please provide a Student ID (e.g. S10001) and tuition receipt number (e.g. REC-2026-1001) to evaluate reactivation.`, "agent");
        }
      } else {
        addChatMessage("Sutradhara Agent", `Hello! I am **Sutradhara**, your autonomous student account lifecycle reasoning copilot. To run our multi-agent compliance pipeline, please provide a request with a valid **Student ID** (e.g., **S10001**) and **Receipt Number** (e.g., **REC-2026-1001**).`, "agent");
      }
    }, 800);
  }
}

// Wire Chat Events
chatSendBtn.addEventListener("click", submitUserChat);
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    submitUserChat();
  }
});

// Setup on load
window.addEventListener("load", () => {
  // Wire live mode toggle btn
  const toggleBtn = document.getElementById("toggle-live-btn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", toggleLiveMode);
  }
});

// ─── Demo Payment Section Handlers ──────────────────────────────────────────
window.onPaymentStudentChange = async function() {
  const studentId = document.getElementById("payment-student-id").value;
  const hintEl = document.getElementById("payment-balance-hint");
  const amountInput = document.getElementById("payment-amount");
  
  if (!studentId) {
    hintEl.textContent = "";
    amountInput.value = "";
    return;
  }

  try {
    let due = 120000;
    let paid = 0;

    if (LIVE_MODE) {
      logGraphRequest("GET", `/api/student/${studentId}`);
      const data = await apiCall("GET", `/api/student/${studentId}`);
      logGraphResponse(200, data);
      if (data.finance && data.finance.length > 0) {
        due = data.finance[0].AmountDue || 120000;
        paid = data.finance[0].AmountPaid || 0;
      }
    } else {
      const student = studentDatabase[studentId];
      if (student) {
        due = student.finance.due;
        paid = student.finance.paid;
      }
    }

    const balance = due - paid;
    hintEl.innerHTML = `Total Tuition Due: <strong>₹${due.toLocaleString()}</strong> | Already Paid: <strong>₹${paid.toLocaleString()}</strong><br>Remaining Balance: <strong>₹${balance.toLocaleString()}</strong>`;
    amountInput.value = balance > 0 ? balance : "";
  } catch (err) {
    console.error("Failed to load student payment info:", err);
    hintEl.textContent = "Error loading student balance.";
  }
};

window.handlePaymentSubmit = async function(event) {
  event.preventDefault();
  const studentId = document.getElementById("payment-student-id").value;
  const amountPaid = Number(document.getElementById("payment-amount").value);
  const paymentMethod = document.getElementById("payment-method").value;
  const statusEl = document.getElementById("payment-status-message");

  if (!studentId || !amountPaid || !paymentMethod) {
    alert("Please fill in all fields.");
    return;
  }

  statusEl.style.display = "block";
  statusEl.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
  statusEl.style.color = "var(--text-color)";
  statusEl.textContent = "Processing payment...";

  try {
    if (LIVE_MODE) {
      logGraphRequest("POST", `/api/payment`, { studentId, amountPaid, paymentMethod });
      const response = await apiCall("POST", `/api/payment`, { studentId, amountPaid, paymentMethod });
      logGraphResponse(200, response);

      statusEl.style.backgroundColor = "var(--color-success-bg)";
      statusEl.style.color = "var(--color-success)";
      statusEl.innerHTML = `✅ Payment Cleared!<br>Receipt Reference: <strong>${response.receiptNumber}</strong><br>Holds registry and finance ledgers updated in DB.`;

      // Fetch student data and update enterprise UI
      logGraphRequest("GET", `/api/student/${studentId}`);
      const data = await apiCall("GET", `/api/student/${studentId}`);
      logGraphResponse(200, data);

      const liveStudent = {
        profile: {
          id: studentId,
          name: data.profile.displayName,
          email: data.profile.userPrincipalName,
          dept: data.profile.department || 'N/A',
          active: data.profile.accountEnabled
        },
        finance: data.finance && data.finance.length > 0 ? {
          due: data.finance[0].AmountDue || 0,
          paid: data.finance[0].AmountPaid || 0,
          percentage: data.finance[0].AmountDue > 0 ? ((data.finance[0].AmountPaid / data.finance[0].AmountDue) * 100) : 0,
          receipt: data.finance[0].ReceiptNumber || 'N/A',
          status: data.finance[0].VerificationStatus || 'Unknown'
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
      studentDatabase[studentId] = liveStudent;
      updateEnterpriseUI(studentId);
      
      // Post notice in chat
      addChatMessage("System Office", `Tuition payment of ₹${amountPaid.toLocaleString()} processed for ${studentId} via ${paymentMethod}. Generated receipt: ${response.receiptNumber}`, "user");
      
    } else {
      // Simulate payment update
      const student = studentDatabase[studentId];
      if (student) {
        const receiptNumber = `REC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        student.finance.paid = amountPaid;
        student.finance.percentage = (amountPaid / student.finance.due) * 100;
        student.finance.receipt = receiptNumber;
        student.finance.date = new Date().toISOString().split('T')[0];
        student.finance.status = "Verified";

        const outstanding = student.finance.due - amountPaid;
        if (outstanding <= 50000) {
          student.holds = student.holds.filter(h => h.type !== 'Financial');
        } else {
          const holds = student.holds || [];
          const finHoldIdx = holds.findIndex(h => h.type === 'Financial');
          const holdData = {
            id: "H-" + Math.floor(Math.random()*1000),
            type: "Financial",
            status: "Active",
            placed: new Date().toISOString().split('T')[0],
            expiry: null,
            placedBy: "Office of Accounts",
            reason: `Tuition balance outstanding: ₹${outstanding.toLocaleString()}`
          };
          if (finHoldIdx >= 0) holds[finHoldIdx] = holdData;
          else holds.push(holdData);
          student.holds = holds;
        }

        updateEnterpriseUI(studentId);
        
        statusEl.style.backgroundColor = "var(--color-success-bg)";
        statusEl.style.color = "var(--color-success)";
        statusEl.innerHTML = `✅ Payment Cleared (SIM)!<br>Receipt Reference: <strong>${receiptNumber}</strong><br>Holds registry and finance ledgers updated.`;
        
        addChatMessage("System Office", `Tuition payment of ₹${amountPaid.toLocaleString()} processed for ${studentId} via ${paymentMethod}. Generated receipt: ${receiptNumber}`, "user");
      }
    }
    
    // Refresh balance hint
    onPaymentStudentChange();
  } catch (err) {
    statusEl.style.backgroundColor = "var(--color-danger-bg)";
    statusEl.style.color = "var(--color-danger)";
    statusEl.textContent = `❌ Payment failed: ${err.message}`;
  }
};
