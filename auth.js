import 'dotenv/config';

const BEARER_TOKEN = process.env.API_BEARER_TOKEN ? process.env.API_BEARER_TOKEN.trim() : null;

if (!BEARER_TOKEN) {
  console.error('ERROR: API_BEARER_TOKEN is not set in the environment variables');
  process.exit(1);
}

/**
 * MCP-compliant authentication middleware
 * Validates Bearer token and returns JSON-RPC 2.0 formatted errors
 */
const mcpAuth = (req, res, next) => {
  // Skip auth for initialize and ping methods
  if (req.body?.method === 'initialize' || req.body?.method === 'ping') {
    return next();
  }

  const authHeader = req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('No Bearer token found in header');
    return res.status(200).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Unauthorized',
        data: 'No Bearer token provided in Authorization header'
      },
      id: req.body?.id || null
    });
  }

  const token = authHeader.split(' ')[1];
  
  if (token !== BEARER_TOKEN) {
    console.log('Invalid token provided');
    return res.status(200).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized',
        data: 'Invalid or expired token'
      },
      id: req.body?.id || null
    });
  }

  next();
};

// Legacy auth middleware (kept for backward compatibility)
const legacyAuth = (req, res, next) => {
  const authHeader = req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      status: 'error',
      message: 'No token provided. Please include a Bearer token in the Authorization header.'
    });
  }

  const token = authHeader.split(' ')[1];
  
  if (token !== BEARER_TOKEN) {
    return res.status(401).json({ 
      status: 'error',
      message: 'Invalid token. Please provide a valid Bearer token.'
    });
  }

  next();
};

export { mcpAuth as auth, legacyAuth, BEARER_TOKEN };
