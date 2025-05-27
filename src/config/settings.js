/**
 * Global Settings Configuration
 * 
 * Loads configuration from environment variables with sensible defaults.
 * All settings are centralized here for easy management.
 */

import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config()

// Helper function to parse boolean environment variables
const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined) return defaultValue
  return value.toLowerCase() === 'true'
}

// Helper function to parse integer environment variables
const parseInteger = (value, defaultValue = 0) => {
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

// Helper function to parse comma-separated lists
const parseList = (value, defaultValue = []) => {
  if (!value) return defaultValue
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

export const SETTINGS = {
  // Redis Configuration
  REDIS: {
    URL: process.env.REDIS_URL || 'redis://localhost:6379',
    PASSWORD: process.env.REDIS_PASSWORD || '',
    DB: parseInteger(process.env.REDIS_DB, 0),
    RETRY_ATTEMPTS: parseInteger(process.env.REDIS_RETRY_ATTEMPTS, 3),
    RETRY_DELAY: parseInteger(process.env.REDIS_RETRY_DELAY, 1000)
  },

  // Proxy Configuration
  PROXY: {
    LIST: parseList(process.env.PROXY_LIST),
    ROTATION_ENABLED: parseBoolean(process.env.PROXY_ROTATION_ENABLED, true),
    TIMEOUT: parseInteger(process.env.PROXY_TIMEOUT, 30000),
    MAX_RETRIES: parseInteger(process.env.PROXY_MAX_RETRIES, 3),
    HEALTH_CHECK_INTERVAL: parseInteger(process.env.PROXY_HEALTH_CHECK_INTERVAL, 300000) // 5 minutes
  },

  // Rate Limiting
  RATE_LIMITING: {
    REQUESTS_PER_MINUTE: parseInteger(process.env.REQUESTS_PER_MINUTE, 60),
    BURST_LIMIT: parseInteger(process.env.BURST_LIMIT, 10),
    CONCURRENT_REQUESTS: parseInteger(process.env.CONCURRENT_REQUESTS, 5),
    REQUEST_DELAY_MS: parseInteger(process.env.REQUEST_DELAY_MS, 1000),
    RANDOMIZE_DELAYS: parseBoolean(process.env.RANDOMIZE_DELAYS, true)
  },

  // API Configuration
  API: {
    BASE_URL: process.env.BLUESKY_API_BASE || 'https://public.api.bsky.app',
    USER_AGENT: process.env.USER_AGENT || 'BlueskyResearchBot/1.0',
    REQUEST_TIMEOUT: parseInteger(process.env.REQUEST_TIMEOUT, 30000),
    KEEP_ALIVE: parseBoolean(process.env.KEEP_ALIVE, true),
    MAX_SOCKETS: parseInteger(process.env.MAX_SOCKETS, 50),
    MAX_FREE_SOCKETS: parseInteger(process.env.MAX_FREE_SOCKETS, 10)
  },

  // Output Configuration
  OUTPUT: {
    DIR: process.env.OUTPUT_DIR || './data',
    CHECKPOINT_INTERVAL: parseInteger(process.env.CHECKPOINT_INTERVAL, 1000),
    MAX_FILE_SIZE_MB: parseInteger(process.env.MAX_FILE_SIZE_MB, 100),
    COMPRESS_OUTPUT: parseBoolean(process.env.COMPRESS_OUTPUT, false),
    STREAM_OUTPUT: parseBoolean(process.env.STREAM_OUTPUT, false)
  },

  // Logging Configuration
  LOGGING: {
    LEVEL: process.env.LOG_LEVEL || 'info',
    FILE: process.env.LOG_FILE || './data/logs/scraper.log',
    MAX_SIZE: process.env.LOG_MAX_SIZE || '10m',
    MAX_FILES: parseInteger(process.env.LOG_MAX_FILES, 5),
    CONSOLE_LOG: parseBoolean(process.env.CONSOLE_LOG, true),
    VERBOSE: parseBoolean(process.env.VERBOSE_LOGGING, false)
  },

  // Scraper Targets
  TARGETS: {
    DAILY_USERS: parseInteger(process.env.DAILY_USER_TARGET, 500000),
    DAILY_POSTS: parseInteger(process.env.DAILY_POST_TARGET, 1000000),
    MAX_FOLLOWERS_PER_USER: parseInteger(process.env.MAX_FOLLOWERS_PER_USER, 10000),
    MAX_FOLLOWING_PER_USER: parseInteger(process.env.MAX_FOLLOWING_PER_USER, 10000)
  },

  // Discovery Configuration
  DISCOVERY: {
    HASHTAGS: parseList(process.env.HASHTAGS_TO_SEARCH, [
      'ai', 'tech', 'science', 'art', 'music', 'news', 'politics', 'sports'
    ]),
    SEARCH_TERMS: parseList(process.env.SEARCH_TERMS, [
      'bluesky', 'atproto', 'decentralized', 'social'
    ]),
    MAX_SEARCH_RESULTS: parseInteger(process.env.MAX_SEARCH_RESULTS, 1000)
  },

  // Performance Configuration
  PERFORMANCE: {
    BATCH_SIZE: parseInteger(process.env.BATCH_SIZE, 100),
    MEMORY_LIMIT_MB: parseInteger(process.env.MEMORY_LIMIT_MB, 2048),
    GC_INTERVAL: parseInteger(process.env.GC_INTERVAL, 10000),
    MAX_CONCURRENT_OPERATIONS: parseInteger(process.env.MAX_CONCURRENT_OPERATIONS, 10)
  },

  // Error Handling
  ERROR_HANDLING: {
    MAX_RETRIES: parseInteger(process.env.MAX_RETRIES, 3),
    RETRY_DELAY_MS: parseInteger(process.env.RETRY_DELAY_MS, 5000),
    EXPONENTIAL_BACKOFF: parseBoolean(process.env.EXPONENTIAL_BACKOFF, true),
    CIRCUIT_BREAKER_THRESHOLD: parseInteger(process.env.CIRCUIT_BREAKER_THRESHOLD, 10),
    CIRCUIT_BREAKER_TIMEOUT: parseInteger(process.env.CIRCUIT_BREAKER_TIMEOUT, 60000)
  },

  // Security Configuration
  SECURITY: {
    RESPECT_ROBOTS_TXT: parseBoolean(process.env.RESPECT_ROBOTS_TXT, true),
    MIN_REQUEST_INTERVAL: parseInteger(process.env.MIN_REQUEST_INTERVAL, 500),
    MAX_CONCURRENT_DOMAINS: parseInteger(process.env.MAX_CONCURRENT_DOMAINS, 3),
    USER_AGENT_ROTATION: parseBoolean(process.env.USER_AGENT_ROTATION, false)
  },

  // Development Configuration
  DEVELOPMENT: {
    DEBUG_MODE: parseBoolean(process.env.DEBUG_MODE, false),
    DRY_RUN: parseBoolean(process.env.DRY_RUN, false),
    SAMPLE_SIZE: parseInteger(process.env.SAMPLE_SIZE, 100),
    ENABLE_PROFILING: parseBoolean(process.env.ENABLE_PROFILING, false)
  },

  // Monitoring Configuration
  MONITORING: {
    ENABLE_METRICS: parseBoolean(process.env.ENABLE_METRICS, true),
    METRICS_PORT: parseInteger(process.env.METRICS_PORT, 3001),
    HEALTH_CHECK_INTERVAL: parseInteger(process.env.HEALTH_CHECK_INTERVAL, 60000),
    STATS_INTERVAL: parseInteger(process.env.STATS_INTERVAL, 30000)
  },

  // Data Validation Configuration
  DATA_VALIDATION: {
    VALIDATE_SCHEMAS: parseBoolean(process.env.VALIDATE_SCHEMAS, true),
    CLEAN_DATA: parseBoolean(process.env.CLEAN_DATA, true),
    REMOVE_DUPLICATES: parseBoolean(process.env.REMOVE_DUPLICATES, true),
    BLOOM_FILTER_SIZE: parseInteger(process.env.BLOOM_FILTER_SIZE, 1000000),
    BLOOM_FILTER_ERROR_RATE: parseFloat(process.env.BLOOM_FILTER_ERROR_RATE) || 0.01
  },

  // Checkpoint Configuration
  CHECKPOINT: {
    AUTO_CHECKPOINT: parseBoolean(process.env.AUTO_CHECKPOINT, true),
    CHECKPOINT_FREQUENCY: parseInteger(process.env.CHECKPOINT_FREQUENCY, 5),
    RESUME_ON_START: parseBoolean(process.env.RESUME_ON_START, true),
    BACKUP_CHECKPOINTS: parseBoolean(process.env.BACKUP_CHECKPOINTS, true),
    MAX_CHECKPOINT_AGE: parseInteger(process.env.MAX_CHECKPOINT_AGE, 86400000) // 24 hours
  },

  // Network Configuration
  NETWORK: {
    DNS_TIMEOUT: parseInteger(process.env.DNS_TIMEOUT, 5000),
    CONNECTION_TIMEOUT: parseInteger(process.env.CONNECTION_TIMEOUT, 10000),
    SOCKET_TIMEOUT: parseInteger(process.env.SOCKET_TIMEOUT, 30000),
    MAX_REDIRECTS: parseInteger(process.env.MAX_REDIRECTS, 5)
  }
}

// Validation function to check required settings
export const validateSettings = () => {
  const errors = []

  // Check Redis URL format
  if (!SETTINGS.REDIS.URL.startsWith('redis://')) {
    errors.push('REDIS_URL must start with redis://')
  }

  // Check output directory
  if (!SETTINGS.OUTPUT.DIR) {
    errors.push('OUTPUT_DIR must be specified')
  }

  // Check API base URL
  if (!SETTINGS.API.BASE_URL.startsWith('https://')) {
    errors.push('BLUESKY_API_BASE must be a valid HTTPS URL')
  }

  // Check rate limiting values
  if (SETTINGS.RATE_LIMITING.REQUESTS_PER_MINUTE <= 0) {
    errors.push('REQUESTS_PER_MINUTE must be greater than 0')
  }

  // Check batch size
  if (SETTINGS.PERFORMANCE.BATCH_SIZE <= 0) {
    errors.push('BATCH_SIZE must be greater than 0')
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`)
  }

  return true
}

// Environment-specific configurations
export const getEnvironmentConfig = () => {
  const env = process.env.NODE_ENV || 'development'
  
  const configs = {
    development: {
      RATE_LIMITING: {
        ...SETTINGS.RATE_LIMITING,
        REQUESTS_PER_MINUTE: 30 // Lower rate limit for development
      },
      TARGETS: {
        ...SETTINGS.TARGETS,
        DAILY_USERS: 1000, // Smaller targets for development
        DAILY_POSTS: 5000
      }
    },
    
    production: {
      LOGGING: {
        ...SETTINGS.LOGGING,
        LEVEL: 'warn', // Less verbose logging in production
        CONSOLE_LOG: false
      },
      DEVELOPMENT: {
        ...SETTINGS.DEVELOPMENT,
        DEBUG_MODE: false,
        DRY_RUN: false
      }
    },
    
    test: {
      REDIS: {
        ...SETTINGS.REDIS,
        DB: 15 // Use different Redis DB for tests
      },
      TARGETS: {
        ...SETTINGS.TARGETS,
        DAILY_USERS: 10,
        DAILY_POSTS: 50
      },
      DEVELOPMENT: {
        ...SETTINGS.DEVELOPMENT,
        DRY_RUN: true
      }
    }
  }

  return {
    ...SETTINGS,
    ...configs[env]
  }
}

// Export the final configuration
export default getEnvironmentConfig() 