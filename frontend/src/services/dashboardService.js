import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

const toIso = (timestamp) => {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate().toISOString();
  if (typeof timestamp === 'string') return timestamp;
  return new Date(timestamp).toISOString();
};

/**
 * Aggregates dashboard metrics directly from Firestore.
 */
export const getDashboard = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const userId = currentUser.uid;

  // 1. Fetch user projects
  const projectsSnap = await getDocs(query(
    collection(db, 'projects'),
    where('memberUids', 'array-contains', userId)
  ));

  const projects = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const projectIds = projects.map(p => p.id);

  if (projectIds.length === 0) {
    return {
      totalProjects: 0,
      totalTasks: 0,
      dueToday: 0,
      inProgressTasks: 0,
      completedTasks: 0,
      toDoTasks: 0,
      projectOverview: [],
      qaStatus: { Passed: 0, Failed: 0, Blocked: 0, Skipped: 0, OpenBugs: 0 },
      recentActivity: []
    };
  }

  // 2. Fetch tasks across projects (in chunks if needed)
  const chunks = [];
  for (let i = 0; i < projectIds.length; i += 30) {
    chunks.push(projectIds.slice(i, i + 30));
  }

  const allTasks = [];
  for (const chunk of chunks) {
    const tasksSnap = await getDocs(query(
      collection(db, 'tasks'),
      where('projectId', 'in', chunk)
    ));
    tasksSnap.forEach(d => allTasks.push({ id: d.id, ...d.data() }));
  }

  // Date boundaries
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  let inProgressTasks = 0;
  let completedTasks = 0;
  let dueToday = 0;

  allTasks.forEach(task => {
    const status = task.status;
    const isDone = status === 'Done' || status === 'Completed';
    if (isDone) completedTasks++;
    else if (status === 'In Progress') inProgressTasks++;

    if (!isDone && task.dueDate) {
      const d = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
      if (d >= startOfToday && d <= endOfToday) dueToday++;
    }
  });

  const totalTasks = allTasks.length;
  const toDoTasks = Math.max(0, totalTasks - inProgressTasks - completedTasks);

  // Project progress mapping
  const projectOverview = projects.map(p => {
    const pTasks = allTasks.filter(t => t.projectId === p.id);
    const total = pTasks.length;
    const done = pTasks.filter(t => t.status === 'Done' || t.status === 'Completed').length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    return {
      id: p.id,
      name: p.name,
      category: p.category || null,
      status: p.status || 'Active',
      priority: p.priority || 'Medium',
      dueDate: toIso(p.dueDate),
      progress
    };
  }).sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));

  // QA metrics
  let passed = 0;
  let failed = 0;
  let blocked = 0;
  let skipped = 0;
  let openBugs = 0;

  for (const chunk of chunks) {
    const [resSnap, bugsSnap] = await Promise.all([
      getDocs(query(collection(db, 'testResults'), where('projectId', 'in', chunk))),
      getDocs(query(collection(db, 'bugs'), where('projectId', 'in', chunk)))
    ]);

    resSnap.forEach(d => {
      const s = d.data().status;
      if (s === 'Passed') passed++;
      else if (s === 'Failed') failed++;
      else if (s === 'Blocked') blocked++;
      else if (s === 'Skipped') skipped++;
    });

    bugsSnap.forEach(d => {
      const s = d.data().status;
      if (!['Resolved', 'Closed', 'Done'].includes(s)) openBugs++;
    });
  }

  // Recent activity
  const actSnap = await getDocs(query(
    collection(db, 'auditLogs'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    firestoreLimit(10)
  ));

  const recentActivity = actSnap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: toIso(data.createdAt)
    };
  });

  return {
    totalProjects: projects.length,
    totalTasks,
    dueToday,
    inProgressTasks,
    completedTasks,
    toDoTasks,
    projectOverview,
    qaStatus: { Passed: passed, Failed: failed, Blocked: blocked, Skipped: skipped, OpenBugs: openBugs },
    recentActivity
  };
};

/**
 * Aggregates My Day items directly from Firestore.
 */
export const getMyDay = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Unauthenticated');

  const userId = currentUser.uid;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const upcomingLimit = new Date(endOfToday);
  upcomingLimit.setDate(upcomingLimit.getDate() + 7);

  // 1. Fetch user's assigned tasks
  const tasksSnap = await getDocs(query(
    collection(db, 'tasks'),
    where('assigneeId', '==', userId)
  ));

  const todayTasks = [];
  const overdueTasks = [];
  const completedTasks = [];
  const upcomingTasks = [];

  tasksSnap.forEach(docSnap => {
    const task = { id: docSnap.id, ...docSnap.data() };
    const isDone = task.status === 'Done' || task.status === 'Completed';

    const dueDate = task.dueDate ? (task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate)) : null;
    const startDate = task.startDate ? (task.startDate.toDate ? task.startDate.toDate() : new Date(task.startDate)) : null;
    const completedAt = task.completedAt ? (task.completedAt.toDate ? task.completedAt.toDate() : new Date(task.completedAt)) : null;

    if (!isDone) {
      if (dueDate && dueDate < startOfToday) {
        overdueTasks.push({
          ...task,
          dueDate: toIso(dueDate),
          startDate: toIso(startDate)
        });
      } else if ((dueDate && dueDate >= startOfToday && dueDate <= endOfToday) ||
                 (startDate && startDate >= startOfToday && startDate <= endOfToday)) {
        todayTasks.push({
          ...task,
          dueDate: toIso(dueDate),
          startDate: toIso(startDate)
        });
      } else if (dueDate && dueDate > endOfToday && dueDate <= upcomingLimit) {
        upcomingTasks.push({
          id: task.id,
          type: 'Task',
          title: task.title,
          date: toIso(dueDate),
          projectName: task.project?.name
        });
      }
    } else {
      if (completedAt && completedAt >= startOfToday) {
        completedTasks.push({
          ...task,
          completedAt: toIso(completedAt)
        });
      }
    }
  });

  // 2. Fetch today's calendar events
  const eventsSnap = await getDocs(query(
    collection(db, 'calendarEvents'),
    where('creatorId', '==', userId)
  ));

  const todayEvents = [];
  const upcomingEvents = [];

  eventsSnap.forEach(d => {
    const ev = { id: d.id, ...d.data() };
    const sDate = ev.startDateTime ? (ev.startDateTime.toDate ? ev.startDateTime.toDate() : new Date(ev.startDateTime)) : null;
    const eDate = ev.endDateTime ? (ev.endDateTime.toDate ? ev.endDateTime.toDate() : new Date(ev.endDateTime)) : null;

    if (sDate && eDate && sDate <= endOfToday && eDate >= startOfToday) {
      todayEvents.push({
        ...ev,
        startDateTime: toIso(sDate),
        endDateTime: toIso(eDate)
      });
    }

    if (ev.type === 'Deadline' && eDate && eDate > endOfToday && eDate <= upcomingLimit) {
      upcomingEvents.push({
        id: ev.id,
        type: 'Event',
        title: ev.title,
        date: toIso(eDate),
        projectName: ev.project?.name
      });
    }
  });

  // 3. Fetch upcoming milestones
  const milestonesSnap = await getDocs(collection(db, 'milestones'));
  const upcomingMilestones = [];

  milestonesSnap.forEach(d => {
    const m = { id: d.id, ...d.data() };
    if (!['Completed', 'Done'].includes(m.status) && m.dueDate) {
      const dDate = m.dueDate.toDate ? m.dueDate.toDate() : new Date(m.dueDate);
      if (dDate > endOfToday && dDate <= upcomingLimit) {
        upcomingMilestones.push({
          id: m.id,
          type: 'Milestone',
          title: m.title,
          date: toIso(dDate),
          projectName: m.project?.name
        });
      }
    }
  });

  // 4. Fetch open bugs assigned to current user
  const bugsSnap = await getDocs(query(
    collection(db, 'bugs'),
    where('assigneeId', '==', userId)
  ));

  const openBugs = [];
  bugsSnap.forEach(d => {
    const b = { id: d.id, ...d.data() };
    if (!['Resolved', 'Closed', 'Done'].includes(b.status)) {
      openBugs.push({
        ...b,
        createdAt: toIso(b.createdAt)
      });
    }
  });

  // Combine upcoming deadlines
  const upcomingDeadlines = [
    ...upcomingTasks,
    ...upcomingMilestones,
    ...upcomingEvents
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    todayTasks,
    overdueTasks,
    completedTasks,
    todayEvents,
    upcomingDeadlines,
    qaItems: {
      openBugs
    }
  };
};
