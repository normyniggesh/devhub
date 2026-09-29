import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit, 
  getDocs, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

/**
 * Creates an audit log entry in Firestore.
 */
export const logActivity = async ({ action, entityType, entityId, projectId, metadata, user }) => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;

    const auditData = {
      userId: currentUser.uid,
      action,
      entityType,
      entityId,
      projectId: projectId || null,
      metadata: metadata || null,
      createdAt: serverTimestamp(),
      user: {
        id: currentUser.uid,
        name: user?.name || currentUser.displayName || 'User',
        avatarUrl: user?.avatarUrl || currentUser.photoURL || null
      }
    };

    const docRef = await addDoc(collection(db, 'auditLogs'), auditData);
    return { id: docRef.id, ...auditData };
  } catch (error) {
    console.error('Failed to log activity:', error);
    return null;
  }
};

/**
 * Fetches activity logs matching the requested filters.
 */
export const fetchActivity = async (options = {}) => {
  try {
    const { entityType, entityId, projectId, userId, limit = 50 } = options;
    const currentUser = auth.currentUser;

    let q = collection(db, 'auditLogs');
    const constraints = [];

    if (projectId) {
      constraints.push(where('projectId', '==', projectId));
    } else if (userId) {
      constraints.push(where('userId', '==', userId));
    } else if (currentUser) {
      constraints.push(where('userId', '==', currentUser.uid));
    }

    if (entityType) {
      constraints.push(where('entityType', '==', entityType));
    }

    if (entityId) {
      constraints.push(where('entityId', '==', entityId));
    }

    constraints.push(orderBy('createdAt', 'desc'));
    constraints.push(firestoreLimit(limit));

    const queryRef = query(q, ...constraints);
    const snap = await getDocs(queryRef);

    return snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString())
      };
    });
  } catch (error) {
    console.error('Failed to fetch activity:', error);
    return [];
  }
};
