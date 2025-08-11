import 'dotenv/config';
const BEARER_TOKEN = process.env.API_BEARER_TOKEN ? process.env.API_BEARER_TOKEN.trim() : null;

if (!BEARER_TOKEN) {
  console.error('ERROR: API_BEARER_TOKEN is not set in the environment variables');
  process.exit(1);
}

// Simple authentication middleware
const auth = (req, res, next) => {
  console.log('Auth middleware called');
  
  // Get token from Authorization header
  const authHeader = req.header('Authorization');
  console.log('Auth header:', authHeader);
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('No Bearer token found in header');
    return res.status(401).json({ 
      status: 'error',
      message: 'No token provided. Please include a Bearer token in the Authorization header.'
    });
  }

  const token = authHeader.split(' ')[1];
  console.log('Extracted token:', token);
  console.log('Expected token:', BEARER_TOKEN);
  
  if (token !== BEARER_TOKEN) {
    console.log('Token mismatch');
    return res.status(401).json({ 
      status: 'error',
      message: 'Invalid token. Please provide a valid Bearer token.'
    });
  }

  console.log('Authentication successful');
  // If token is valid, proceed to the next middleware/route handler
  next();
};

export { auth, BEARER_TOKEN };
