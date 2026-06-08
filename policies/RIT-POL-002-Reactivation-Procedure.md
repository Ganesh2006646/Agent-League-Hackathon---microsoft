# RIT-POL-002: Student Account Reactivation Standard Operating Procedure
**Redmond Institute of Technology (RIT) — Division of Information Technology**

## §1. Overview
This standard operating procedure (SOP) outlines the lifecycle of student IT account reactivations after a Financial Hold has been addressed. This procedure ensures a secure, auditable, and timely restoration of M365 and local academic services.

## §2. Eligibility Criteria for Reactivation
An account is eligible for reactivation only when one of the following conditions is verified:
1. **Full Balance Resolution**: The Finance Ledger reflects an outstanding balance under $500.00 USD.
2. **Approved Installment Plan**: The Office of Student Finance has approved a payment arrangement, and the initial payment has cleared.
3. **Hardship Exemption**: The student has been granted an emergency temporary extension by the Dean of Students.

## §3. Step-by-Step Reactivation Workflow
The reactivation pipeline follows a strict **Collect-Verify-Authorize-Execute-Audit** sequence:

### Step 3.1: Data Intake (Collect)
The Front Desk agent receives the reactivation request. The agent must collect:
- Student's Full Legal Name
- Student ID Number (e.g., S12345)
- Bank-cleared payment receipt number or digital receipt copy (PDF or image).

### Step 3.2: Financial Verification (Verify)
The Front Desk agent or automated agent queries the RIT Finance Ledger via SharePoint to verify:
- The receipt number is authentic and has not been used for another request.
- The amount paid aligns with the ledger requirement.
- The payment status is set to "Verified" or "Cleared".

### Step 3.3: Administrative Hold Clearance Check (Verify)
The system checks the **RIT Hold Registry** to ensure no other non-financial holds (e.g., Academic Integrity, Disciplinary Investigation) exist on the student's record.

### Step 3.4: IT Authorization and Approval (Authorize)
- **Standard Requests**: If the payment is cleared and no other holds exist, the request is routed for IT Lead authorization.
- **Flagged Requests**: If there is a minor academic hold, a partial payment scenario, or a payment plan exception, the request must be escalated to the IT Lead with a detailed justification trace.
- **HITL Integration**: An Adaptive Card is generated and sent to the private `RIT-IT-Approvals` Teams channel. The IT Lead must click "Approve" to authorize.

### Step 3.5: Provisioning Execution (Execute)
Once authorized:
- The agent calls the **Microsoft Graph API** to update the user object: `PATCH /users/{id} {"accountEnabled": true}`.
- The system calls the Canvas LMS API to restore course dashboard access.
- Restored services sync across campus library portals within 15 minutes of Graph API clearance.

### Step 3.6: Compliance Auditing (Audit)
- The agent creates a record in the **SharePoint Audit Log** documenting:
  - Timestamp of reactivation
  - Request ID (GUID)
  - Student ID
  - Approving IT Lead identity
  - Relevant RIT Policy citations (e.g., RIT-POL-001 §6.3)
- An automated confirmation email and Teams notification are sent to the student.

## §4. SLA Targets
- **Standard Automatic Sync**: Within 24 hours of payment clearance.
- **Teams Agent Manual Request**: < 5 minutes post-verification for standard requests.
- **Escalated Policy Exceptions**: < 2 hours during normal business hours (8:00 AM – 5:00 PM PT).
