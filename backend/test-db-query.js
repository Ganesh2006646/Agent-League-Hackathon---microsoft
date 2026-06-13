require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found in .env");
    return;
  }

  const client = new MongoClient(uri);
  try {
    console.log("🔌 Connecting to MongoDB Atlas...");
    await client.connect();
    console.log("✅ Connected!");

    const db = client.db('sutradhara');
    
    // List collections
    const collections = await db.listCollections().toArray();
    console.log("\n📦 Collections in 'sutradhara' database:");
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`  - ${col.name} (${count} documents)`);
    }

    // Query documents
    for (const col of collections) {
      console.log(`\n📄 Documents in collection '${col.name}':`);
      const docs = await db.collection(col.name).find({}).limit(10).toArray();
      if (docs.length === 0) {
        console.log("  (empty)");
      } else {
        console.log(JSON.stringify(docs, null, 2));
      }
    }

  } catch (err) {
    console.error("❌ Database query error:", err.message);
  } finally {
    await client.close();
  }
}

main();
