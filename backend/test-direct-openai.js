require('dotenv').config();

async function test() {
  const endpoint = process.env.AZURE_AI_MODEL_ENDPOINT;
  const key = process.env.AZURE_AI_MODEL_KEY;
  const deploymentName = process.env.AZURE_AI_DEPLOYMENT_NAME || 'gpt-4o-mini';

  console.log("Endpoint:", endpoint);
  console.log("Key prefix:", key ? key.substring(0, 5) : "undefined");
  console.log("Deployment:", deploymentName);

  const cleanBase = endpoint.replace(/\/+$/, "");
  const apiVersion = '2025-01-01-preview';
  const targetUrl = `${cleanBase}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;

  console.log("Target URL:", targetUrl);
  console.log("Sending request...");

  const startTime = Date.now();
  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": key
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are a helpful assistant. Reply with only one word: hello." },
          { role: "user", content: "hi" }
        ],
        temperature: 0.1,
        max_tokens: 50
      })
    });

    console.log("Response Status:", response.status);
    console.log("Response OK:", response.ok);
    console.log("Response Headers:");
    for (const [k, v] of response.headers.entries()) {
      console.log(`  ${k}: ${v}`);
    }

    const text = await response.text();
    console.log("Response Body:", text);
  } catch (err) {
    console.error("Fetch Error:", err);
  } finally {
    console.log(`Time taken: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
  }
}

test();
