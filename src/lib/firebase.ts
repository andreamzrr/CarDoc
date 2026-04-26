import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const isPlaceholderConfig = !firebaseConfig.projectId || firebaseConfig.projectId === 'remixed-project-id';

let app;
let db: any;
let auth: any;

if (!isPlaceholderConfig) {
  app = initializeApp(firebaseConfig);
  // Enable long polling to avoid connection issues in some environments
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  }, firebaseConfig.firestoreDatabaseId);
  auth = getAuth(app);
} else {
  // Mock objects for localized mode
  console.warn("Using LocalStorage fallback - Firebase not configured.");
  db = {}; 
  let mockUser = null;
  try {
    const saved = localStorage.getItem('cardoc_mock_user');
    if (saved) mockUser = JSON.parse(saved);
  } catch (e) {
    console.error("Failed to parse mock user", e);
  }
  auth = { currentUser: mockUser }; 
}

export { db, auth };
export const googleProvider = new GoogleAuthProvider();
export const IS_FIREBASE_REAL = !isPlaceholderConfig;

// Error Handling
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
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
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Utility for auth
export const signInWithGoogle = async () => {
  if (!IS_FIREBASE_REAL) {
    const mockUser = {
      uid: 'mock-user-123',
      email: 'demo@example.com',
      displayName: 'Demo Driver',
      photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Lucky'
    };
    localStorage.setItem('cardoc_mock_user', JSON.stringify(mockUser));
    window.location.reload(); // Refresh to trigger hook
    return mockUser;
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Auth Error:", error);
    return null;
  }
};

export const logout = () => {
  if (!IS_FIREBASE_REAL) {
    localStorage.removeItem('cardoc_mock_user');
    window.location.reload();
    return;
  }
  signOut(auth);
};

// Connection test as required
async function testConnection() {
  if (!IS_FIREBASE_REAL) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
