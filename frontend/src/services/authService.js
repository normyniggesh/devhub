import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

/**
 * Maps a Firebase user and Firestore profile to the DEVHUB user format.
 */
const formatUser = (firebaseUser, profileDoc = null) => {
  if (!firebaseUser) return null;
  const profile = profileDoc ? profileDoc.data() : {};
  return {
    id: firebaseUser.uid,
    name: profile.name || firebaseUser.displayName || 'User',
    email: firebaseUser.email,
    avatarUrl: profile.avatarUrl || firebaseUser.photoURL || null,
    role: profile.role || 'User',
    createdAt: profile.createdAt?.toDate ? profile.createdAt.toDate().toISOString() : profile.createdAt
  };
};

/**
 * Sign in using email and password.
 */
export const login = async (email, password) => {
  const normalizedEmail = email.toLowerCase().trim();
  const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  const userDocRef = doc(db, 'users', credential.user.uid);
  const userDoc = await getDoc(userDocRef);

  if (!userDoc.exists()) {
    // If user was imported without Firestore doc, initialize profile doc
    await setDoc(userDocRef, {
      uid: credential.user.uid,
      name: credential.user.displayName || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      emailLower: normalizedEmail,
      avatarUrl: credential.user.photoURL || null,
      role: 'User',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    const refreshed = await getDoc(userDocRef);
    return formatUser(credential.user, refreshed);
  }

  return formatUser(credential.user, userDoc);
};

/**
 * Register a new user with email and password.
 */
export const register = async (name, email, password) => {
  const normalizedEmail = email.toLowerCase().trim();
  const trimmedName = name.trim();

  const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
  
  if (trimmedName) {
    await updateProfile(credential.user, { displayName: trimmedName });
  }

  const userDocRef = doc(db, 'users', credential.user.uid);
  const profileData = {
    uid: credential.user.uid,
    name: trimmedName,
    email: normalizedEmail,
    emailLower: normalizedEmail,
    avatarUrl: null,
    role: 'User',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(userDocRef, profileData);
  const userDoc = await getDoc(userDocRef);
  return formatUser(credential.user, userDoc);
};

/**
 * Sign out the currently authenticated user.
 */
export const logout = async () => {
  await signOut(auth);
};

/**
 * Get current authenticated user profile.
 */
export const getCurrentUser = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
  return formatUser(currentUser, userDoc);
};

/**
 * Observes auth state changes and synchronizes the session.
 */
export const subscribeToAuth = (callback) => {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      callback(null);
      return;
    }

    try {
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        callback(formatUser(firebaseUser, userDoc));
      } else {
        const fallback = formatUser(firebaseUser);
        callback(fallback);
      }
    } catch (err) {
      console.error('Error fetching user profile in auth listener:', err);
      callback(formatUser(firebaseUser));
    }
  });
};
