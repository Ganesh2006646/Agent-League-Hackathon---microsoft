# RIT-POL-004: IT Account Security, Audit, and Compliance Policy
**Redmond Institute of Technology (RIT) — Department of Information Security & Compliance**

## §1. Objective and Compliance Framework
This policy defines security requirements, audit procedures, and compliance standards for the lifecycle management of student accounts. It aligns with the Family Educational Rights and Privacy Act (FERPA) and the Gramm-Leach-Bliley Act (GLBA) regarding the protection of financial and academic records.

## §2. Non-Repudiation and Audit Logging Standards
2.1. Every student account status change (reactivation, suspension, temporary access) must be documented in a central, tamper-proof audit repository (the **RIT SharePoint Audit Log**).
2.2. The following metadata must be logged for every transaction:
- **Transaction ID**: Unique identifier (GUID) generated at initiation.
- **StudentID**: The unique student identifier.
- **Actor ID**: The email/ID of the staff member or agent initiating the request.
- **Authorizer ID**: The email/ID of the IT Lead approving the transaction.
- **Justification**: A text string detailing the policy rules checked (e.g., RIT-POL-001 §6.3 check passed).
- **Graph Response Status**: The API callback response payload (success/failure).
- **Timestamp**: Exact UTC date and time of execution.
2.3. Direct modification of the SharePoint Audit Log is restricted. Only the system service principal may append records. Manual edits or deletions are strictly prohibited.

## §3. Role-Based Access Control (RBAC)
Access to student lifecycle management tools is restricted based on operational roles:
- **Front Desk Agent**: Read-only access to Finance Ledger and Hold Registry; authorization to initiate reactivation requests.
- **IT Approver (IT Lead)**: Read-write access to account states; authorization to approve reactivation requests.
- **Auditor/Compliance Officer**: Read-only access to Audit Logs; authorization to generate monthly reports.
- **System Service Principal**: Read-write access across all lists and APIs.

## §4. Anomaly Detection and Security Rate-Limiting
4.1. The system monitors for suspicious activity patterns to prevent credential misuse and automated script attacks.
4.2. **Threshold Alert**: If more than **3 reactivation requests** are submitted from the same university department or system operator within a **10-minute window**, the system must:
- Generate an urgent Anomaly Alert Card.
- Send the alert to the Security Operations Center (SOC) Teams channel.
- Temporarily throttle manual requests from that operator until verified.

## §5. Retention and Review
Audit records must be retained for a minimum of **7 years** from the date of the transaction. The Compliance Officer must run monthly audits to reconcile all reactivations against corresponding cleared payments in the Finance Ledger.
