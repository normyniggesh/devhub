const prisma = require('../db');
const { createAuditLog } = require('../utils/audit');

const VALID_PROVIDERS = ['google_drive', 'dropbox', 'onedrive'];

exports.getUserIntegrations = async (req, res) => {
  try {
    const integrations = await prisma.userIntegration.findMany({
      where: { userId: req.userId }
    });

    const statusMap = {
      google_drive: { connected: false },
      dropbox: { connected: false },
      onedrive: { connected: false }
    };

    integrations.forEach(item => {
      if (VALID_PROVIDERS.includes(item.provider)) {
        statusMap[item.provider] = {
          connected: item.status === 'connected',
          accountName: item.accountName,
          connectedAt: item.updatedAt || item.createdAt,
          metadata: item.metadata
        };
      }
    });

    res.json({ success: true, integrations: statusMap });
  } catch (error) {
    console.error('Error getting user integrations:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.connectIntegration = async (req, res) => {
  try {
    const { provider, accountName, accessToken, metadata } = req.body;

    if (!provider || !VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` 
      });
    }

    if (!accountName || !accountName.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Account name or email is required to connect integration' 
      });
    }

    const cleanAccountName = accountName.trim();

    const integration = await prisma.userIntegration.upsert({
      where: {
        userId_provider: {
          userId: req.userId,
          provider
        }
      },
      update: {
        status: 'connected',
        accountName: cleanAccountName,
        accessToken: accessToken ? String(accessToken).trim() : null,
        metadata: metadata || null,
        updatedAt: new Date()
      },
      create: {
        userId: req.userId,
        provider,
        status: 'connected',
        accountName: cleanAccountName,
        accessToken: accessToken ? String(accessToken).trim() : null,
        metadata: metadata || null
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Connected',
      entityType: 'Integration',
      entityId: integration.id,
      metadata: { provider, accountName: cleanAccountName }
    });

    res.json({
      success: true,
      message: `${provider.replace('_', ' ')} connected successfully`,
      integration: {
        provider: integration.provider,
        status: integration.status,
        accountName: integration.accountName,
        connectedAt: integration.updatedAt
      }
    });
  } catch (error) {
    console.error('Error connecting integration:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.disconnectIntegration = async (req, res) => {
  try {
    const { provider } = req.body;

    if (!provider || !VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` 
      });
    }

    const existing = await prisma.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId: req.userId,
          provider
        }
      }
    });

    if (!existing) {
      return res.json({ success: true, message: 'Integration already disconnected' });
    }

    await prisma.userIntegration.delete({
      where: {
        userId_provider: {
          userId: req.userId,
          provider
        }
      }
    });

    createAuditLog({
      userId: req.userId,
      action: 'Disconnected',
      entityType: 'Integration',
      entityId: existing.id,
      metadata: { provider, accountName: existing.accountName }
    });

    res.json({
      success: true,
      message: `${provider.replace('_', ' ')} disconnected successfully`
    });
  } catch (error) {
    console.error('Error disconnecting integration:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
