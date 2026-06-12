require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function run() {
  const endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT;
  const key = process.env.AZURE_AI_SEARCH_KEY;
  const indexName = process.env.AZURE_AI_SEARCH_INDEX || 'rit-policies-index';

  if (!endpoint || !key || endpoint.includes('<') || key.includes('<')) {
    console.error("❌ Error: AZURE_AI_SEARCH_ENDPOINT and AZURE_AI_SEARCH_KEY must be set in your .env file.");
    process.exit(1);
  }

  const cleanEndpoint = endpoint.replace(/\/+$/, "");

  console.log(`📡 Connecting to Azure AI Search at: ${cleanEndpoint}`);
  console.log(`📂 Preparing to index files for index: "${indexName}"...`);

  // 1. Read local policies
  const policiesDir = path.join(__dirname, '../policies');
  if (!fs.existsSync(policiesDir)) {
    console.error("❌ Error: policies folder not found.");
    process.exit(1);
  }

  const files = fs.readdirSync(policiesDir).filter(f => f.endsWith('.md'));
  if (files.length === 0) {
    console.error("❌ Error: No .md policy files found in policies folder.");
    process.exit(1);
  }

  const documents = [];
  files.forEach((file, index) => {
    const filePath = path.join(policiesDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Create a safe key
    const docId = `doc_${index + 1}`;
    
    documents.push({
      "@search.action": "upload",
      "id": docId,
      "title": file.replace('.md', '').replace(/-/g, ' '),
      "content": content,
      "filepath": file
    });
  });

  // 2. Create the index
  console.log(`🛠️ Creating search index "${indexName}" if it doesn't exist...`);
  const createIndexUrl = `${cleanEndpoint}/indexes/${indexName}?api-version=2024-07-01`;
  
  const indexSchema = {
    name: indexName,
    fields: [
      { name: "id", type: "Edm.String", key: true, searchable: false },
      { name: "title", type: "Edm.String", searchable: true, filterable: false, sortable: false, facetable: false },
      { name: "content", type: "Edm.String", searchable: true, filterable: false, sortable: false, facetable: false },
      { name: "filepath", type: "Edm.String", searchable: true, filterable: true, sortable: false, facetable: false }
    ]
  };

  try {
    const createResp = await fetch(createIndexUrl, {
      method: "PUT", // PUT creates or updates index
      headers: {
        "Content-Type": "application/json",
        "api-key": key
      },
      body: JSON.stringify(indexSchema)
    });

    if (createResp.ok) {
      console.log(`✅ Index "${indexName}" created or updated successfully.`);
    } else {
      const errText = await createResp.text();
      console.error(`❌ Failed to create index. Status ${createResp.status}:`, errText);
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ Network error creating index:", err.message);
    process.exit(1);
  }

  // 3. Upload documents
  console.log(`📤 Uploading ${documents.length} policy documents to index...`);
  const uploadUrl = `${cleanEndpoint}/indexes/${indexName}/docs/index?api-version=2024-07-01`;

  try {
    const uploadResp = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": key
      },
      body: JSON.stringify({ value: documents })
    });

    if (uploadResp.ok) {
      const result = await uploadResp.json();
      console.log(`✅ Successfully uploaded and indexed all policy files!`);
      console.log(JSON.stringify(result, null, 2));
    } else {
      const errText = await uploadResp.text();
      console.error(`❌ Document upload failed. Status ${uploadResp.status}:`, errText);
    }
  } catch (err) {
    console.error("❌ Network error uploading documents:", err.message);
  }
}

run();
