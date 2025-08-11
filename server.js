import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { searchStation, getTrainsBetweenStations, getTrainSchedule, checkSeatAvailability, getPNRStatus } from './irctcService.js';
import { mcpAuth } from './auth.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Sample flight data
const flights = [
  { id: 1, flightNumber: 'AI101', from: 'DEL', to: 'BOM', departure: '08:00', arrival: '10:00', status: 'On Time' },
  { id: 2, flightNumber: '6E456', from: 'BOM', to: 'BLR', departure: '14:30', arrival: '16:15', status: 'Delayed' },
  { id: 3, flightNumber: 'UK789', from: 'BLR', to: 'DEL', departure: '18:00', arrival: '20:30', status: 'On Time' }
];

// Middleware
app.use(cors());
app.use(express.json({ strict: false })); // Allow non-strict JSON parsing

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// MCP Server Implementation
class MCPServer {
  constructor() {
    this.methods = new Map();
    this.initializeMethods();
  }

  initializeMethods() {
    // Register all available methods
    this.registerMethod('initialize', this.handleInitialize.bind(this));
    this.registerMethod('tools/list', this.handleToolsList.bind(this));
    this.registerMethod('tools/call', this.handleToolCall.bind(this));
    this.registerMethod('notifications/initialized', this.handleInitialized.bind(this));
    this.registerMethod('ping', this.handlePing.bind(this));
  }

  registerMethod(name, handler) {
    this.methods.set(name, handler);
  }

  async handleRequest(payload) {
    const { jsonrpc, method, params, id } = payload;
    
    if (jsonrpc !== '2.0') {
      throw new Error('Invalid JSON-RPC version');
    }

    const handler = this.methods.get(method);
    if (!handler) {
      throw new Error(`Method not found: ${method}`);
    }

    try {
      const result = await handler(params || {});
      return { jsonrpc: '2.0', result, id };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        error: {
          code: error.code || -32603,
          message: error.message || 'Internal error',
          data: error.data
        },
        id
      };
    }
  }

  // MCP Method Handlers
  async handleInitialize() {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false },
        logging: {}
      },
      serverInfo: {
        name: 'mcp-train-flight-server',
        version: '1.0.0'
      }
    };
  }

  async handleToolsList() {
    return {
      tools: [
        {
          name: 'search_trains',
          description: 'Search for trains between two stations',
          inputSchema: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'Source station code or name' },
              to: { type: 'string', description: 'Destination station code or name' },
              date: { type: 'string', description: 'Travel date (YYYY-MM-DD)' }
            },
            required: ['from', 'to']
          }
        },
        {
          name: 'search_stations',
          description: 'Search for railway stations',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Station name or code to search' }
            },
            required: ['query']
          }
        },
        {
          name: 'get_pnr_status',
          description: 'Get PNR status for a train ticket',
          inputSchema: {
            type: 'object',
            properties: {
              pnr: { type: 'string', description: '10-digit PNR number' }
            },
            required: ['pnr']
          }
        },
        {
          name: 'get_train_schedule',
          description: 'Get detailed schedule for a train',
          inputSchema: {
            type: 'object',
            properties: {
              trainNo: { type: 'string', description: 'Train number' }
            },
            required: ['trainNo']
          }
        },
        {
          name: 'check_seat_availability',
          description: 'Check seat availability for a train',
          inputSchema: {
            type: 'object',
            properties: {
              trainNo: { type: 'string', description: 'Train number' },
              from: { type: 'string', description: 'Source station code' },
              to: { type: 'string', description: 'Destination station code' },
              classType: { type: 'string', description: 'Class type (SL, 3A, 2A, 1A)' },
              quota: { type: 'string', description: 'Quota type (GN, TQ, etc.)' }
            },
            required: ['trainNo', 'from', 'to']
          }
        },
        {
          name: 'search_flights',
          description: 'Search for flight deals',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Origin airport code or city' },
              limit: { type: 'string', description: 'Number of results to return' }
            },
            required: ['query']
          }
        }
      ]
    };
  }

  async handleToolCall({ name, arguments: args }) {
    switch (name) {
      case 'search_trains':
        return await this.handleSearchTrains(args);
      case 'search_stations':
        return await this.handleSearchStations(args);
      case 'get_pnr_status':
        return await this.handleGetPNRStatus(args);
      case 'get_train_schedule':
        return await this.handleGetTrainSchedule(args);
      case 'check_seat_availability':
        return await this.handleCheckSeatAvailability(args);
      case 'search_flights':
        return await this.handleSearchFlights(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  async handleSearchTrains({ from, to, date }) {
    const trains = await getTrainsBetweenStations(from, to, date);
    return {
      content: [{
        type: 'text',
        text: `Found ${trains.length} trains from ${from} to ${to}`,
        data: trains
      }]
    };
  }

  async handleSearchStations({ query }) {
    const stations = await searchStation(query);
    return {
      content: [{
        type: 'text',
        text: `Found ${stations.length} stations matching '${query}'`,
        data: stations
      }]
    };
  }

  async handleGetPNRStatus({ pnr }) {
    const status = await getPNRStatus(pnr);
    return {
      content: [{
        type: 'text',
        text: `PNR Status for ${pnr}`,
        data: status
      }]
    };
  }

  async handleGetTrainSchedule({ trainNo }) {
    const schedule = await getTrainSchedule(trainNo);
    return {
      content: [{
        type: 'text',
        text: `Schedule for train ${trainNo}`,
        data: schedule
      }]
    };
  }

  async handleCheckSeatAvailability({ trainNo, from, to, classType = '3A', quota = 'GN' }) {
    const availability = await checkSeatAvailability(trainNo, from, to, classType, quota);
    return {
      content: [{
        type: 'text',
        text: `Seat availability for train ${trainNo}`,
        data: availability
      }]
    };
  }

  async handleSearchFlights({ query, limit }) {
    const flightDeals = await getFlightDeals(query, limit);
    return {
      content: [{
        type: 'text',
        text: `Found ${flightDeals.length} flight deals from ${query}`,
        data: flightDeals
      }]
    };
  }

  async handleInitialized() {
    // No response needed for notifications
    return null;
  }

  async handlePing() {
    return 'pong';
  }
}

// Create MCP server instance
const mcpServer = new MCPServer();

// MCP endpoint handler with authentication
app.post('/mcp', mcpAuth, async (req, res) => {
  try {
    let payload = req.body;
    
    // Handle string payload (in case it's double-stringified)
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
        // Handle case where the parsed payload is still a string
        if (typeof payload === 'string') {
          try {
            payload = JSON.parse(payload);
          } catch (e) {
            // If second parse fails, use the string as is
          }
        }
      } catch (e) {
        // If parsing fails, try to clean up the string
        try {
          const cleaned = payload
            .replace(/^"+|"+$/g, '')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
          payload = JSON.parse(cleaned);
        } catch (cleanError) {
          return res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32700,
              message: 'Parse error',
              data: `Invalid JSON: ${cleanError.message}`
            },
            id: null
          });
        }
      }
    }
    
    // Handle batch requests (array of requests)
    if (Array.isArray(payload)) {
      const results = await Promise.all(
        payload.map(request => mcpServer.handleRequest(request))
      );
      return res.json(results);
    }
    
    // Handle single request
    const response = await mcpServer.handleRequest(payload);
    res.json(response);
  } catch (error) {
    console.error('MCP request error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message
      },
      id: null
    });
  }
});

// Health check endpoint (required for Render)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    service: 'MCP Train & Flight Server',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Simple root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'MCP Train & Flight Server is running',
    endpoints: {
      mcp: 'POST /mcp - MCP protocol endpoint',
      health: 'GET /health - Health check endpoint'
    },
    version: '1.0.0'
  });
});
// Helper function to format dates in Indian standard
const formatToIndianDateTime = (isoString) => {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  return {
    date: date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  };
};

// Helper function to convert currency to INR
const convertToINR = (amount, fromCurrency = 'USD') => {
  if (amount === undefined || amount === null) return null;
  const exchangeRates = {
    'USD': 87.6427,
    'EUR': 95.1234,
    'GBP': 109.8765,
    'SGD': 64.3210,
    'AED': 23.8654,
    'AUD': 57.89,
    'CAD': 64.32
  };
  
  const rate = exchangeRates[fromCurrency.toUpperCase()] || 1;
  return Math.round(amount * rate);
};

// Format currency in Indian format
const formatToIndianCurrency = (amount, currency = 'INR') => {
  if (amount === undefined || amount === null) return 'N/A';
  const amountInINR = currency.toUpperCase() === 'INR' 
    ? amount 
    : convertToINR(amount, currency);
  
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amountInINR);
};

// Format duration in hours and minutes
const formatDuration = (minutes) => {
  if (!minutes) return 'N/A';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}h ${mins}m`;
};

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid JSON payload',
      details: 'The request body contains invalid JSON'
    });
  }

  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
    path: req.path
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 MCP Train & Flight Server is running on http://localhost:${PORT}`);
  console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 MCP endpoint available at: POST /mcp`);
  console.log(`💡 Health check available at: GET /health`);
});
