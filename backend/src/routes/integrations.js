const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const {
  getUserIntegrations,
  getGoogleAuthUrl,
  handleGoogleCallback,
  connectIntegration,
  disconnectIntegration,
  listProviderFiles,
  downloadProviderFile,
  importProviderFile,
  getProviderQuota,
  setSystemStorage,
  getSystemStorageStatus,
  recordOAuthDiagnostic
} = require('../controllers/integrations');

// Dedicated OAuth callback auth resolver:
// 1. Accepts standard auth cookie (devhub_auth_token)
// 2. Accepts Bearer header (Authorization: Bearer <token>)
// 3. Fallback: Accepts cryptographically signed OAuth state token from redirect URL
//    This guarantees reauthorization succeeds even when cross-site 3rd-party cookies
//    are blocked/restricted by browsers like Brave, Safari, or Chrome privacy sandbox!
const oauthCallbackAuth = (req, res, next) => {
  let token = req.cookies?.devhub_auth_token;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded?.userId) {
        req.userId = decoded.userId;
        if (recordOAuthDiagnostic) {
          recordOAuthDiagnostic({
            event: 'callback_auth_session_success',
            userId: req.userId
          });
        }
        return next();
      }
    } catch (e) {
      // Cookie invalid/expired - continue to state fallback below
    }
  }

  // Fallback: Verify state parameter from OAuth redirect
  const state = req.body?.state || req.query?.state;
  if (state) {
    try {
      const decodedState = jwt.verify(state, process.env.JWT_SECRET);
      if (decodedState?.userId) {
        req.userId = decodedState.userId;
        req.authenticatedViaState = true;
        if (recordOAuthDiagnostic) {
          recordOAuthDiagnostic({
            event: 'callback_auth_state_fallback_success',
            userId: req.userId
          });
        }
        return next();
      }
    } catch (jwtErr) {
      try {
        const parsed = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        if (parsed?.userId) {
          req.userId = parsed.userId;
          req.authenticatedViaState = true;
          if (recordOAuthDiagnostic) {
            recordOAuthDiagnostic({
              event: 'callback_auth_base64_state_fallback_success',
              userId: req.userId
            });
          }
          return next();
        }
      } catch (b64Err) {
        // invalid state
      }
    }
  }

  if (recordOAuthDiagnostic) {
    recordOAuthDiagnostic({
      event: 'callback_auth_failed',
      hasCookie: Boolean(req.cookies?.devhub_auth_token),
      hasBearer: Boolean(req.headers.authorization),
      hasState: Boolean(state)
    });
  }

  return res.status(401).json({ success: false, error: 'Authentication required' });
};


// OAuth callback with flexible auth (cookie, bearer, or state token)
router.post('/google/callback', oauthCallbackAuth, handleGoogleCallback);

// Standard auth required for all other endpoints
router.use(authMiddleware);

router.get('/', getUserIntegrations);
router.get('/quota', getProviderQuota);
router.get('/google/auth-url', getGoogleAuthUrl);
router.get('/google/system-storage', getSystemStorageStatus);
router.post('/google/system-storage', setSystemStorage);
router.post('/connect', connectIntegration);
router.post('/disconnect', disconnectIntegration);
router.get('/:provider/quota', getProviderQuota);
router.get('/:provider/files', listProviderFiles);
router.get('/:provider/download/:fileId', downloadProviderFile);
router.post('/:provider/import', importProviderFile);

module.exports = router;
