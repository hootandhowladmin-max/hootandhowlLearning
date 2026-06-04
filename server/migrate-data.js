const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load service account and config
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

const db = admin.firestore();
const allowedBranches = ['branch1', 'branch2'];
const collectionTypes = ['students', 'invoices', 'attendance'];

async function migrateBranchData() {
  console.log('Starting Firestore data migration...\n');

  for (const branch of allowedBranches) {
    console.log(`=== Migrating ${branch} ===`);

    for (const type of collectionTypes) {
      const oldCollectionName = `${branch}_${type}`;
      const newSubcollectionPath = `${branch}/data/${type}`;

      console.log(`  - Migrating ${type} from ${oldCollectionName} to ${newSubcollectionPath}`);

      try {
        // Get all documents from old collection
        const querySnapshot = await db.collection(oldCollectionName).get();
        
        if (querySnapshot.empty) {
          console.log(`    - No documents found in ${oldCollectionName}`);
          continue;
        }

        let count = 0;
        // Copy each document to new subcollection
        const batch = db.batch();
        querySnapshot.forEach((doc) => {
          const newDocRef = db.collection(newSubcollectionPath).doc(doc.id);
          batch.set(newDocRef, doc.data());
          count++;
        });

        // Commit batch
        await batch.commit();
        console.log(`    - Successfully migrated ${count} documents`);

        // Delete old collections after successful migration
        console.log(`    - Deleting old collection ${oldCollectionName}...`);
        for (const doc of querySnapshot.docs) {
          await doc.ref.delete();
        }
        console.log(`    - Old collection ${oldCollectionName} deleted`);

      } catch (error) {
        console.error(`    - Error migrating ${type} for ${branch}:`, error.message);
      }
    }
  }

  console.log('\nMigration complete!');
}

migrateBranchData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });