import 'dotenv/config';
import express from 'express';
import dotenv from 'dotenv';
import { searchStation, getTrainsBetweenStations, getTrainSchedule, checkSeatAvailability, getPNRStatus } from './irctcService.js';
import { mcpAuth } from './auth.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json({ strict: false }));

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
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

// MCP protocol endpoint
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
            .replace(/\\\\/g, '\\\\');
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
// MCP Server Error Handler
app.use((err, req, res, next) => {
  console.error('MCP Server Error:', err);
  
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(200).json({
      jsonrpc: '2.0',
      error: {
        code: -32700,
        message: 'Parse error',
        data: 'Invalid JSON was received by the server.'
      },
      id: null
    });
  }

  res.status(200).json({
    jsonrpc: '2.0',
    error: {
      code: -32603,
      message: 'Internal error',
      data: process.env.NODE_ENV === 'development' ? err.message : undefined
    },
    id: null
  });
});

// 404 handler - Return JSON-RPC 2.0 error for unknown methods
app.use((req, res) => {
  res.status(200).json({
    jsonrpc: '2.0',
    error: {
      code: -32601,
      message: 'Method not found',
      data: `The method '${req.path}' does not exist.`
    },
    id: null
  });
});

// Start the MCP server
app.listen(PORT, () => {
  console.log(`🚀 MCP Server is running on http://localhost:${PORT}`);
  console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 MCP endpoint: POST http://localhost:${PORT}/mcp`);
});
