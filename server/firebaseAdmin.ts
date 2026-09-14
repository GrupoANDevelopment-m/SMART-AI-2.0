import { initializeApp } from 'firebase/app';
import { getFirestore, setLogLevel } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Suppress Firestore verbose warnings/errors like "Disconnecting idle stream"
setLogLevel('silent');

let firebaseConfig: any = null;
try {
  const configPath = path.join(rootDir, 'firebase-applet-config.json');
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.log('No firebase-applet-config.json found or failed to parse.');
}

let db: any = null;

if (firebaseConfig) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    console.log('Firebase Client initialized successfully for backend sync.');
  } catch (error) {
    console.error('Error initializing Firebase Client in backend:', error);
  }
}

export const adminDb = db; // Still export as "adminDb" to limit refactoring in db.ts

