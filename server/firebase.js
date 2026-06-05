const path = require('path');
const admin = require('firebase-admin');
require('dotenv').config({ path: path.join(__dirname, '.env') });

let db = null;
let auth = null;
let FIREBASE_READY = false;

try {
  // Use environment variables for Firebase config (for Render)
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    
    // Fix the private key format - handle both literal \n and actual newlines
    privateKey = privateKey.replace(/\\n/g, '\n');
    
    // Also ensure it starts with -----BEGIN PRIVATE KEY----- and ends with -----END PRIVATE KEY-----
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      privateKey = '-----BEGIN PRIVATE KEY-----\n' + privateKey + '\n-----END PRIVATE KEY-----';
    }
    
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: privateKey,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
    };
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
    db = admin.firestore();
    auth = admin.auth();
    FIREBASE_READY = true;
    console.log('[Firebase] Admin initialized successfully from env vars');
  } else {
    console.warn('[Firebase] Firebase env vars not set. Firebase features will be disabled until provided.');
  }
} catch (error) {
  console.error('[Firebase] Initialization error:', error.message);
  console.error('[Firebase] Full error:', error);
  FIREBASE_READY = false;
}

module.exports = {
  admin,
  db,
  auth,
  FIREBASE_READY
};
