# Flight & Train Information API

A comprehensive Node.js API that provides real-time flight and train information with IRCTC API integration.

## Features

- **Flight Information**
  - Get flight deals with real-time pricing
  - Flight search with filters
  - Currency conversion to INR

- **Train Information (via IRCTC API)**
  - Train search between stations
  - Train schedule
  - Seat availability
  - PNR status
  - Station search

- **Additional Features**
  - Natural language query endpoint
  - Health check endpoint
  - CORS enabled
  - Environment variable configuration
  - Error handling and logging

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=3000
   RAPIDAPI_KEY=your_rapidapi_key_here
   ```
4. Start the server:
   ```bash
   npm start
   ```
   For development with auto-reload:
   ```bash
   npm run dev
   ```

## API Endpoints

### Health Check
- `GET /health` - Check if the API is running

### Flight Endpoints
- `GET /flights` - Get all sample flights
- `GET /api/flights/search` - Search for flights with filters
- `GET /api/flights/deals` - Get flight deals

### Train Endpoints
- `GET /api/trains/stations?query={station_name}` - Search for stations
- `GET /api/trains/between-stations?from={from_code}&to={to_code}&date={YYYY-MM-DD}` - Get trains between stations
- `GET /api/trains/schedule/:trainNo` - Get train schedule
- `GET /api/trains/check-availability?trainNo={train_no}&from={from_code}&to={to_code}&class={class}&quota={quota}` - Check seat availability
- `GET /api/trains/pnr/:pnr` - Get PNR status

### Natural Language Query
- `POST /ask` - Natural language query endpoint

## Example Requests

### Flight Search
```bash
# Search for flights from Delhi to Mumbai
curl "http://localhost:3000/api/flights/search?from=DEL&to=BOM&date=2023-12-25"
```

### Flight Deals
```bash
# Get flight deals from Delhi to Mumbai
curl "http://localhost:3000/api/flights/deals?origin=DEL&destination=BOM&departureDate=2023-12-25"
```

### Train Station Search
```bash
# Search for train stations with 'delhi' in the name
curl "http://localhost:3000/api/trains/stations?query=delhi"
```

### Train Search
```bash
# Get trains between New Delhi (NDLS) and Mumbai (BCT)
curl "http://localhost:3000/api/trains/between-stations?from=NDLS&to=BCT&date=2023-12-25"
```

### Natural Language Query
```bash
# Ask a question about flights or trains
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"query":"Show me trains from Delhi to Mumbai tomorrow"}'
```

## Error Handling

All API endpoints return JSON responses with the following structure:

```json
{
  "status": false,
  "message": "Error message describing the issue",
  "error": "Detailed error information (in development)"
}
```

Error responses include an HTTP status code and a descriptive message.

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| PORT | Port to run the server on | No | 3000 |
| RAPIDAPI_KEY | Your RapidAPI key for IRCTC API | Yes | - |
| NODE_ENV | Node environment (development/production) | No | development |

## License

MIT
