import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import https from 'https';
import { searchStation, searchTrain, getTrainsBetweenStations, getPNRStatus, getTrainSchedule, getTrainsByStation, checkSeatAvailability } from './irctcService.js';
import { auth } from './auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());

// Use simple JSON parsing without custom verification
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  if (Object.keys(req.body || {}).length > 0) {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// MCP endpoint handler - FIXED VERSION
app.post('/mcp', (req, res) => {
  try {
    console.log('MCP request received');
    console.log('Headers:', req.headers);
    console.log('Content-Type:', req.get('content-type'));
    console.log('Body type:', typeof req.body);
    console.log('Raw body:', req.body);
    
    let payload = req.body;
    
    // Handle the case where body might be a string (shouldn't happen with express.json())
    if (typeof req.body === 'string') {
      try {
        payload = JSON.parse(req.body);
      } catch (parseError) {
        console.error('Failed to parse string body:', parseError);
        return res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: "Parse error",
            data: parseError.message
          },
          id: null
        });
      }
    }

    console.log('Processed payload:', payload);
    
    // Handle MCP-specific request structure
    if (payload && payload.method) {
      switch (payload.method) {
        case 'ping':
          console.log('Handling ping request');
          return res.json({
            jsonrpc: "2.0",
            result: "pong",
            id: payload.id
          });
          
        case 'initialize':
          console.log('Handling initialize request');
          return res.json({
            jsonrpc: "2.0",
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {
                tools: {
                  listChanged: false
                },
                resources: {
                  subscribe: false,
                  listChanged: false
                },
                prompts: {
                  listChanged: false
                },
                logging: {}
              },
              serverInfo: {
                name: "mcp-train-flight-server",
                version: "1.0.1"
              }
            },
            id: payload.id
          });
          
        case 'notifications/initialized':
          console.log('Handling initialized notification');
          // This is a notification, don't send a response
          return res.status(200).end();
          
        case 'tools/list':
          console.log('Handling tools/list request');
          return res.json({
            jsonrpc: "2.0",
            result: {
              tools: [
                {
                  name: "search_trains",
                  description: "Search for trains between two stations",
                  inputSchema: {
                    type: "object",
                    properties: {
                      from: { type: "string", description: "Source station code or name" },
                      to: { type: "string", description: "Destination station code or name" },
                      date: { type: "string", description: "Travel date (YYYY-MM-DD)" }
                    },
                    required: ["from", "to"]
                  }
                },
                {
                  name: "search_stations",
                  description: "Search for railway stations",
                  inputSchema: {
                    type: "object",
                    properties: {
                      query: { type: "string", description: "Station name or code to search" }
                    },
                    required: ["query"]
                  }
                },
                {
                  name: "get_pnr_status",
                  description: "Get PNR status for a train ticket",
                  inputSchema: {
                    type: "object",
                    properties: {
                      pnr: { type: "string", description: "10-digit PNR number" }
                    },
                    required: ["pnr"]
                  }
                },
                {
                  name: "get_train_schedule",
                  description: "Get detailed schedule for a train",
                  inputSchema: {
                    type: "object",
                    properties: {
                      trainNo: { type: "string", description: "Train number" }
                    },
                    required: ["trainNo"]
                  }
                },
                {
                  name: "check_seat_availability",
                  description: "Check seat availability for a train",
                  inputSchema: {
                    type: "object",
                    properties: {
                      trainNo: { type: "string", description: "Train number" },
                      from: { type: "string", description: "Source station code" },
                      to: { type: "string", description: "Destination station code" },
                      classType: { type: "string", description: "Class type (SL, 3A, 2A, 1A)" },
                      quota: { type: "string", description: "Quota type (GN, TQ, etc.)" }
                    },
                    required: ["trainNo", "from", "to"]
                  }
                },
                {
                  name: "search_flights",
                  description: "Search for flight deals",
                  inputSchema: {
                    type: "object",
                    properties: {
                      query: { type: "string", description: "Origin airport code or city" },
                      limit: { type: "string", description: "Number of results to return" }
                    },
                    required: ["query"]
                  }
                }
              ]
            },
            id: payload.id
          });

        case 'tools/call':
          console.log('Handling tools/call request');
          return handleToolCall(payload, res);
          
        default:
          console.log('Unknown method:', payload.method);
          return res.json({
            jsonrpc: "2.0",
            error: {
              code: -32601,
              message: "Method not found",
              data: `Unknown method: ${payload.method}`
            },
            id: payload.id
          });
      }
    }

    // Fallback response
    console.log('Sending fallback response');
    res.json({
      jsonrpc: "2.0",
      result: {
        status: 'success',
        message: 'MCP request processed',
        received: payload
      },
      id: payload?.id || null
    });
    
  } catch (error) {
    console.error('MCP handler error:', error);
    res.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Internal error",
        data: error.message
      },
      id: null
    });
  }
});

// Handle MCP tool calls
async function handleToolCall(payload, res) {
  try {
    const { name, arguments: args } = payload.params;
    
    console.log(`Executing tool: ${name} with args:`, args);
    
    switch (name) {
      case 'search_trains':
        const trains = await getTrainsBetweenStations(args.from, args.to, args.date);
        return res.json({
          jsonrpc: "2.0",
          result: {
            content: [{
              type: "text",
              text: `Found trains from ${args.from} to ${args.to}:\n${JSON.stringify(trains, null, 2)}`
            }]
          },
          id: payload.id
        });
        
      case 'search_stations':
        const stations = await searchStation(args.query);
        return res.json({
          jsonrpc: "2.0",
          result: {
            content: [{
              type: "text", 
              text: `Stations matching '${args.query}':\n${JSON.stringify(stations, null, 2)}`
            }]
          },
          id: payload.id
        });
        
      case 'get_pnr_status':
        const pnrStatus = await getPNRStatus(args.pnr);
        return res.json({
          jsonrpc: "2.0",
          result: {
            content: [{
              type: "text",
              text: `PNR Status for ${args.pnr}:\n${JSON.stringify(pnrStatus, null, 2)}`
            }]
          },
          id: payload.id
        });
        
      case 'get_train_schedule':
        const schedule = await getTrainSchedule(args.trainNo);
        return res.json({
          jsonrpc: "2.0",
          result: {
            content: [{
              type: "text",
              text: `Schedule for train ${args.trainNo}:\n${JSON.stringify(schedule, null, 2)}`
            }]
          },
          id: payload.id
        });
        
      case 'check_seat_availability':
        const availability = await checkSeatAvailability(
          args.trainNo, 
          args.from, 
          args.to, 
          args.classType || '3A', 
          args.quota || 'GN'
        );
        return res.json({
          jsonrpc: "2.0",
          result: {
            content: [{
              type: "text",
              text: `Seat availability for ${args.trainNo}:\n${JSON.stringify(availability, null, 2)}`
            }]
          },
          id: payload.id
        });
        
      case 'search_flights':
        const flightDeals = await getFlightDeals(args.query, args.limit);
        return res.json({
          jsonrpc: "2.0",
          result: {
            content: [{
              type: "text",
              text: `Flight deals from ${args.query}:\n${JSON.stringify(flightDeals, null, 2)}`
            }]
          },
          id: payload.id
        });
        
      default:
        return res.json({
          jsonrpc: "2.0",
          error: {
            code: -32601,
            message: "Tool not found",
            data: `Unknown tool: ${name}`
          },
          id: payload.id
        });
    }
  } catch (error) {
    console.error('Tool execution error:', error);
    return res.json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Tool execution failed",
        data: error.message
      },
      id: payload.id
    });
  }
}

// Flight deals helper function
async function getFlightDeals(query = 'DEL', limit = '10') {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      hostname: 'flights-scraper-real-time.p.rapidapi.com',
      path: `/deals/search?query=${encodeURIComponent(query)}&limit=${limit}`,
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY || '4de48af65amsh68e3080b6e8897ap1c3511jsn79a3a35bbc97',
        'x-rapidapi-host': 'flights-scraper-real-time.p.rapidapi.com'
      }
    };

    const req = https.request(options, (apiRes) => {
      let data = '';
      apiRes.on('data', (chunk) => {
        data += chunk;
      });
      apiRes.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Simple auth endpoint to verify the token is working
app.get('/api/auth/verify', auth, (req, res) => {
  res.json({ 
    status: 'success',
    message: 'Token is valid',
    timestamp: new Date().toISOString()
  });
});

// Sample flight data (for reference)
const flights = [
  { id: 1, flightNumber: 'AI101', from: 'DEL', to: 'BOM', departure: '08:00', arrival: '10:00', status: 'On Time' },
  { id: 2, flightNumber: '6E456', from: 'BOM', to: 'BLR', departure: '14:30', arrival: '16:15', status: 'Delayed' },
  { id: 3, flightNumber: 'UK789', from: 'BLR', to: 'DEL', departure: '18:00', arrival: '20:30', status: 'On Time' }
];

// Root endpoint with welcome message
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'Welcome to the MCP Train & Flight Info Server',
    endpoints: {
      mcp: 'POST /mcp - MCP protocol endpoint',
      health: 'GET /health - Health check',
      auth: 'GET /api/auth/verify - Verify Bearer token',
      trains: {
        searchStations: 'GET /api/trains/stations?query=:query',
        betweenStations: 'GET /api/trains/between-stations?from=:from&to=:to&date=YYYY-MM-DD',
        pnrStatus: 'GET /api/trains/pnr/:pnr',
        trainSchedule: 'GET /api/trains/schedule/:trainNumber',
        seatAvailability: 'GET /api/trains/check-availability?trainNo=:trainNo&from=:from&to=:to&class=:class&quota=:quota'
      },
      flights: {
        deals: 'GET /api/flights/deals?query=:origin&limit=:limit'
      }
    },
    version: '1.0.1'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'MCP Train & Flight Server is running',
    timestamp: new Date().toISOString(),
    version: '1.0.1'
  });
});

// Get all flights
app.get('/flights', (req, res) => {
  res.json({
    status: true,
    data: flights
  });
});

// IRCTC Train API Routes

// Search for stations
app.get('/api/trains/stations', auth, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 2) {
      return res.status(400).json({ 
        status: false, 
        message: 'Please provide a search query with at least 2 characters' 
      });
    }
    const result = await searchStation(query);
    res.json({
      status: true,
      data: result
    });
  } catch (error) {
    console.error('Station search error:', error);
    res.status(500).json({ 
      status: false, 
      message: 'Failed to search stations',
      error: error.message 
    });
  }
});

// Search for trains between stations
app.get('/api/trains/between-stations', async (req, res) => {
  try {
    let { from, to, date } = req.query;
    
    if (!from || !to) {
      return res.status(400).json({ 
        status: false, 
        message: 'Please provide both source (from) and destination (to) station codes' 
      });
    }

    // Convert date to Date object if provided, otherwise use current date
    const searchDate = date ? new Date(date) : new Date();
    
    // Get trains between stations with the specified date
    const trains = await getTrainsBetweenStations(from, to, searchDate);
    
    res.json({
      status: true,
      searchParams: { 
        from, 
        to, 
        date: searchDate.toISOString().split('T')[0] 
      },
      totalResults: Array.isArray(trains) ? trains.length : 0,
      data: trains || []
    });
  } catch (error) {
    console.error('Train search error:', error);
    res.status(500).json({ 
      status: false, 
      message: 'Failed to fetch trains',
      error: error.message 
    });
  }
});

// Get train schedule
app.get('/api/trains/schedule/:trainNo', async (req, res) => {
  try {
    const { trainNo } = req.params;
    const schedule = await getTrainSchedule(trainNo);
    
    res.json({
      status: true,
      trainNo,
      data: schedule
    });
  } catch (error) {
    console.error('Train schedule error:', error);
    res.status(500).json({ 
      status: false, 
      message: 'Failed to fetch train schedule',
      error: error.message 
    });
  }
});

// Check seat availability
app.get('/api/trains/check-availability', async (req, res) => {
  try {
    const { trainNo, from, to, class: classType = '3A', quota = 'GN' } = req.query;
    
    if (!trainNo || !from || !to) {
      return res.status(400).json({ 
        status: false, 
        message: 'Please provide train number, from and to station codes' 
      });
    }

    const availability = await checkSeatAvailability(
      trainNo, 
      from, 
      to, 
      classType, 
      quota
    );
    
    res.json({
      status: true,
      searchParams: { trainNo, from, to, class: classType, quota },
      data: availability
    });
  } catch (error) {
    console.error('Seat availability error:', error);
    res.status(500).json({ 
      status: false, 
      message: 'Failed to check seat availability',
      error: error.message 
    });
  }
});

// Get PNR status
app.get('/api/trains/pnr/:pnr', async (req, res) => {
  try {
    const { pnr } = req.params;
    const status = await getPNRStatus(pnr);
    
    res.json({
      status: true,
      pnr,
      data: status
    });
  } catch (error) {
    console.error('PNR status error:', error);
    res.status(500).json({ 
      status: false, 
      message: 'Failed to fetch PNR status',
      error: error.message 
    });
  }
});

// Flight Deals Search Endpoint
app.get('/api/flights/deals', async (req, res) => {
  const { query = 'DEL', limit = '10' } = req.query;
  
  try {
    const response = await getFlightDeals(query, limit);

    // Format the response with Indian standards
    const formatToIndianDateTime = (isoString) => {
      if (!isoString) return 'N/A';
      const date = new Date(isoString);
      return {
        date: date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
      };
    };

    const convertToINR = (amount, fromCurrency = 'USD') => {
      if (amount === undefined || amount === null) return null;
      const exchangeRates = {
        'USD': 87.6427,
        'EUR': 95.35,
        'GBP': 111.45,
        'AED': 23.86,
        'SGD': 64.25,
        'AUD': 57.89,
        'CAD': 64.32
      };
      
      const rate = exchangeRates[fromCurrency.toUpperCase()] || 1;
      return Math.round(amount * rate);
    };

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

    const formatDuration = (minutes) => {
      if (!minutes) return 'N/A';
      const hrs = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hrs}h ${mins}m`;
    };

    const formattedResponse = {
      status: response.status,
      totalResults: response.data?.totalResultCount || 0,
      deals: response.data?.itineraries?.map(deal => ({
        id: deal.id,
        origin: {
          code: deal.source?.code || 'N/A',
          name: deal.source?.name || 'N/A',
          city: deal.source?.city?.name || 'N/A',
          country: deal.source?.city?.country?.name || 'India'
        },
        destination: {
          code: deal.destination?.code || 'N/A',
          name: deal.destination?.name || 'N/A',
          city: deal.destination?.city?.name || 'N/A',
          country: deal.destination?.city?.country?.name || 'India'
        },
        departure: formatToIndianDateTime(deal.departureTime),
        arrival: formatToIndianDateTime(deal.arrivalTime),
        duration: formatDuration(deal.duration),
        price: {
          amount: formatToIndianCurrency(deal.price?.amount, deal.price?.currency),
          originalAmount: deal.price?.amount,
          originalCurrency: deal.price?.currency || 'USD',
          convertedAmount: convertToINR(deal.price?.amount, deal.price?.currency) || 0,
          currency: 'INR'
        },
        airline: deal.legs?.[0]?.carrier?.name || 'N/A',
        flightNumber: deal.legs?.[0]?.flightNumber || 'N/A',
        stops: deal.legs?.[0]?.stopCount || 0,
        stopInfo: deal.legs?.[0]?.stopCount === 0 ? 'Non-stop' : 
                 `${deal.legs?.[0]?.stopCount} ${deal.legs?.[0]?.stopCount === 1 ? 'stop' : 'stops'}`,
        deepLink: deal.deeplink || '#'
      })) || []
    };

    res.json(formattedResponse);
  } catch (error) {
    console.error('Error fetching flight data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch flight data',
      details: error.message 
    });
  }
});

// Natural language query endpoint
app.post('/ask', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ 
        status: false, 
        message: 'Query is required' 
      });
    }

    const lowerQuery = query.toLowerCase();
    
    // Handle flight-related queries
    if (lowerQuery.includes('flight')) {
      if (lowerQuery.includes('delayed')) {
        const delayedFlights = flights.filter(f => f.status === 'Delayed');
        return res.json({ 
          status: true, 
          message: 'Here are the delayed flights:', 
          data: delayedFlights 
        });
      }
      return res.json({ 
        status: true, 
        message: 'Here are the available flights:', 
        data: flights 
      });
    }
    
    // Handle train-related queries
    if (lowerQuery.includes('train')) {
      const fromMatch = lowerQuery.match(/from\s+(\w+)/);
      const toMatch = lowerQuery.match(/to\s+(\w+)/);
      
      if (fromMatch && toMatch) {
        const from = fromMatch[1].toUpperCase();
        const to = toMatch[1].toUpperCase();
        
        try {
          const trains = await getTrainsBetweenStations(from, to);
          return res.json({
            status: true,
            message: `Here are the trains from ${from} to ${to}:`,
            data: trains
          });
        } catch (error) {
          console.error('Error fetching trains:', error);
          return res.status(500).json({
            status: false,
            message: 'Failed to fetch train information',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
          });
        }
      }
      
      return res.json({
        status: true,
        message: 'Please specify source and destination stations, e.g., "trains from delhi to mumbai"',
        data: []
      });
    }
    
    res.json({ 
      status: true, 
      message: 'I can help you with flight and train information. Try asking about trains or flights.',
      data: []
    });
    
  } catch (error) {
    console.error('Error in /ask endpoint:', error);
    res.status(500).json({
      status: false,
      message: 'An error occurred while processing your request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

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
