import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import defaultFirebaseConfig from '../firebase-applet-config.json';

// Support both dynamically injected environment variables and fallback file
const metaEnv = (import.meta as any).env || {};
const firebaseConfig = {
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || defaultFirebaseConfig.projectId,
  appId: metaEnv.VITE_FIREBASE_APP_ID || defaultFirebaseConfig.appId,
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || defaultFirebaseConfig.apiKey,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || defaultFirebaseConfig.authDomain,
  firestoreDatabaseId: metaEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID || defaultFirebaseConfig.firestoreDatabaseId,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || defaultFirebaseConfig.storageBucket,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultFirebaseConfig.messagingSenderId,
};

// Check if any firebaseConfig property is undefined or empty
console.log("=== Firebase Environment Variables Diagnostic ===");
console.log("VITE_FIREBASE_PROJECT_ID:", metaEnv.VITE_FIREBASE_PROJECT_ID || "None (Falling back)");
console.log("VITE_FIREBASE_API_KEY:", metaEnv.VITE_FIREBASE_API_KEY ? "Loaded (Length: " + metaEnv.VITE_FIREBASE_API_KEY.length + ")" : "None (Falling back)");
if (firebaseConfig.apiKey) {
  if (firebaseConfig.apiKey.startsWith("AIzaSy")) {
    console.log("apiKey status: Valid prefix verification (Starts with AIzaSy)");
  } else {
    console.warn("apiKey WARNING: apiKey 보통 AIzaSy로 시작해야 합니다. 현재 설정값을 확인해 주세요.");
  }
} else {
  console.error("apiKey ERROR: Firebase apiKey가 정의되지 않았거나 비어 있습니다.");
}

Object.entries(firebaseConfig).forEach(([key, val]) => {
  if (!val) {
    console.warn(`[Firebase Config Check] ${key} is empty or undefined.`);
  }
});
console.log("=================================================");

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Actual project mapping diagnostics
console.log("=== Firebase Engine Project Diagnostics ===");
console.log("app.options.projectId:", app.options.projectId);
console.log("db.app.options.projectId:", db.app?.options?.projectId);
console.log("auth.currentUser?.uid:", auth.currentUser?.uid || "None");
console.log("===========================================");

// No-op test connection (removed to avoid throwing security rule permission errors in console)

// Error handling matching FirestoreErrorInfo specification
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
