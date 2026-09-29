import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { logActivity } from './activityService';

const toIso = (timestamp) => {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate().toISOString();
  if (typeof timestamp === 'string') return timestamp;
  return new Date(timestamp).toISOString();
};

/**
 * Fetches calendar events: combines stored CalendarEvent documents with
 * derived read-only project and task dates. Excludes all QA items.
 */
export const getEvents = async (options = {}) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  const { projectId, start, end } = options;

  let accessibleProjects = [];
  if (projectId) {
    const projSnap = await getDoc(doc(db, 'projects', projectId));
    if (projSnap.exists()) {
      accessibleProjects.push({ id: projSnap.id, ...projSnap.data() });
    }
  } else {
    const projSnap = await getDocs(query(
      collection(db, 'projects'),
      where('memberUids', 'array-contains', currentUser.uid)
    ));
    accessibleProjects = projSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const accessibleProjectIds = accessibleProjects.map(p => p.id);

  // 1. Fetch stored calendar events
  const storedEvents = [];
  if (projectId) {
    const snap = await getDocs(query(
      collection(db, 'calendarEvents'),
      where('projectId', '==', projectId)
    ));
    snap.forEach(d => storedEvents.push({ id: d.id, ...d.data(), derived: false, readOnly: false }));
  } else {
    // Project events + Personal events created by user
    const personalSnap = await getDocs(query(
      collection(db, 'calendarEvents'),
      where('creatorId', '==', currentUser.uid)
    ));
    personalSnap.forEach(d => {
      storedEvents.push({ id: d.id, ...d.data(), derived: false, readOnly: false });
    });

    if (accessibleProjectIds.length > 0) {
      const chunks = [];
      for (let i = 0; i < accessibleProjectIds.length; i += 30) {
        chunks.push(accessibleProjectIds.slice(i, i + 30));
      }
      for (const chunk of chunks) {
        const snap = await getDocs(query(
          collection(db, 'calendarEvents'),
          where('projectId', 'in', chunk)
        ));
        snap.forEach(d => {
          if (!storedEvents.some(se => se.id === d.id)) {
            storedEvents.push({ id: d.id, ...d.data(), derived: false, readOnly: false });
          }
        });
      }
    }
  }

  // 2. Synthesize derived Project dates (Read-only)
  const derivedEvents = [];
  for (const proj of accessibleProjects) {
    if (proj.startDate) {
      const sDate = toIso(proj.startDate);
      derivedEvents.push({
        id: `derived-project-${proj.id}-start`,
        title: `${proj.name} — Start`,
        startDateTime: sDate,
        endDateTime: sDate,
        allDay: true,
        projectId: proj.id,
        project: { id: proj.id, name: proj.name },
        type: 'Project Start',
        derived: true,
        readOnly: true,
        sourceType: 'project',
        sourceId: proj.id
      });
    }
    if (proj.dueDate) {
      const dDate = toIso(proj.dueDate);
      derivedEvents.push({
        id: `derived-project-${proj.id}-due`,
        title: `${proj.name} — Deadline`,
        startDateTime: dDate,
        endDateTime: dDate,
        allDay: true,
        projectId: proj.id,
        project: { id: proj.id, name: proj.name },
        type: 'Project Deadline',
        derived: true,
        readOnly: true,
        sourceType: 'project',
        sourceId: proj.id
      });
    }
  }

  // 3. Synthesize derived Task dates (Read-only)
  if (accessibleProjectIds.length > 0) {
    const chunks = [];
    for (let i = 0; i < accessibleProjectIds.length; i += 30) {
      chunks.push(accessibleProjectIds.slice(i, i + 30));
    }
    for (const chunk of chunks) {
      const tasksSnap = await getDocs(query(
        collection(db, 'tasks'),
        where('projectId', 'in', chunk)
      ));
      tasksSnap.forEach(tDoc => {
        const task = tDoc.data();
        if (task.startDate) {
          const sDate = toIso(task.startDate);
          derivedEvents.push({
            id: `derived-task-${tDoc.id}-start`,
            title: `${task.title}`,
            startDateTime: sDate,
            endDateTime: sDate,
            allDay: true,
            projectId: task.projectId,
            project: task.project,
            type: 'Task Start',
            derived: true,
            readOnly: true,
            sourceType: 'task',
            sourceId: tDoc.id
          });
        }
        if (task.dueDate) {
          const dDate = toIso(task.dueDate);
          derivedEvents.push({
            id: `derived-task-${tDoc.id}-due`,
            title: `${task.title} — Due`,
            startDateTime: dDate,
            endDateTime: dDate,
            allDay: true,
            projectId: task.projectId,
            project: task.project,
            type: 'Task Due',
            derived: true,
            readOnly: true,
            sourceType: 'task',
            sourceId: tDoc.id
          });
        }
      });
    }
  }

  // Combine and format
  let allEvents = [
    ...storedEvents.map(e => ({
      ...e,
      startDateTime: toIso(e.startDateTime),
      endDateTime: toIso(e.endDateTime),
      createdAt: toIso(e.createdAt),
      updatedAt: toIso(e.updatedAt)
    })),
    ...derivedEvents
  ];

  // Filter by start/end if provided
  if (start || end) {
    const s = start ? new Date(start) : null;
    const e = end ? new Date(end) : null;
    allEvents = allEvents.filter(ev => {
      const evDate = new Date(ev.startDateTime);
      if (s && evDate < s) return false;
      if (e && evDate > e) return false;
      return true;
    });
  }

  allEvents.sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));
  return allEvents;
};

/**
 * Creates a stored CalendarEvent.
 */
export const createEvent = async ({ title, description, type, start, end, allDay, projectId, taskId, location }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');
  if (!title || !title.trim()) throw new Error('Title is required');

  const eventRef = doc(collection(db, 'calendarEvents'));
  const startDateTime = new Date(start);
  const endDateTime = new Date(end);

  let projectData = null;
  if (projectId) {
    const pSnap = await getDoc(doc(db, 'projects', projectId));
    if (pSnap.exists()) projectData = { id: projectId, name: pSnap.data().name };
  }

  let taskData = null;
  if (taskId) {
    const tSnap = await getDoc(doc(db, 'tasks', taskId));
    if (tSnap.exists()) taskData = { id: taskId, title: tSnap.data().title };
  }

  const eventData = {
    title: title.trim(),
    description: description?.trim() || null,
    type: type?.trim() || 'Meeting',
    startDateTime,
    endDateTime,
    allDay: Boolean(allDay),
    location: location?.trim() || null,
    projectId: projectId || null,
    taskId: taskId || null,
    project: projectData,
    task: taskData,
    creatorId: currentUser.uid,
    creator: { id: currentUser.uid, name: currentUser.displayName || 'User', email: currentUser.email },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(eventRef, eventData);

  await logActivity({
    action: 'Created',
    entityType: 'CalendarEvent',
    entityId: eventRef.id,
    projectId,
    metadata: { title: eventData.title }
  });

  return { id: eventRef.id, ...eventData, startDateTime: toIso(startDateTime), endDateTime: toIso(endDateTime) };
};

/**
 * Updates a stored CalendarEvent.
 */
export const updateEvent = async (eventId, updateFields) => {
  if (eventId.startsWith('derived-')) {
    throw new Error('Cannot modify derived calendar entries');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const eventRef = doc(db, 'calendarEvents', eventId);
  const snap = await getDoc(eventRef);
  if (!snap.exists()) throw new Error('Event not found');

  const updateData = { updatedAt: serverTimestamp() };
  if (updateFields.title !== undefined) updateData.title = updateFields.title.trim();
  if (updateFields.description !== undefined) updateData.description = updateFields.description?.trim() || null;
  if (updateFields.type !== undefined) updateData.type = updateFields.type.trim();
  if (updateFields.allDay !== undefined) updateData.allDay = Boolean(updateFields.allDay);
  if (updateFields.location !== undefined) updateData.location = updateFields.location?.trim() || null;
  if (updateFields.start !== undefined) updateData.startDateTime = new Date(updateFields.start);
  if (updateFields.end !== undefined) updateData.endDateTime = new Date(updateFields.end);

  if (updateFields.taskId !== undefined) {
    updateData.taskId = updateFields.taskId || null;
    if (updateFields.taskId) {
      const tSnap = await getDoc(doc(db, 'tasks', updateFields.taskId));
      if (tSnap.exists()) updateData.task = { id: tSnap.id, title: tSnap.data().title };
    } else {
      updateData.task = null;
    }
  }

  await updateDoc(eventRef, updateData);

  await logActivity({
    action: 'Updated',
    entityType: 'CalendarEvent',
    entityId: eventId,
    projectId: snap.data().projectId,
    metadata: { title: updateData.title || snap.data().title }
  });

  return { id: eventId, ...snap.data(), ...updateData };
};

/**
 * Deletes a stored CalendarEvent.
 */
export const deleteEvent = async (eventId) => {
  if (eventId.startsWith('derived-')) {
    throw new Error('Cannot delete derived calendar entries');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const eventRef = doc(db, 'calendarEvents', eventId);
  const snap = await getDoc(eventRef);
  if (!snap.exists()) throw new Error('Event not found');
  const data = snap.data();

  await deleteDoc(eventRef);

  await logActivity({
    action: 'Deleted',
    entityType: 'CalendarEvent',
    entityId: eventId,
    projectId: data.projectId,
    metadata: { title: data.title }
  });

  return { success: true };
};
