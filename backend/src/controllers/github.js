const prisma = require('../db');
const { createAuditLog } = require('../utils/audit');

const GITHUB_API_BASE = 'https://api.github.com';

function getGitHubHeaders(token) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'DevHub-Platform'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

exports.getStatus = async (req, res) => {
  try {
    const integration = await prisma.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId: req.userId,
          provider: 'github'
        }
      }
    });

    if (!integration || integration.status !== 'connected') {
      return res.json({ success: true, connected: false });
    }

    res.json({
      success: true,
      connected: true,
      username: integration.accountName,
      connectedAt: integration.updatedAt || integration.createdAt,
      metadata: integration.metadata,
      hasToken: Boolean(integration.accessToken)
    });
  } catch (error) {
    console.error('Error getting GitHub status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.connect = async (req, res) => {
  try {
    const { token, username } = req.body;

    if (!token && !username) {
      return res.status(400).json({
        success: false,
        message: 'GitHub Personal Access Token or GitHub username is required'
      });
    }

    let ghUser = null;
    const cleanToken = token ? token.trim() : null;

    if (cleanToken) {
      const response = await fetch(`${GITHUB_API_BASE}/user`, {
        headers: getGitHubHeaders(cleanToken)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        return res.status(401).json({
          success: false,
          message: errData.message || 'Invalid GitHub token. Please verify your token.'
        });
      }

      ghUser = await response.json();
    } else {
      const cleanUsername = username.trim();
      const response = await fetch(`${GITHUB_API_BASE}/users/${encodeURIComponent(cleanUsername)}`, {
        headers: getGitHubHeaders()
      });

      if (!response.ok) {
        return res.status(404).json({
          success: false,
          message: `GitHub user "${cleanUsername}" was not found.`
        });
      }

      ghUser = await response.json();
    }

    const metadata = {
      id: ghUser.id,
      login: ghUser.login,
      name: ghUser.name || ghUser.login,
      avatarUrl: ghUser.avatar_url,
      htmlUrl: ghUser.html_url,
      publicRepos: ghUser.public_repos,
      totalPrivateRepos: ghUser.total_private_repos || 0,
      followers: ghUser.followers
    };

    const integration = await prisma.userIntegration.upsert({
      where: {
        userId_provider: {
          userId: req.userId,
          provider: 'github'
        }
      },
      update: {
        status: 'connected',
        accountName: ghUser.login,
        accessToken: cleanToken,
        metadata,
        updatedAt: new Date()
      },
      create: {
        userId: req.userId,
        provider: 'github',
        status: 'connected',
        accountName: ghUser.login,
        accessToken: cleanToken,
        metadata
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Connected',
      entityType: 'Integration',
      entityId: integration.id,
      metadata: { provider: 'github', username: ghUser.login }
    });

    res.json({
      success: true,
      message: 'GitHub account connected successfully',
      connected: true,
      username: ghUser.login,
      avatarUrl: ghUser.avatar_url,
      reposCount: ghUser.public_repos + (ghUser.total_private_repos || 0)
    });
  } catch (error) {
    console.error('Error connecting GitHub:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

exports.disconnect = async (req, res) => {
  try {
    const existing = await prisma.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId: req.userId,
          provider: 'github'
        }
      }
    });

    if (!existing) {
      return res.json({ success: true, message: 'GitHub already disconnected' });
    }

    await prisma.userIntegration.delete({
      where: {
        userId_provider: {
          userId: req.userId,
          provider: 'github'
        }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Disconnected',
      entityType: 'Integration',
      entityId: existing.id,
      metadata: { provider: 'github', username: existing.accountName }
    });

    res.json({ success: true, message: 'GitHub account disconnected successfully' });
  } catch (error) {
    console.error('Error disconnecting GitHub:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getUserRepositories = async (req, res) => {
  try {
    const integration = await prisma.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId: req.userId,
          provider: 'github'
        }
      }
    });

    if (!integration || integration.status !== 'connected') {
      return res.status(400).json({
        success: false,
        message: 'GitHub account is not connected. Connect your account first.'
      });
    }

    let url;
    let headers = getGitHubHeaders(integration.accessToken);

    if (integration.accessToken) {
      url = `${GITHUB_API_BASE}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`;
    } else {
      url = `${GITHUB_API_BASE}/users/${encodeURIComponent(integration.accountName)}/repos?per_page=100&sort=updated`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        success: false,
        message: err.message || 'Failed to fetch repositories from GitHub'
      });
    }

    const reposData = await response.json();

    const repos = reposData.map(r => ({
      id: String(r.id),
      name: r.name,
      fullName: r.full_name,
      owner: r.owner?.login || integration.accountName,
      url: r.html_url,
      description: r.description || '',
      starsCount: r.stargazers_count || 0,
      forksCount: r.forks_count || 0,
      openIssuesCount: r.open_issues_count || 0,
      language: r.language || 'Unknown',
      isPrivate: Boolean(r.private),
      defaultBranch: r.default_branch || 'main',
      pushedAt: r.pushed_at
    }));

    res.json({ success: true, repos });
  } catch (error) {
    console.error('Error fetching user GitHub repos:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

exports.importRepositories = async (req, res) => {
  try {
    const { repos, projectId } = req.body;

    if (!Array.isArray(repos) || repos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one repository must be selected for import'
      });
    }

    // Check project access if projectId is provided
    if (projectId) {
      const access = await checkProjectAccess(projectId, req.userId);
      if (!access.accessible) {
        return res.status(403).json({ success: false, message: 'Forbidden project access' });
      }
    }

    const imported = [];

    for (const item of repos) {
      if (!item.name || !item.owner || !item.url) continue;

      // Check if already imported for this user
      const existing = await prisma.repository.findFirst({
        where: {
          userId: req.userId,
          name: item.name,
          owner: item.owner
        }
      });

      if (existing) {
        const updated = await prisma.repository.update({
          where: { id: existing.id },
          data: {
            url: item.url,
            defaultBranch: item.defaultBranch || existing.defaultBranch || 'main',
            description: item.description !== undefined ? item.description : existing.description,
            starsCount: item.starsCount !== undefined ? item.starsCount : existing.starsCount,
            forksCount: item.forksCount !== undefined ? item.forksCount : existing.forksCount,
            openIssuesCount: item.openIssuesCount !== undefined ? item.openIssuesCount : existing.openIssuesCount,
            language: item.language || existing.language,
            isPrivate: item.isPrivate !== undefined ? item.isPrivate : existing.isPrivate,
            pushedAt: item.pushedAt ? new Date(item.pushedAt) : existing.pushedAt,
            projectId: projectId || existing.projectId
          },
          include: {
            project: { select: { id: true, name: true } }
          }
        });
        imported.push(updated);
      } else {
        const created = await prisma.repository.create({
          data: {
            name: item.name.trim(),
            owner: item.owner.trim(),
            url: item.url.trim(),
            defaultBranch: item.defaultBranch?.trim() || 'main',
            description: item.description || null,
            starsCount: item.starsCount || 0,
            forksCount: item.forksCount || 0,
            openIssuesCount: item.openIssuesCount || 0,
            language: item.language || null,
            isPrivate: Boolean(item.isPrivate),
            pushedAt: item.pushedAt ? new Date(item.pushedAt) : null,
            projectId: projectId || null,
            userId: req.userId
          },
          include: {
            project: { select: { id: true, name: true } }
          }
        });

        createAuditLog({
          userId: req.userId,
          action: 'Created',
          entityType: 'Repository',
          entityId: created.id,
          projectId: projectId || null,
          metadata: { name: created.name, owner: created.owner, url: created.url }
        });

        imported.push(created);
      }
    }

    res.json({
      success: true,
      message: `Successfully imported ${imported.length} repositories`,
      repositories: imported
    });
  } catch (error) {
    console.error('Error importing repositories:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

exports.syncRepository = async (req, res) => {
  try {
    const { repoId } = req.params;

    const repository = await prisma.repository.findUnique({
      where: { id: repoId }
    });

    if (!repository) {
      return res.status(404).json({ success: false, message: 'Repository not found' });
    }

    // Verify ownership or project access
    if (repository.userId && repository.userId !== req.userId) {
      if (repository.projectId) {
        const access = await checkProjectAccess(repository.projectId, req.userId);
        if (!access.accessible) return res.status(403).json({ success: false, message: 'Forbidden' });
      } else {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    // Get user's integration token if available
    const integration = await prisma.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId: req.userId,
          provider: 'github'
        }
      }
    });

    const headers = getGitHubHeaders(integration?.accessToken);
    const apiUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
    const response = await fetch(apiUrl, { headers });

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: 'Failed to sync with GitHub API. The repository may be private or deleted.'
      });
    }

    const r = await response.json();

    const updated = await prisma.repository.update({
      where: { id: repoId },
      data: {
        description: r.description || repository.description,
        starsCount: r.stargazers_count !== undefined ? r.stargazers_count : repository.starsCount,
        forksCount: r.forks_count !== undefined ? r.forks_count : repository.forksCount,
        openIssuesCount: r.open_issues_count !== undefined ? r.open_issues_count : repository.openIssuesCount,
        language: r.language || repository.language,
        isPrivate: Boolean(r.private),
        defaultBranch: r.default_branch || repository.defaultBranch,
        pushedAt: r.pushed_at ? new Date(r.pushed_at) : repository.pushedAt
      },
      include: {
        project: { select: { id: true, name: true } }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Updated',
      entityType: 'Repository',
      entityId: repoId,
      projectId: repository.projectId,
      metadata: { name: repository.name, action: 'Synced metadata from GitHub' }
    });

    res.json({
      success: true,
      message: 'Repository synced successfully',
      repository: updated
    });
  } catch (error) {
    console.error('Error syncing repository:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};
