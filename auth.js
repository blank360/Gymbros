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
export const mcpAuth = (req, res, next) => {
  // Skip auth for initialize and ping methods
  if (req.body?.method === 'initialize' || req.body?.method === 'ping') {
    return next();
  }

  const authHeader = req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
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
    return res.status(200).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Unauthorized',
        data: 'Invalid Bearer token'
      },
      id: req.body?.id || null
    });
  }

  next();
};

export { BEARER_TOKEN };

export default mcpAuth;
