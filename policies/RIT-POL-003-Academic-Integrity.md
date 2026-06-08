# RIT-POL-003: Academic Integrity and Disciplinary Holds Policy
**Redmond Institute of Technology (RIT) — Office of the Dean of Students**

## §1. Policy Background
Redmond Institute of Technology (RIT) maintains a strict Academic Code of Conduct. Administrative blocks and holds may be placed on student accounts due to academic dishonesty, behavioral infractions, or active security investigations. This policy governs how these holds interact with IT service access and financial clearance.

## §2. Classifications of Non-Financial Holds
1. **Academic Advising Hold**: Placed to require academic advising before registration. This does **not** restrict active term IT access or email.
2. **Academic Integrity Hold (Sanction)**: Placed when a student is found responsible for academic dishonesty (e.g., plagiarism, cheating) and is serving a suspension or suspension of privileges.
3. **Disciplinary Investigation Hold**: Placed when a student is under active investigation for a code of conduct violation.
4. **Administrative Compliance Hold**: Placed for missing mandatory records (e.g., vaccination records, final admissions transcripts).

## §3. Priority and Conflict Resolution Matrix
When a student has paid their outstanding tuition, but has one or more active holds in the **RIT Hold Registry**, the following conflict resolution rules apply:

| Primary Hold | Co-existing Hold | Status | Policy Decision & Justification |
|--------------|------------------|--------|---------------------------------|
| Financial    | None             | Active | Eligible for full reactivation upon payment. |
| Financial    | Advising Hold    | Active | **Approve**. Advising holds only block registration, not IT access. |
| Financial    | Integrity Hold   | Expired| **Approve**. If the expiry date of the integrity hold is in the past, it is inactive. Reactivate and flag for registry cleanup. |
| Financial    | Integrity Hold   | Active | **DENY**. Active academic sanctions take precedence over financial clearance. Account remains blocked. |
| Financial    | Investigation Hold| Active | **DENY**. Active security or disciplinary investigations override all reactivations. Blocked until cleared by the Dean. |
| Financial    | Compliance Hold  | Active | **Approve with Warning**. Reactivate account, but notify student they have 7 days to submit missing records. |

## §4. Validation of Hold Expiry Dates
4.1. The RIT Hold Registry contains an `ExpiryDate` column.
4.2. During reactivation processing, the system must perform a dynamic date comparison: `Today's Date` vs. `ExpiryDate`.
4.3. If `Today's Date` is greater than `ExpiryDate` (i.e. the hold has expired), the system must treat the hold as inactive and proceed, preventing students from being locked out due to administrative delays in manually clearing expired records.

## §5. Appeal of Disciplinary Blocks
Students who are blocked from IT access due to active disciplinary or integrity holds cannot be reactivated by IT or Front Desk personnel. They must file a formal appeal with the Office of the Dean of Students. The agent must provide the student with the official appeal form link and escalate the case to the Dean's office inbox.
