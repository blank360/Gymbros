import https from 'https';
import 'dotenv/config';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '4de48af65amsh68e3080b6e8897ap1c3511jsn79a3a35bbc97';
const RAPIDAPI_HOST = 'irctc1.p.rapidapi.com';

const makeRequest = (path, params = {}) => {
    return new Promise((resolve, reject) => {
        const queryString = new URLSearchParams(params).toString();
        const url = `${path}${queryString ? `?${queryString}` : ''}`;
        
        const options = {
            method: 'GET',
            hostname: RAPIDAPI_HOST,
            path: url,
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': RAPIDAPI_HOST
            }
        };

        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks);
                try {
                    resolve(JSON.parse(body.toString()));
                } catch (e) {
                    resolve(body.toString());
                }
            });
        });

        req.on('error', (error) => {
            console.error('API Error:', error);
            reject(error);
        });

        req.end();
    });
};

// Search for station by code or name
const searchStation = async (query) => {
    return makeRequest('/api/v1/searchStation', { query });
};

// Search for train by number or name
const searchTrain = async (query) => {
    return makeRequest('/api/v1/searchTrain', { query });
};

// Get trains between two stations
const getTrainsBetweenStations = async (fromStationCode, toStationCode, date = new Date()) => {
    // Format date as YYYYMMDD (required by IRCTC API)
    const formattedDate = new Date(date).toISOString().split('T')[0].replace(/-/g, '');
    
    return makeRequest('/api/v3/trainBetweenStations', { 
        fromStationCode, 
        toStationCode,
        date: formattedDate
    });
};

// Get PNR status
const getPNRStatus = async (pnrNumber) => {
    return makeRequest('/api/v3/getPNRStatus', { pnrNumber });
};

// Get train schedule
const getTrainSchedule = async (trainNo) => {
    return makeRequest('/api/v1/getTrainSchedule', { trainNo });
};

// Get trains by station
const getTrainsByStation = async (stationCode) => {
    return makeRequest('/api/v3/getTrainsByStation', { stationCode });
};

// Check seat availability
const checkSeatAvailability = async (trainNo, fromStationCode, toStationCode, classType = '3A', quota = 'GN') => {
    return makeRequest('/api/v1/checkSeatAvailability', {
        trainNo,
        fromStationCode,
        toStationCode,
        classType,
        quota
    });
};

export {
    searchStation,
    searchTrain,
    getTrainsBetweenStations,
    getPNRStatus,
    getTrainSchedule,
    getTrainsByStation,
    checkSeatAvailability
};
