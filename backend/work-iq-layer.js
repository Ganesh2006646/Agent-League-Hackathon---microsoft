/**
 * Sutradhara — Work IQ Contextual Signals Module
 * 
 * Provides synthetic work/academic context signals for student reactivation
 * decisions. Uses the current date to determine semester phase and calculates
 * urgency scores, department load, and contextual recommendations.
 * 
 * Usage:
 *   const { getWorkContext, getSeasonalUrgency } = require('./work-iq-layer');
 *   const context = getWorkContext('S10001');
 *   const urgency = getSeasonalUrgency();
 */

// ---------------------------------------------------------------------------
// Student Department Mapping (mirrors the fallback database in server.js)
// ---------------------------------------------------------------------------
const studentDepartments = {
  'S10001': { department: 'Computer Science', semester: 'Semester 6', enrollmentYear: 2023 },
  'S10002': { department: 'Electronics & Communication', semester: 'Semester 4', enrollmentYear: 2024 },
  'S10003': { department: 'Mechanical Engineering', semester: 'Semester 6', enrollmentYear: 2023 },
  'S10004': { department: 'Business Administration', semester: 'Semester 2', enrollmentYear: 2025 },
  'S10005': { department: 'Civil Engineering', semester: 'Semester 4', enrollmentYear: 2024 },
  'S10006': { department: 'Data Science', semester: 'Semester 6', enrollmentYear: 2023 },
  'S10007': { department: 'Information Technology', semester: 'Semester 4', enrollmentYear: 2024 },
  'S10008': { department: 'Biotechnology', semester: 'Semester 2', enrollmentYear: 2025 }
};

// ---------------------------------------------------------------------------
// Department Load Data (synthetic — simulates current workload)
// Varies by department and time of year
// ---------------------------------------------------------------------------
const departmentLoadProfiles = {
  'Computer Science':           { baseLoad: 'heavy',    peakMonths: [5, 6, 11, 12] },
  'Electronics & Communication': { baseLoad: 'moderate', peakMonths: [5, 6, 11, 12] },
  'Mechanical Engineering':      { baseLoad: 'moderate', peakMonths: [4, 5, 11]     },
  'Business Administration':     { baseLoad: 'light',    peakMonths: [5, 6, 12]     },
  'Civil Engineering':           { baseLoad: 'moderate', peakMonths: [5, 6, 11]     },
  'Data Science':                { baseLoad: 'heavy',    peakMonths: [5, 6, 11, 12] },
  'Information Technology':      { baseLoad: 'heavy',    peakMonths: [5, 6, 11, 12] },
  'Biotechnology':               { baseLoad: 'light',    peakMonths: [4, 5, 11]     }
};

// ---------------------------------------------------------------------------
// Academic Calendar Phases
// Maps month ranges to semester phases for an Indian university calendar
// ---------------------------------------------------------------------------
const ACADEMIC_PHASES = [
  { months: [1],        phase: 'winter-break',               label: 'Winter Break' },
  { months: [2],        phase: 'start-of-semester',          label: 'Even Semester Start' },
  { months: [3],        phase: 'regular',                    label: 'Mid-Even Semester' },
  { months: [4],        phase: 'midterm',                    label: 'Even Semester Midterms' },
  { months: [5],        phase: 'end-of-semester',            label: 'Even Semester Finals / Exams' },
  { months: [6],        phase: 'end-of-semester/registration', label: 'Results & Odd Semester Registration' },
  { months: [7],        phase: 'start-of-semester',          label: 'Odd Semester Start' },
  { months: [8],        phase: 'regular',                    label: 'Mid-Odd Semester' },
  { months: [9],        phase: 'midterm',                    label: 'Odd Semester Midterms' },
  { months: [10],       phase: 'regular',                    label: 'Late Odd Semester' },
  { months: [11],       phase: 'end-of-semester',            label: 'Odd Semester Finals / Exams' },
  { months: [12],       phase: 'end-of-semester/registration', label: 'Results & Even Semester Registration' }
];

// ---------------------------------------------------------------------------
// Urgency Deadlines (synthetic — days of month for key deadlines)
// ---------------------------------------------------------------------------
const REGISTRATION_DEADLINES = {
  'end-of-semester/registration': 20,   // Registration closes by 20th of the month
  'end-of-semester': 25,                // Exam results expected by 25th
  'midterm': 15,                        // Midterm grades due by 15th
  'start-of-semester': 10,              // Add/drop deadline 10th
  'regular': 30,                        // No specific urgency
  'winter-break': 31                    // No urgency
};

// ---------------------------------------------------------------------------
// getSeasonalUrgency()
// Returns the current academic phase based on the current date.
// ---------------------------------------------------------------------------
function getSeasonalUrgency() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-indexed
  const day = now.getDate();

  // Find matching phase
  const phaseEntry = ACADEMIC_PHASES.find(p => p.months.includes(month));
  const phase = phaseEntry ? phaseEntry.phase : 'regular';
  const label = phaseEntry ? phaseEntry.label : 'Regular Academic Period';

  // Calculate urgency score based on proximity to phase deadline
  const deadline = REGISTRATION_DEADLINES[phase] || 30;
  const daysUntilDeadline = Math.max(0, deadline - day);
  const daysInPhase = deadline; // Simplified: phase "starts" at day 1

  // Urgency: 1.0 when at or past deadline, 0.0 when far from it
  let urgencyScore = 1.0 - (daysUntilDeadline / daysInPhase);
  urgencyScore = Math.max(0, Math.min(1, Number(urgencyScore.toFixed(2))));

  return {
    phase,
    label,
    month,
    day,
    urgencyScore,
    daysUntilDeadline,
    isHighUrgency: urgencyScore >= 0.7,
    timestamp: now.toISOString()
  };
}

// ---------------------------------------------------------------------------
// getDepartmentLoad(department)
// Returns the current load level for a department, accounting for peak months.
// ---------------------------------------------------------------------------
function getDepartmentLoad(department) {
  const now = new Date();
  const month = now.getMonth() + 1;

  const profile = departmentLoadProfiles[department];
  if (!profile) {
    return 'moderate'; // default for unknown departments
  }

  // Upgrade load during peak months
  if (profile.peakMonths.includes(month)) {
    if (profile.baseLoad === 'light') return 'moderate';
    if (profile.baseLoad === 'moderate') return 'heavy';
    return 'heavy'; // already heavy stays heavy
  }

  return profile.baseLoad;
}

// ---------------------------------------------------------------------------
// getRecommendedAction(phase, urgencyScore, departmentLoad, percentPaid)
// Produces a contextual action recommendation based on signals.
// ---------------------------------------------------------------------------
function getRecommendedAction(phase, urgencyScore, departmentLoad, percentPaid) {
  // High urgency during registration/finals → fast-track
  if (urgencyScore >= 0.8 && (phase.includes('registration') || phase.includes('end-of-semester'))) {
    if (percentPaid >= 100) {
      return 'FAST_TRACK: Registration deadline imminent. Prioritize immediate reactivation.';
    }
    if (percentPaid >= 80) {
      return 'EXPEDITE_ESCALATION: Near registration deadline. Escalate with urgency flag for rapid review.';
    }
    return 'FLAG_URGENT: Student may miss registration window. Flag for immediate human review.';
  }

  // Moderate urgency during midterms
  if (phase === 'midterm') {
    if (percentPaid >= 100) {
      return 'STANDARD: Midterm period. Process reactivation normally.';
    }
    return 'MONITOR: Midterm period. Process normally but track for follow-up.';
  }

  // Heavy department load → suggest batch processing
  if (departmentLoad === 'heavy') {
    return 'BATCH_ELIGIBLE: High department load. Can be queued for batch processing if not urgent.';
  }

  // Regular period
  if (percentPaid >= 100) {
    return 'STANDARD: No urgency. Process reactivation through standard pipeline.';
  }
  return 'STANDARD: Regular academic period. Process through normal escalation pipeline.';
}

// ---------------------------------------------------------------------------
// buildContextNarrative(studentId, phase, urgencyScore, departmentLoad, recommendedAction)
// Builds a human-readable narrative explaining the work context.
// ---------------------------------------------------------------------------
function buildContextNarrative(studentId, studentInfo, seasonal, departmentLoad, recommendedAction) {
  const semesterNum = parseInt((studentInfo.semester || '').replace(/\D/g, '')) || 0;
  const isSenior = semesterNum >= 6;
  const isNew = semesterNum <= 2;

  let narrative = `Student ${studentId} is in ${studentInfo.semester} of ${studentInfo.department}`;

  if (isSenior) {
    narrative += ' (final year — graduation-critical)';
  } else if (isNew) {
    narrative += ' (first year — retention-sensitive)';
  }

  narrative += `. The university is currently in the "${seasonal.label}" phase`;

  if (seasonal.isHighUrgency) {
    narrative += ` with HIGH urgency (${seasonal.daysUntilDeadline} days until deadline)`;
  } else {
    narrative += ` with moderate urgency`;
  }

  narrative += `. Department load is ${departmentLoad}.`;

  // Add recommended action context
  const actionType = recommendedAction.split(':')[0];
  if (actionType === 'FAST_TRACK') {
    narrative += ' ⚡ Recommended: fast-track processing due to imminent deadline.';
  } else if (actionType === 'EXPEDITE_ESCALATION') {
    narrative += ' 🔔 Recommended: expedite escalation — registration window closing.';
  } else if (actionType === 'FLAG_URGENT') {
    narrative += ' 🚨 Recommended: flag for urgent human review — student at risk of missing registration.';
  }

  return narrative;
}

// ---------------------------------------------------------------------------
// getWorkContext(studentId)
// Main function — returns full work/academic context signals for a student.
//
// Returns:
//   {
//     studentId,
//     academicPeriod,       // 'midterm' | 'finals' | 'registration' | 'regular' | etc.
//     urgencyScore,         // 0-1 based on proximity to deadlines
//     departmentLoad,       // 'heavy' | 'moderate' | 'light'
//     recommendedAction,    // contextual action recommendation string
//     contextNarrative,     // human-readable explanation
//     seasonalDetails,      // full seasonal urgency object
//     studentInfo           // department, semester, enrollmentYear
//   }
// ---------------------------------------------------------------------------
function getWorkContext(studentId, percentPaid = 100) {
  // Look up student info (fall back to generic if unknown)
  const studentInfo = studentDepartments[studentId] || {
    department: 'General Studies',
    semester: 'Unknown',
    enrollmentYear: 2024
  };

  // Get seasonal urgency
  const seasonal = getSeasonalUrgency();

  // Get department load
  const departmentLoad = getDepartmentLoad(studentInfo.department);

  // Determine an approximate payment percentage (synthetic signal)
  // In real usage, this would come from the pipeline; here we use a placeholder
  // percentPaid is now passed as an argument, defaulting to 100

  // Get recommended action
  const recommendedAction = getRecommendedAction(
    seasonal.phase,
    seasonal.urgencyScore,
    departmentLoad,
    percentPaid
  );

  // Build narrative
  const contextNarrative = buildContextNarrative(
    studentId,
    studentInfo,
    seasonal,
    departmentLoad,
    recommendedAction
  );

  return {
    studentId,
    academicPeriod: seasonal.phase,
    urgencyScore: seasonal.urgencyScore,
    departmentLoad,
    recommendedAction,
    contextNarrative,
    seasonalDetails: seasonal,
    studentInfo: {
      department: studentInfo.department,
      semester: studentInfo.semester,
      enrollmentYear: studentInfo.enrollmentYear
    }
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  getWorkContext,
  getSeasonalUrgency
};
