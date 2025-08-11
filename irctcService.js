import https from 'https';
import 'dotenv/config';

// Configuration
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '4de48af65amsh68e3080b6e8897ap1c3511jsn79a3a35bbc97';
const RAPIDAPI_HOST = 'irctc1.p.rapidapi.com';
const REQUEST_TIMEOUT = 10000; // 10 seconds

// Rate limiting
const rateLimit = {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    requestCount: 0,
    lastReset: Date.now(),
    checkRateLimit() {
        const now = Date.now();
        if (now - this.lastReset > this.windowMs) {
            this.requestCount = 0;
            this.lastReset = now;
        }
        
        if (this.requestCount >= this.maxRequests) {
            const error = new Error('Rate limit exceeded');
            error.code = 'RATE_LIMIT_EXCEEDED';
            error.retryAfter = Math.ceil((this.lastReset + this.windowMs - now) / 1000);
            throw error;
        }
        
        this.requestCount++;
        return true;
    }
};

// Validate inputs
const validateInputs = (params, requiredFields = []) => {
    const errors = [];
    
    requiredFields.forEach(field => {
        if (!params[field]) {
            errors.push(`Missing required field: ${field}`);
        } else if (typeof params[field] !== 'string' || params[field].trim() === '') {
            errors.push(`Invalid value for field: ${field}`);
        }
    });
    
    if (errors.length > 0) {
        const error = new Error('Validation failed');
        error.code = 'VALIDATION_ERROR';
        error.details = errors;
        throw error;
    }
};

// Make HTTP request with timeout and error handling
const makeRequest = async (path, params = {}) => {
    // Check rate limit
    rateLimit.checkRateLimit();
    
    return new Promise((resolve, reject) => {
        const queryString = new URLSearchParams(params).toString();
        const url = `${path}${queryString ? `?${queryString}` : ''}`;
        
        console.log(`[IRCTC API] Making request to: ${url}`);
        
        const options = {
            method: 'GET',
            hostname: RAPIDAPI_HOST,
            path: url,
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': RAPIDAPI_HOST,
                'Accept': 'application/json'
            },
            timeout: REQUEST_TIMEOUT
        };

        const requestTimer = setTimeout(() => {
            req.destroy(new Error('Request timeout'));
        }, REQUEST_TIMEOUT);

        const req = https.request(options, (res) => {
            const chunks = [];
            let responseData;
            
            res.on('data', (chunk) => chunks.push(chunk));
            
            res.on('end', () => {
                clearTimeout(requestTimer);
                
                try {
                    const rawData = Buffer.concat(chunks).toString();
                    responseData = JSON.parse(rawData);
                    
                    console.log(`[IRCTC API] Response status: ${res.statusCode}`, 
                               `\nURL: ${url}`,
                               `\nResponse: ${rawData.substring(0, 500)}...`);
                    
                    if (res.statusCode >= 400) {
                        const error = new Error(responseData.message || 'API request failed');
                        error.statusCode = res.statusCode;
                        error.response = responseData;
                        throw error;
                    }
                    
                    resolve({
                        status: 'success',
                        data: responseData,
                        meta: {
                            timestamp: new Date().toISOString(),
                            path,
                            params
                        }
                    });
                } catch (error) {
                    console.error('[IRCTC API] Response parsing error:', error);
                    reject({
                        status: 'error',
                        code: 'INVALID_RESPONSE',
                        message: 'Failed to parse API response',
                        details: error.message
                    });
                }
            });
        });

        req.on('error', (error) => {
            clearTimeout(requestTimer);
            console.error('[IRCTC API] Request error:', error);
            reject({
                status: 'error',
                code: error.code || 'REQUEST_ERROR',
                message: 'Failed to make API request',
                details: error.message
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error('Request timeout'));
        });

        req.end();
    });
};

// Search for station by code or name
const searchStation = async (query) => {
    try {
        validateInputs({ query }, ['query']);
        return await makeRequest('/api/v1/searchStation', { query });
    } catch (error) {
        console.error('Error in searchStation:', error);
        throw error;
    }
};

// Search for train by number or name
const searchTrain = async (query) => {
    try {
        validateInputs({ query }, ['query']);
        return await makeRequest('/api/v1/searchTrain', { query });
    } catch (error) {
        console.error('Error in searchTrain:', error);
        throw error;
    }
};

// Get trains between two stations
const getTrainsBetweenStations = async (fromStationCode, toStationCode, date = new Date()) => {
    try {
        validateInputs({ fromStationCode, toStationCode }, ['fromStationCode', 'toStationCode']);
        
        // Format date as YYYYMMDD (required by IRCTC API)
        const formattedDate = new Date(date).toISOString().split('T')[0].replace(/-/g, '');
        
        return await makeRequest('/api/v3/trainBetweenStations', { 
            fromStationCode, 
            toStationCode,
            date: formattedDate
        });
    } catch (error) {
        console.error('Error in getTrainsBetweenStations:', error);
        throw error;
    }
};

// Get PNR status
const getPNRStatus = async (pnrNumber) => {
    try {
        validateInputs({ pnrNumber }, ['pnrNumber']);
        return await makeRequest('/api/v3/getPNRStatus', { pnrNumber });
    } catch (error) {
        console.error('Error in getPNRStatus:', error);
        throw error;
    }
};

// Get train schedule
const getTrainSchedule = async (trainNo) => {
    try {
        validateInputs({ trainNo }, ['trainNo']);
        return await makeRequest('/api/v1/getTrainSchedule', { trainNo });
    } catch (error) {
        console.error('Error in getTrainSchedule:', error);
        throw error;
    }
};

// Check seat availability
const checkSeatAvailability = async (trainNo, fromStationCode, toStationCode, classType = '3A', quota = 'GN') => {
    try {
        validateInputs(
            { trainNo, fromStationCode, toStationCode, classType, quota },
            ['trainNo', 'fromStationCode', 'toStationCode']
        );
        
        return await makeRequest('/api/v1/checkSeatAvailability', {
            trainNo,
            fromStationCode,
            toStationCode,
            classType,
            quota
        });
    } catch (error) {
        console.error('Error in checkSeatAvailability:', error);
        throw error;
    }
};

export {
    searchStation,
    searchTrain,
    getTrainsBetweenStations,
    getPNRStatus,
    getTrainSchedule,
    checkSeatAvailability
};
