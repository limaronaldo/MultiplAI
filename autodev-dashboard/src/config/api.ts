// API Configuration

// Base URL for API requests - uses environment variable or defaults to localhost
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// Polling interval for real-time updates (in milliseconds)
export const POLLING_INTERVAL = 5000;
