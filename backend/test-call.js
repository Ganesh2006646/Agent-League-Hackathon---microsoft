require('dotenv').config();
const prompts = require('./agent-prompts');
const fetch = require('node-fetch'); // wait, does it use node-fetch or native fetch?
// node 18+ has native fetch. Let's see if we can use native fetch or what.
const { runAgentPipeline } = require('./foundry-agents');

async function test() {
  console.log("Starting direct call test...");
  try {
    const db = {
      users: {
        "S10001": {
          "id": "S10001",
          "displayName": "Aarav Sharma",
          "userPrincipalName": "aarav.sharma@rit.edu",
          "accountEnabled": false
        }
      },
      finance: {
        "S10001": [
          {
            "ReceiptNumber": "REC-2026-1001",
            "AmountPaid": 12000,
            "AmountDue": 12000,
            "Date": "2026-06-10"
          }
        ]
      },
      holds: {
        "S10001": []
      }
    };
    console.log("Calling runAgentPipeline...");
    const result = await runAgentPipeline("S10001", "REC-2026-1001", "Ganesh", db, false);
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Error in test:", err);
  }
}

test();
