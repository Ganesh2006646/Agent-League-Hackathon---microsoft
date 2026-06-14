/**
 * Sutradhara — Telemetry Module
 * 
 * Tracks agent-level timing, decision distribution, and per-request metadata
 * for the multi-agent pipeline. Stores the last 100 entries in memory.
 * 
 * Usage:
 *   const { createTelemetrySession, getTelemetryData, getTelemetrySummary } = require('./telemetry');
 *   const session = createTelemetrySession(studentId);
 *   session.startAgent('Identity');
 *   // ... agent work ...
 *   session.endAgent('Identity');
 *   session.setDecision('APPROVE');
 *   session.finish();
 */

// ---------------------------------------------------------------------------
// In-Memory Telemetry Store (ring buffer, max 100 entries)
// ---------------------------------------------------------------------------
const MAX_ENTRIES = 100;
const telemetryStore = [];

// ---------------------------------------------------------------------------
// createTelemetrySession(studentId)
// Returns a session object that tracks timing and decisions for one request.
// ---------------------------------------------------------------------------
function createTelemetrySession(studentId) {
  const session = {
    studentId: studentId || 'unknown',
    timestamp: new Date().toISOString(),
    agentTimings: {},        // { agentName: { startTime, endTime, durationMs } }
    decision: null,          // APPROVE | DENY | ESCALATE
    totalDuration: null,     // milliseconds from session creation to finish()
    _startTime: Date.now(),  // internal: session start
    _agentStarts: {},        // internal: pending start timestamps per agent

    /**
     * Mark the start of an agent's execution.
     * @param {string} name — Agent name (e.g., 'Identity', 'Finance', 'Risk', 'Policy', 'Synthesis')
     */
    startAgent(name) {
      this._agentStarts[name] = Date.now();
      this.agentTimings[name] = this.agentTimings[name] || {};
      this.agentTimings[name].startTime = new Date().toISOString();
    },

    /**
     * Mark the end of an agent's execution.
     * Calculates and stores the duration in milliseconds.
     * @param {string} name — Agent name (must match a previous startAgent call)
     */
    endAgent(name) {
      const startTs = this._agentStarts[name];
      if (!startTs) {
        console.warn(`[Telemetry] endAgent("${name}") called without a matching startAgent.`);
        return;
      }
      const endTs = Date.now();
      this.agentTimings[name] = {
        ...this.agentTimings[name],
        endTime: new Date().toISOString(),
        durationMs: endTs - startTs
      };
      delete this._agentStarts[name];
    },

    /**
     * Record the final decision for this request.
     * @param {string} decision — One of 'APPROVE', 'DENY', 'ESCALATE'
     */
    setDecision(decision) {
      this.decision = (decision || '').toUpperCase();
    },

    /**
     * Finalize the session and push it into the telemetry store.
     * Calculates totalDuration and strips internal fields before storage.
     */
    finish() {
      this.totalDuration = Date.now() - this._startTime;

      // Build the stored record (exclude internal fields)
      const record = {
        studentId: this.studentId,
        timestamp: this.timestamp,
        decision: this.decision,
        totalDuration: this.totalDuration,
        agentTimings: { ...this.agentTimings }
      };

      // Ring buffer: drop oldest if at capacity
      if (telemetryStore.length >= MAX_ENTRIES) {
        telemetryStore.shift();
      }
      telemetryStore.push(record);

      return record;
    }
  };

  return session;
}

// ---------------------------------------------------------------------------
// getTelemetryData()
// Returns all stored telemetry records (up to MAX_ENTRIES).
// ---------------------------------------------------------------------------
function getTelemetryData() {
  return [...telemetryStore];
}

// ---------------------------------------------------------------------------
// getTelemetrySummary()
// Returns aggregated statistics across all stored telemetry:
//   - totalRequests: total number of tracked requests
//   - decisionDistribution: { APPROVE: n, DENY: n, ESCALATE: n }
//   - avgTimePerAgent: { agentName: avgMs }
//   - avgTotalDuration: average total request duration in ms
// ---------------------------------------------------------------------------
function getTelemetrySummary() {
  const totalRequests = telemetryStore.length;

  if (totalRequests === 0) {
    return {
      totalRequests: 0,
      decisionDistribution: { APPROVE: 0, DENY: 0, ESCALATE: 0 },
      avgTimePerAgent: {},
      avgTotalDuration: 0
    };
  }

  // --- Decision distribution ---
  const decisionDistribution = { APPROVE: 0, DENY: 0, ESCALATE: 0 };
  for (const entry of telemetryStore) {
    const d = (entry.decision || '').toUpperCase();
    if (d in decisionDistribution) {
      decisionDistribution[d]++;
    }
  }

  // --- Average time per agent ---
  const agentTotals = {};  // { agentName: { totalMs, count } }
  for (const entry of telemetryStore) {
    for (const [agentName, timing] of Object.entries(entry.agentTimings || {})) {
      if (timing.durationMs !== undefined) {
        if (!agentTotals[agentName]) {
          agentTotals[agentName] = { totalMs: 0, count: 0 };
        }
        agentTotals[agentName].totalMs += timing.durationMs;
        agentTotals[agentName].count++;
      }
    }
  }
  const avgTimePerAgent = {};
  for (const [name, stats] of Object.entries(agentTotals)) {
    avgTimePerAgent[name] = Math.round(stats.totalMs / stats.count);
  }

  // --- Average total duration ---
  const totalDurationSum = telemetryStore.reduce((sum, e) => sum + (e.totalDuration || 0), 0);
  const avgTotalDuration = Math.round(totalDurationSum / totalRequests);

  return {
    totalRequests,
    decisionDistribution,
    avgTimePerAgent,
    avgTotalDuration
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  createTelemetrySession,
  getTelemetryData,
  getTelemetrySummary
};
