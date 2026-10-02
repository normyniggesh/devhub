const USE_LEGACY_BACKEND = import.meta.env.VITE_USE_LEGACY_BACKEND !== 'false';
const BASE_URL = (
  import.meta.env.VITE_API_URL ||
  'http://localhost:3001/api'
).replace(/\/$/, '');

/**
 * Legacy API client for Render / Express backend (retained for rollback / comparison).
 */
const legacyApiClient = async (endpoint, { body, ...customConfig } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  const httpMethod = customConfig.method || (body ? 'POST' : 'GET');
  
  const config = {
    ...customConfig,
    method: httpMethod,
    headers: {
      ...headers,
      ...customConfig.headers,
    },
    credentials: 'include',
  };

  if (body) {
    if (body instanceof FormData) {
      config.body = body;
      delete config.headers['Content-Type'];
    } else if (typeof body === 'string') {
      config.body = body;
    } else {
      config.body = JSON.stringify(body);
    }
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, config);
  } catch (error) {
    console.error('Network request failed:', error);
    throw new Error('Network error. Please try again.');
  }

  if (response.ok) {
    const data = await response.json();
    return data;
  }

  let errMessage = 'An error occurred';
  let errData = {};
  try {
    errData = await response.json();
    errMessage = errData.error || errData.message || errMessage;
  } catch (e) {}

  const error = new Error(errMessage);
  error.status = response.status;
  error.data = errData;
  throw error;
};

/**
 * Universal API Client: Dispatches requests directly to Firebase modular services,
 * fulfilling 100% of the DEVHUB API contracts with zero UI changes.
 */
export const apiClient = async (endpoint, { body, method, ...customConfig } = {}) => {
  if (
    USE_LEGACY_BACKEND ||
    endpoint.startsWith('/auth') ||
    endpoint.startsWith('/api/auth') ||
    endpoint.startsWith('/admin') ||
    endpoint.startsWith('/api/admin') ||
    endpoint.startsWith('/search') ||
    endpoint.startsWith('/api/search')
  ) {
    const opts = { body, ...customConfig };
    if (method) opts.method = method;
    return legacyApiClient(endpoint, opts);
  }

  // Lazy-load Firebase services only when legacy backend is explicitly disabled
  const [
    authService,
    projectService,
    taskService,
    fileService,
    calendarService,
    qaService,
    dashboardService,
    notificationService,
    activityService,
    githubService
  ] = await Promise.all([
    import('../services/authService'),
    import('../services/projectService'),
    import('../services/taskService'),
    import('../services/fileService'),
    import('../services/calendarService'),
    import('../services/qaService'),
    import('../services/dashboardService'),
    import('../services/notificationService'),
    import('../services/activityService'),
    import('../services/githubService')
  ]);

  // Parse path and query parameters
  const [pathname, search] = endpoint.split('?');
  const searchParams = new URLSearchParams(search || '');
  const query = Object.fromEntries(searchParams.entries());

  const httpMethod = (method || (body ? 'POST' : 'GET')).toUpperCase();
  const parsedBody = body instanceof FormData ? body : (typeof body === 'string' ? JSON.parse(body || '{}') : (body || {}));

  // Clean path: ensure starts with '/' and remove any leading '/api'
  const path = pathname.startsWith('/api') ? pathname.replace(/^\/api/, '') : pathname;

  try {
    // 1. Dashboard & My Day
    if (path === '/dashboard' && httpMethod === 'GET') {
      const dashboard = await dashboardService.getDashboard();
      return { success: true, dashboard };
    }
    if (path === '/my-day' && httpMethod === 'GET') {
      const myDay = await dashboardService.getMyDay();
      return { success: true, myDay };
    }

    // 2. Auth Endpoints
    if (path === '/auth/login' && httpMethod === 'POST') {
      const user = await authService.login(parsedBody.email, parsedBody.password);
      return { success: true, user };
    }
    if (path === '/auth/register' && httpMethod === 'POST') {
      const user = await authService.register(parsedBody.name, parsedBody.email, parsedBody.password);
      return { success: true, user };
    }
    if (path === '/auth/logout' && httpMethod === 'POST') {
      await authService.logout();
      return { success: true };
    }
    if (path === '/auth/me' && httpMethod === 'GET') {
      const user = await authService.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      return { success: true, user };
    }

    // 3. User Search
    if (path === '/users/search' && httpMethod === 'GET') {
      const users = await projectService.searchUsers(query.q || '');
      return { success: true, users };
    }

    // 4. Project Membership
    const memberMatch = path.match(/^\/projects\/([^\/]+)\/members(?:\/([^\/]+))?$/);
    if (memberMatch) {
      const [, projectId, memberUserId] = memberMatch;
      if (httpMethod === 'POST') {
        const member = await projectService.addProjectMember(projectId, parsedBody.userId, parsedBody.role);
        return { success: true, member };
      }
      if (httpMethod === 'DELETE' && memberUserId) {
        await projectService.removeProjectMember(projectId, memberUserId);
        return { success: true, message: 'Member removed successfully' };
      }
    }

    // 5. Projects
    if (path === '/projects') {
      if (httpMethod === 'GET') {
        const projects = await projectService.getProjects();
        return { success: true, projects };
      }
      if (httpMethod === 'POST') {
        const project = await projectService.createProject(parsedBody);
        return { success: true, project };
      }
    }

    const projectDetailMatch = path.match(/^\/projects\/([^\/]+)$/);
    if (projectDetailMatch) {
      const projectId = projectDetailMatch[1];
      if (httpMethod === 'GET') {
        const project = await projectService.getProjectById(projectId);
        return { success: true, project };
      }
      if (httpMethod === 'PATCH') {
        const project = await projectService.updateProject(projectId, parsedBody);
        return { success: true, project };
      }
      if (httpMethod === 'DELETE') {
        await projectService.deleteProject(projectId);
        return { success: true, message: 'Project deleted successfully' };
      }
    }

    // 6. Tasks
    if (path === '/tasks') {
      if (httpMethod === 'GET') {
        const tasks = await taskService.getTasks(query);
        return { success: true, tasks };
      }
      if (httpMethod === 'POST') {
        const task = await taskService.createTask(parsedBody);
        return { success: true, task };
      }
    }

    const taskDetailMatch = path.match(/^\/tasks\/([^\/]+)$/);
    if (taskDetailMatch) {
      const taskId = taskDetailMatch[1];
      if (httpMethod === 'GET') {
        const task = await taskService.getTaskById(taskId);
        return { success: true, task };
      }
      if (httpMethod === 'PATCH') {
        const task = await taskService.updateTask(taskId, parsedBody);
        return { success: true, task };
      }
      if (httpMethod === 'DELETE') {
        await taskService.deleteTask(taskId);
        return { success: true, message: 'Task deleted successfully' };
      }
    }

    // 7. Calendar Events
    if (path === '/calendar/events') {
      if (httpMethod === 'GET') {
        const events = await calendarService.getEvents(query);
        return { success: true, events };
      }
      if (httpMethod === 'POST') {
        const event = await calendarService.createEvent(parsedBody);
        return { success: true, event };
      }
    }

    const calendarDetailMatch = path.match(/^\/calendar\/events\/([^\/]+)$/);
    if (calendarDetailMatch) {
      const eventId = calendarDetailMatch[1];
      if (httpMethod === 'PATCH') {
        const event = await calendarService.updateEvent(eventId, parsedBody);
        return { success: true, event };
      }
      if (httpMethod === 'DELETE') {
        await calendarService.deleteEvent(eventId);
        return { success: true, message: 'Event deleted successfully' };
      }
    }

    // 8. Folders
    if (path === '/folders') {
      if (httpMethod === 'GET') {
        const folders = await fileService.getFolders(query.projectId, query.parentId);
        return { success: true, folders };
      }
      if (httpMethod === 'POST') {
        const folder = await fileService.createFolder(parsedBody);
        return { success: true, folder };
      }
    }

    const folderDetailMatch = path.match(/^\/folders\/([^\/]+)$/);
    if (folderDetailMatch) {
      const folderId = folderDetailMatch[1];
      if (httpMethod === 'PATCH') {
        const folder = await fileService.updateFolder(folderId, parsedBody);
        return { success: true, folder };
      }
      if (httpMethod === 'DELETE') {
        await fileService.deleteFolder(folderId);
        return { success: true, message: 'Folder deleted successfully' };
      }
    }

    // 9. Files
    if (path === '/files') {
      if (httpMethod === 'GET') {
        const files = await fileService.getFiles(query.projectId, query.folderId);
        return { success: true, files };
      }
    }

    if (path === '/files/upload' && httpMethod === 'POST') {
      let projectId, folderId, filesList = [];
      if (body instanceof FormData) {
        projectId = body.get('projectId');
        folderId = body.get('folderId');
        filesList = body.getAll('files');
      } else {
        projectId = parsedBody.projectId;
        folderId = parsedBody.folderId;
        filesList = parsedBody.files || [];
      }
      const files = await fileService.uploadFiles(projectId, folderId, filesList);
      return { success: true, files };
    }

    const fileDownloadMatch = path.match(/^\/files\/([^\/]+)\/download$/);
    if (fileDownloadMatch) {
      const fileId = fileDownloadMatch[1];
      const url = await fileService.downloadFile(fileId);
      return { success: true, url };
    }

    const fileDetailMatch = path.match(/^\/files\/([^\/]+)$/);
    if (fileDetailMatch) {
      const fileId = fileDetailMatch[1];
      if (httpMethod === 'PATCH') {
        const file = await fileService.updateFile(fileId, parsedBody);
        return { success: true, file };
      }
      if (httpMethod === 'DELETE') {
        await fileService.deleteFile(fileId);
        return { success: true, message: 'File deleted successfully' };
      }
    }

    // 10. QA Module (Summary, Test Cases, Runs, Results, Bugs)
    if (path === '/qa/summary' && httpMethod === 'GET') {
      const summary = await qaService.getSummary(query.projectId);
      return { success: true, summary };
    }

    if (path === '/test-cases') {
      if (httpMethod === 'GET') {
        const testCases = await qaService.getTestCases(query.projectId);
        return { success: true, testCases };
      }
      if (httpMethod === 'POST') {
        const testCase = await qaService.createTestCase(parsedBody);
        return { success: true, testCase };
      }
    }
    const tcDetailMatch = path.match(/^\/test-cases\/([^\/]+)$/);
    if (tcDetailMatch) {
      const id = tcDetailMatch[1];
      if (httpMethod === 'PATCH') {
        const testCase = await qaService.updateTestCase(id, parsedBody);
        return { success: true, testCase };
      }
      if (httpMethod === 'DELETE') {
        await qaService.deleteTestCase(id);
        return { success: true, message: 'Test case deleted successfully' };
      }
    }

    if (path === '/test-runs') {
      if (httpMethod === 'GET') {
        const testRuns = await qaService.getTestRuns(query.projectId);
        return { success: true, testRuns };
      }
      if (httpMethod === 'POST') {
        const testRun = await qaService.createTestRun(parsedBody);
        return { success: true, testRun };
      }
    }
    const trDetailMatch = path.match(/^\/test-runs\/([^\/]+)$/);
    if (trDetailMatch) {
      const id = trDetailMatch[1];
      if (httpMethod === 'PATCH') {
        const testRun = await qaService.updateTestRun(id, parsedBody);
        return { success: true, testRun };
      }
    }

    if (path === '/test-results') {
      if (httpMethod === 'GET') {
        const testResults = await qaService.getTestResults(query.testRunId);
        return { success: true, testResults };
      }
      if (httpMethod === 'POST') {
        const testResult = await qaService.createTestResult(parsedBody);
        return { success: true, testResult };
      }
    }
    const resDetailMatch = path.match(/^\/test-results\/([^\/]+)$/);
    if (resDetailMatch) {
      const id = resDetailMatch[1];
      if (httpMethod === 'PATCH') {
        const testResult = await qaService.updateTestResult(id, parsedBody);
        return { success: true, testResult };
      }
    }

    if (path === '/bugs') {
      if (httpMethod === 'GET') {
        const bugs = await qaService.getBugs(query.projectId);
        return { success: true, bugs };
      }
      if (httpMethod === 'POST') {
        const bug = await qaService.createBug(parsedBody);
        return { success: true, bug };
      }
    }
    const bugDetailMatch = path.match(/^\/bugs\/([^\/]+)$/);
    if (bugDetailMatch) {
      const id = bugDetailMatch[1];
      if (httpMethod === 'PATCH') {
        const bug = await qaService.updateBug(id, parsedBody);
        return { success: true, bug };
      }
      if (httpMethod === 'DELETE') {
        await qaService.deleteBug(id);
        return { success: true, message: 'Bug deleted successfully' };
      }
    }

    // 11. GitHub & Repositories & PRs & Deployments
    if (path === '/repositories') {
      if (httpMethod === 'GET') {
        const repositories = await githubService.getRepositories(query.projectId);
        return { success: true, repositories };
      }
      if (httpMethod === 'POST') {
        const repository = await githubService.createRepository(parsedBody);
        return { success: true, repository };
      }
    }
    const repoDetailMatch = path.match(/^\/repositories\/([^\/]+)$/);
    if (repoDetailMatch) {
      const id = repoDetailMatch[1];
      if (httpMethod === 'PATCH') {
        const repository = await githubService.updateRepository(id, parsedBody);
        return { success: true, repository };
      }
      if (httpMethod === 'DELETE') {
        await githubService.deleteRepository(id);
        return { success: true, message: 'Repository deleted successfully' };
      }
    }

    if (path === '/pull-requests') {
      if (httpMethod === 'GET') {
        const pullRequests = await githubService.getPullRequests(query.projectId, query.repositoryId);
        return { success: true, pullRequests };
      }
      if (httpMethod === 'POST') {
        const pullRequest = await githubService.createPullRequest(parsedBody);
        return { success: true, pullRequest };
      }
    }
    const prDetailMatch = path.match(/^\/pull-requests\/([^\/]+)$/);
    if (prDetailMatch) {
      const id = prDetailMatch[1];
      if (httpMethod === 'PATCH') {
        const pullRequest = await githubService.updatePullRequest(id, parsedBody);
        return { success: true, pullRequest };
      }
      if (httpMethod === 'DELETE') {
        await githubService.deletePullRequest(id);
        return { success: true, message: 'Pull request deleted successfully' };
      }
    }

    if (path === '/deployments') {
      if (httpMethod === 'GET') {
        const deployments = await githubService.getDeployments(query.projectId, query.repositoryId);
        return { success: true, deployments };
      }
      if (httpMethod === 'POST') {
        const deployment = await githubService.createDeployment(parsedBody);
        return { success: true, deployment };
      }
    }
    const depDetailMatch = path.match(/^\/deployments\/([^\/]+)$/);
    if (depDetailMatch) {
      const id = depDetailMatch[1];
      if (httpMethod === 'PATCH') {
        const deployment = await githubService.updateDeployment(id, parsedBody);
        return { success: true, deployment };
      }
      if (httpMethod === 'DELETE') {
        await githubService.deleteDeployment(id);
        return { success: true, message: 'Deployment deleted successfully' };
      }
    }

    // 12. Notifications
    if (path === '/notifications') {
      if (httpMethod === 'GET') {
        const notifications = await notificationService.getNotifications();
        return { success: true, notifications };
      }
    }
    const notifReadMatch = path.match(/^\/notifications\/([^\/]+)\/read$/);
    if (notifReadMatch && httpMethod === 'POST') {
      await notificationService.markAsRead(notifReadMatch[1]);
      return { success: true };
    }
    if (path === '/notifications/read-all' && httpMethod === 'POST') {
      await notificationService.markAllAsRead();
      return { success: true };
    }
    const notifDetailMatch = path.match(/^\/notifications\/([^\/]+)$/);
    if (notifDetailMatch && httpMethod === 'DELETE') {
      await notificationService.deleteNotification(notifDetailMatch[1]);
      return { success: true, message: 'Notification deleted successfully' };
    }

    // 13. Activity Feeds
    if (path === '/activity' && httpMethod === 'GET') {
      const activity = await activityService.fetchActivity(query);
      return { success: true, activity };
    }

    // Fallback if not recognized
    throw new Error(`Endpoint not supported on Firebase adapter: ${endpoint}`);
  } catch (error) {
    console.error(`Firebase API Adapter Error [${httpMethod} ${endpoint}]:`, error);
    throw error;
  }
};
