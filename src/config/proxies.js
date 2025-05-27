/**
 * Proxy Configuration
 * 
 * Configuration and validation for proxy settings
 */

import SETTINGS from './settings.js'

/**
 * Proxy types supported
 */
export const PROXY_TYPES = {
  HTTP: 'http',
  HTTPS: 'https',
  SOCKS4: 'socks4',
  SOCKS5: 'socks5'
}

/**
 * Default proxy configuration
 */
export const DEFAULT_PROXY_CONFIG = {
  timeout: 30000,
  maxRetries: 3,
  healthCheckInterval: 300000, // 5 minutes
  rotationEnabled: true,
  failoverEnabled: true
}

/**
 * Proxy validation rules
 */
export const PROXY_VALIDATION = {
  minTimeout: 5000,
  maxTimeout: 120000,
  maxRetries: 10,
  requiredFields: ['host', 'port']
}

/**
 * Parse proxy string into structured format
 * @param {string} proxyString - Proxy string in various formats
 * @returns {Object|null} Parsed proxy object or null if invalid
 */
export function parseProxyString(proxyString) {
  if (!proxyString || typeof proxyString !== 'string') {
    return null
  }

  try {
    // Handle URL format: protocol://username:password@host:port
    if (proxyString.includes('://')) {
      const url = new URL(proxyString)
      
      return {
        type: url.protocol.replace(':', ''),
        host: url.hostname,
        port: parseInt(url.port, 10),
        username: url.username || null,
        password: url.password || null,
        auth: url.username && url.password ? `${url.username}:${url.password}` : null,
        url: proxyString
      }
    }

    // Handle colon-separated format: host:port:username:password
    const parts = proxyString.split(':')
    
    if (parts.length === 2) {
      // host:port
      return {
        type: PROXY_TYPES.HTTP,
        host: parts[0],
        port: parseInt(parts[1], 10),
        username: null,
        password: null,
        auth: null,
        url: `http://${parts[0]}:${parts[1]}`
      }
    } else if (parts.length === 4) {
      // host:port:username:password
      return {
        type: PROXY_TYPES.HTTP,
        host: parts[0],
        port: parseInt(parts[1], 10),
        username: parts[2],
        password: parts[3],
        auth: `${parts[2]}:${parts[3]}`,
        url: `http://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`
      }
    }

    return null

  } catch (error) {
    return null
  }
}

/**
 * Validate proxy configuration
 * @param {Object} proxy - Proxy configuration object
 * @returns {Object} Validation result with isValid and errors
 */
export function validateProxy(proxy) {
  const errors = []

  if (!proxy || typeof proxy !== 'object') {
    return { isValid: false, errors: ['Proxy must be an object'] }
  }

  // Check required fields
  for (const field of PROXY_VALIDATION.requiredFields) {
    if (!proxy[field]) {
      errors.push(`Missing required field: ${field}`)
    }
  }

  // Validate host
  if (proxy.host && typeof proxy.host !== 'string') {
    errors.push('Host must be a string')
  }

  // Validate port
  if (proxy.port) {
    const port = parseInt(proxy.port, 10)
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('Port must be a number between 1 and 65535')
    }
  }

  // Validate type
  if (proxy.type && !Object.values(PROXY_TYPES).includes(proxy.type)) {
    errors.push(`Invalid proxy type. Must be one of: ${Object.values(PROXY_TYPES).join(', ')}`)
  }

  // Validate timeout if provided
  if (proxy.timeout) {
    const timeout = parseInt(proxy.timeout, 10)
    if (isNaN(timeout) || timeout < PROXY_VALIDATION.minTimeout || timeout > PROXY_VALIDATION.maxTimeout) {
      errors.push(`Timeout must be between ${PROXY_VALIDATION.minTimeout} and ${PROXY_VALIDATION.maxTimeout}`)
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Load and parse proxy list from settings
 * @returns {Array} Array of parsed proxy objects
 */
export function loadProxyList() {
  const proxyList = SETTINGS.PROXY.LIST || []
  const proxies = []

  for (const proxyString of proxyList) {
    const parsed = parseProxyString(proxyString)
    
    if (parsed) {
      const validation = validateProxy(parsed)
      
      if (validation.isValid) {
        proxies.push({
          ...DEFAULT_PROXY_CONFIG,
          ...parsed,
          id: generateProxyId(parsed),
          isHealthy: true,
          lastChecked: null,
          consecutiveFailures: 0,
          stats: {
            requests: 0,
            successes: 0,
            failures: 0,
            avgResponseTime: 0
          }
        })
      } else {
        console.warn(`Invalid proxy configuration: ${proxyString}`, validation.errors)
      }
    } else {
      console.warn(`Failed to parse proxy string: ${proxyString}`)
    }
  }

  return proxies
}

/**
 * Generate unique ID for proxy
 * @param {Object} proxy - Proxy object
 * @returns {string} Unique proxy ID
 */
export function generateProxyId(proxy) {
  const identifier = `${proxy.type}://${proxy.host}:${proxy.port}`
  return Buffer.from(identifier).toString('base64').substring(0, 12)
}

/**
 * Mask proxy credentials for logging
 * @param {Object} proxy - Proxy object
 * @returns {Object} Proxy object with masked credentials
 */
export function maskProxyCredentials(proxy) {
  if (!proxy) return null

  return {
    ...proxy,
    username: proxy.username ? '***' : null,
    password: proxy.password ? '***' : null,
    auth: proxy.auth ? '***' : null,
    url: proxy.url ? proxy.url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@') : null
  }
}

/**
 * Get proxy statistics summary
 * @param {Array} proxies - Array of proxy objects
 * @returns {Object} Statistics summary
 */
export function getProxyStats(proxies) {
  if (!Array.isArray(proxies)) {
    return { total: 0, healthy: 0, unhealthy: 0, successRate: 0 }
  }

  const total = proxies.length
  const healthy = proxies.filter(p => p.isHealthy).length
  const unhealthy = total - healthy

  const totalRequests = proxies.reduce((sum, p) => sum + (p.stats?.requests || 0), 0)
  const totalSuccesses = proxies.reduce((sum, p) => sum + (p.stats?.successes || 0), 0)
  const successRate = totalRequests > 0 ? (totalSuccesses / totalRequests * 100) : 0

  return {
    total,
    healthy,
    unhealthy,
    successRate: parseFloat(successRate.toFixed(2)),
    totalRequests,
    totalSuccesses,
    avgResponseTime: proxies.reduce((sum, p) => sum + (p.stats?.avgResponseTime || 0), 0) / total || 0
  }
}

/**
 * Filter proxies by criteria
 * @param {Array} proxies - Array of proxy objects
 * @param {Object} criteria - Filter criteria
 * @returns {Array} Filtered proxy array
 */
export function filterProxies(proxies, criteria = {}) {
  if (!Array.isArray(proxies)) {
    return []
  }

  return proxies.filter(proxy => {
    // Filter by health status
    if (criteria.healthyOnly && !proxy.isHealthy) {
      return false
    }

    // Filter by proxy type
    if (criteria.type && proxy.type !== criteria.type) {
      return false
    }

    // Filter by minimum success rate
    if (criteria.minSuccessRate) {
      const successRate = proxy.stats.requests > 0 
        ? (proxy.stats.successes / proxy.stats.requests * 100) 
        : 0
      
      if (successRate < criteria.minSuccessRate) {
        return false
      }
    }

    // Filter by maximum consecutive failures
    if (criteria.maxConsecutiveFailures && proxy.consecutiveFailures > criteria.maxConsecutiveFailures) {
      return false
    }

    return true
  })
}

/**
 * Sort proxies by performance
 * @param {Array} proxies - Array of proxy objects
 * @param {string} sortBy - Sort criteria ('successRate', 'responseTime', 'requests')
 * @returns {Array} Sorted proxy array
 */
export function sortProxies(proxies, sortBy = 'successRate') {
  if (!Array.isArray(proxies)) {
    return []
  }

  return [...proxies].sort((a, b) => {
    switch (sortBy) {
      case 'successRate':
        const aRate = a.stats.requests > 0 ? (a.stats.successes / a.stats.requests) : 0
        const bRate = b.stats.requests > 0 ? (b.stats.successes / b.stats.requests) : 0
        return bRate - aRate // Descending order

      case 'responseTime':
        return a.stats.avgResponseTime - b.stats.avgResponseTime // Ascending order

      case 'requests':
        return b.stats.requests - a.stats.requests // Descending order

      default:
        return 0
    }
  })
}

/**
 * Create proxy URL string
 * @param {Object} proxy - Proxy object
 * @returns {string} Proxy URL string
 */
export function createProxyUrl(proxy) {
  if (!proxy || !proxy.host || !proxy.port) {
    throw new Error('Invalid proxy configuration')
  }

  const protocol = proxy.type || PROXY_TYPES.HTTP
  const auth = proxy.username && proxy.password ? `${proxy.username}:${proxy.password}@` : ''
  
  return `${protocol}://${auth}${proxy.host}:${proxy.port}`
}

export default {
  PROXY_TYPES,
  DEFAULT_PROXY_CONFIG,
  PROXY_VALIDATION,
  parseProxyString,
  validateProxy,
  loadProxyList,
  generateProxyId,
  maskProxyCredentials,
  getProxyStats,
  filterProxies,
  sortProxies,
  createProxyUrl
} 