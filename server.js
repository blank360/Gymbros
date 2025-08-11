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

// Custom JSON parser with better error handling
app.use(express.json({
  verify: (req, res, buf, encoding) => {
    try {
      if (buf && buf.length) {
        JSON.parse(buf.toString(encoding || 'utf8'));
      }
    } catch (e) {
      console.error('JSON parse error:', e);
      throw new Error('Invalid JSON payload');
    }
  }
}));

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  if (Object.keys(req.body).length > 0) {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// MCP endpoint handler
app.post('/mcp', express.text({ type: '*/*' }), (req, res) => {
  try {
    console.log('Raw MCP request body:', req.body);
    
    // Try to parse the body as JSON if it's a string
    let payload;
    if (typeof req.body === 'string') {
      try {
        // Remove any escaping of quotes
        const cleanBody = req.body.replace(/\\"/g, '"');
        payload = JSON.parse(cleanBody);
      } catch (e) {
        console.error('Failed to parse MCP request as JSON:', e);
        return res.status(400).json({
          status: 'error',
          message: 'Invalid MCP request format',
          details: e.message
        });
      }
    } else {
      payload = req.body;
    }

    console.log('Parsed MCP payload:', payload);
    
    // Process the MCP request here
    // Example response - replace with your MCP logic
    res.json({
      status: 'success',
      message: 'MCP request received',
      received: payload
    });
    
  } catch (error) {
    console.error('MCP handler error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process MCP request',
      error: error.message
    });
  }
});

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
    message: 'Welcome to the Flight & Train Info API',
    documentation: {
      health: '/health',
      auth: {
        verify: 'GET /api/auth/verify (requires Bearer token)'
      },
      trains: {
        searchStations: 'GET /api/trains/stations?query=:query',
        betweenStations: 'GET /api/trains/between-stations?from=:from&to=:to&date=YYYY-MM-DD',
        pnrStatus: 'GET /api/trains/pnr/:pnr',
        trainSchedule: 'GET /api/trains/schedule/:trainNumber',
        trainsByStation: 'GET /api/trains/station/:stationCode',
        seatAvailability: 'GET /api/trains/availability?train=:trainNumber&from=:from&to=:to&class=:class&quota=:quota&date=YYYY-MM-DD'
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Service is running' });
});

// Get all flights
app.get('/flights', (req, res) => {
  res.json(flights);
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

// Get all trains (redirects to train search endpoint)
app.get('/trains', (req, res) => {
  res.redirect('/api/trains/between-stations');
});

// Get train between stations
app.get('/api/trains/search', async (req, res) => {
  const { from, to, date, class: travelClass, quota } = req.query;
  
  if (!from || !to) {
    return res.status(400).json({ 
      status: false, 
      message: 'Please provide both source (from) and destination (to) stations' 
    });
  }

  try {
    searchTrains(from, to, date, (error, trains) => {
      if (error) {
        console.error('Train search error:', error);
        return res.status(500).json({ 
          status: false, 
          message: 'Failed to fetch train data',
          error: error.message 
        });
      }

      // Filter by class if specified
      let filteredTrains = trains;
      if (travelClass) {
        filteredTrains = trains.filter(train => 
          train.classes.map(c => c.toLowerCase()).includes(travelClass.toLowerCase())
        );
      }

      res.json({
        status: true,
        searchParams: { from, to, date: date || new Date().toISOString().split('T')[0], class: travelClass, quota },
        totalResults: filteredTrains.length,
        trains: filteredTrains
      });
    });
  } catch (error) {
    console.error('Train search error:', error);
    res.status(500).json({ 
      status: false, 
      message: 'Failed to fetch train data',
      error: error.message 
    });
  }
});

// Get train schedule
app.get('/api/trains/schedule/:trainNumber', (req, res) => {
  const { trainNumber } = req.params;
  const { date } = req.query;
  
  // In a real implementation, you would fetch the train schedule from IRCTC API
  const train = sampleTrains.find(t => t.trainNumber === trainNumber);
  
  if (!train) {
    return res.status(404).json({ 
      status: false, 
      message: 'Train not found' 
    });
  }

  // Sample schedule data
  const schedule = [
    { station: train.from, code: train.fromCode, day: 1, arrival: '-', departure: train.departureTime, distance: '0 km', halt: '-', platform: '1' },
    { station: 'Cuttack', code: 'CTC', day: 1, arrival: '21:15', departure: '21:20', distance: '30 km', halt: '5 min', platform: '2' },
    { station: 'Sambalpur', code: 'SBP', day: 2, arrival: '02:30', departure: '02:40', distance: '325 km', halt: '10 min', platform: '3' },
    { station: 'Jharsuguda', code: 'JSG', day: 2, arrival: '04:15', departure: '04:20', distance: '450 km', halt: '5 min', platform: '2' },
    { station: 'Raipur', code: 'R', day: 2, arrival: '09:30', departure: '09:40', distance: '850 km', halt: '10 min', platform: '1' },
    { station: 'Bhopal', code: 'BPL', day: 2, arrival: '15:45', departure: '15:55', distance: '1300 km', halt: '10 min', platform: '4' },
    { station: train.to, code: train.toCode, day: 2, arrival: train.arrivalTime, departure: '-', distance: train.distance, halt: '-', platform: '8' }
  ];

  res.json({
    status: true,
    trainNumber: train.trainNumber,
    trainName: train.trainName,
    from: train.from,
    fromCode: train.fromCode,
    to: train.to,
    toCode: train.toCode,
    departureTime: train.departureTime,
    arrivalTime: train.arrivalTime,
    duration: train.duration,
    days: train.days,
    classes: train.classes,
    runningStatus: train.runningStatus,
    avgDelay: train.avgDelay,
    distance: train.distance,
    avgSpeed: train.avgSpeed,
    schedule: schedule,
    date: date || new Date().toISOString().split('T')[0]
  });
});

// Get train availability
app.get('/api/trains/availability', (req, res) => {
  const { trainNumber, from, to, date, class: travelClass, quota = 'GN' } = req.query;
  
  if (!trainNumber || !from || !to || !date) {
    return res.status(400).json({ 
      status: false, 
      message: 'Please provide train number, from, to, and date' 
    });
  }

  // In a real implementation, you would fetch availability from IRCTC API
  const train = sampleTrains.find(t => t.trainNumber === trainNumber);
  
  if (!train) {
    return res.status(404).json({ 
      status: false, 
      message: 'Train not found' 
    });
  }

  // Sample availability data
  const availability = {
    trainNumber: train.trainNumber,
    trainName: train.trainName,
    from: from,
    fromCode: stationCodes[from.toLowerCase()] || from.toUpperCase(),
    to: to,
    toCode: stationCodes[to.toLowerCase()] || to.toUpperCase(),
    date: date,
    class: travelClass || 'SL',
    quota: quota,
    availability: {
      'SL': { // Sleeper Class
        available: 120,
        rac: 15,
        waiting: 45,
        lastUpdated: new Date().toISOString()
      },
      '3A': { // AC 3-Tier
        available: 24,
        rac: 0,
        waiting: 12,
        lastUpdated: new Date().toISOString()
      },
      '2A': { // AC 2-Tier
        available: 12,
        rac: 0,
        waiting: 6,
        lastUpdated: new Date().toISOString()
      },
      '1A': { // First AC
        available: 4,
        rac: 0,
        waiting: 2,
        lastUpdated: new Date().toISOString()
      }
    },
    fare: {
      'SL': 850,
      '3A': 2150,
      '2A': 3150,
      '1A': 5350
    },
    lastUpdated: new Date().toISOString()
  };

  // Filter by class if specified
  if (travelClass) {
    const selectedClass = travelClass.toUpperCase();
    if (availability.availability[selectedClass]) {
      availability.availability = { [selectedClass]: availability.availability[selectedClass] };
      availability.fare = { [selectedClass]: availability.fare[selectedClass] };
    }
  }

  res.json({
    status: true,
    data: availability
  });
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
      // Extract station names using a simple regex (this can be enhanced)
      const fromMatch = lowerQuery.match(/from\s+(\w+)/);
      const toMatch = lowerQuery.match(/to\s+(\w+)/);
      
      if (fromMatch && toMatch) {
        const from = fromMatch[1].toUpperCase();
        const to = toMatch[1].toUpperCase();
        
        try {
          const trains = await irctcService.getTrainsBetweenStations(from, to);
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
      
      // If stations not specified, return a helpful message
      return res.json({
        status: true,
        message: 'Please specify source and destination stations, e.g., "trains from delhi to mumbai"',
        data: []
      });
    }
    
    // If the query doesn't match any known patterns
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

// Flight Deals Search Endpoint
app.get('/api/flights/deals', async (req, res) => {
  const { query = 'DEL', limit = '10' } = req.query;
  
  try {
    const options = {
      method: 'GET',
      hostname: 'flights-scraper-real-time.p.rapidapi.com',
      path: `/deals/search?query=${encodeURIComponent(query)}&limit=${limit}`,
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY || '4de48af65amsh68e3080b6e8897ap1c3511jsn79a3a35bbc97',
        'x-rapidapi-host': 'flights-scraper-real-time.p.rapidapi.com'
      }
    };

    const response = await new Promise((resolve, reject) => {
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
        // Add more currencies as needed
      };
      
      const rate = exchangeRates[fromCurrency.toUpperCase()] || 1;
      return Math.round(amount * rate);
    };

    const formatToIndianCurrency = (amount, currency = 'INR') => {
      if (amount === undefined || amount === null) return 'N/A';
      
      // If amount is not in INR, convert it first
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
          currency: 'INR',
          exchangeRate: 87.6427,
          formatted: `${formatToIndianCurrency(deal.price?.amount, deal.price?.currency)}`,
          originalFormatted: deal.price?.amount 
            ? new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: deal.price?.currency || 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
              }).format(deal.price.amount)
            : 'N/A'
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
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
