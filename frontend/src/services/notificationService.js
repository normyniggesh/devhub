import {
  collection,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

const toIso = (timestamp) => {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate().toISOString();
  if (typeof timestamp === 'string') return timestamp;
  return new Date(timestamp).toISOString();
};

/**
 * Fetches notifications for the current user.
 */
export const getNotifications = async (limitCount = 50) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', currentUser.uid),
    orderBy('createdAt', 'desc'),
    firestoreLimit(limitCount)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    createdAt: toIso(d.data().createdAt)
  }));
};

/**
 * Marks a notification as read.
 */
export const markAsRead = async (notificationId) => {
  const notifRef = doc(db, 'notifications', notificationId);
  await updateDoc(notifRef, { read: true });
  return { success: true };
};

/**
 * Marks all notifications for current user as read.
 */
export const markAllAsRead = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) return { success: false };

  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', currentUser.uid),
    where('read', '==', false)
  );

  const snap = await getDocs(q);
  if (snap.empty) return { success: true };

  const batch = writeBatch(db);
  snap.docs.forEach(d => {
    batch.update(d.ref, { read: true });
  });

  await batch.commit();
  return { success: true };
};

/**
 * Deletes a notification.
 */
export const deleteNotification = async (notificationId) => {
  const notifRef = doc(db, 'notifications', notificationId);
  await deleteDoc(notifRef);
  return { success: true };
};
