/**
 * Bluesky AT Protocol API Client
 * 
 * Handles all HTTP requests to Bluesky endpoints with:
 * - Proxy rotation and management
 * - Rate limiting and throttling
 * - Error handling and retries
 * - Request/response logging
 */

import axios from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import UserAgent from 'user-agents'
import pRetry from 'p-retry'
import Bottleneck from 'bottleneck'
import winston from 'winston'

import { ENDPOINTS, RATE_LIMITS, REQUEST_CONFIG, ERROR_CODES } from '../config/endpoints.js'
import SETTINGS from '../config/settings.js'
import ProxyManager from './proxy_manager.js'
import RateLimiter from './rate_limiter.js'

class APIClient {
  constructor(options = {}) {
    this.baseURL = options.baseURL || SETTINGS.API.BASE_URL
    this.timeout = options.timeout || SETTINGS.API.REQUEST_TIMEOUT
    this.userAgent = options.userAgent || SETTINGS.API.USER_AGENT
    this.isInitialized = false
    
    // Initialize components
    this.proxyManager = new ProxyManager()
    this.rateLimiter = new RateLimiter()
    this.userAgentGenerator = new UserAgent()
    
    // Request statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitedRequests: 0,
      proxyFailures: 0,
      averageResponseTime: 0
    }

    // Setup logger
    this.logger = winston.createLogger({
      level: SETTINGS.LOGGING.LEVEL,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ 
          filename: SETTINGS.LOGGING.FILE.replace('scraper.log', 'api_client.log')
        })
      ]
    })

    if (SETTINGS.LOGGING.CONSOLE_LOG) {
      this.logger.add(new winston.transports.Console({
        format: winston.format.simple()
      }))
    }
  }

  /**
   * Initialize API client and proxy manager
   */
  async initialize() {
    if (this.isInitialized) {
      return
    }

    try {
      // Initialize proxy manager with Redis
      await this.proxyManager.initialize()
      
      const proxyCount = await this.proxyManager.getProxyCount()
      
      this.logger.info('API Client initialized', {
        baseURL: this.baseURL,
        timeout: this.timeout,
        proxyCount
      })

      this.isInitialized = true

    } catch (error) {
      this.logger.error('Failed to initialize API client', { error: error.message })
      throw error
    }
  }

  /**
   * Create axios instance with current proxy and configuration
   */
  createAxiosInstance(proxy = null) {
    const config = {
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'User-Agent': SETTINGS.SECURITY.USER_AGENT_ROTATION 
          ? this.userAgentGenerator.toString()
          : this.userAgent,
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive'
      },
      maxRedirects: SETTINGS.NETWORK.MAX_REDIRECTS,
      validateStatus: (status) => status < 500 // Don't throw on 4xx errors
    }

    // Add proxy if provided
    if (proxy) {
      if (proxy.startsWith('socks')) {
        config.httpsAgent = new SocksProxyAgent(proxy)
        config.httpAgent = new SocksProxyAgent(proxy)
      } else {
        config.httpsAgent = new HttpsProxyAgent(proxy)
        config.httpAgent = new HttpsProxyAgent(proxy)
      }
    }

    return axios.create(config)
  }

  /**
   * Make HTTP request with retry logic and error handling
   */
  async makeRequest(endpoint, params = {}, options = {}) {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const startTime = Date.now()
    this.stats.totalRequests++

    const requestConfig = {
      method: options.method || 'GET',
      endpoint,
      params,
      retries: options.retries || SETTINGS.ERROR_HANDLING.MAX_RETRIES,
      timeout: options.timeout || this.timeout
    }

    try {
      // Apply rate limiting
      await this.rateLimiter.waitForSlot(endpoint)

      // Execute request with retry logic
      const response = await pRetry(
        () => this.executeRequest(requestConfig),
        {
          retries: requestConfig.retries,
          factor: SETTINGS.ERROR_HANDLING.EXPONENTIAL_BACKOFF ? 2 : 1,
          minTimeout: SETTINGS.ERROR_HANDLING.RETRY_DELAY_MS,
          maxTimeout: 30000,
          onFailedAttempt: (error) => {
            this.logger.warn('Request attempt failed', {
              endpoint,
              attempt: error.attemptNumber,
              retriesLeft: error.retriesLeft,
              error: error.message
            })
          }
        }
      )

      // Update statistics
      const responseTime = Date.now() - startTime
      this.stats.successfulRequests++
      this.updateAverageResponseTime(responseTime)

      this.logger.debug('Request successful', {
        endpoint,
        responseTime,
        statusCode: response.status,
        dataSize: JSON.stringify(response.data).length
      })

      return response.data

    } catch (error) {
      this.stats.failedRequests++
      this.logger.error('Request failed after all retries', {
        endpoint,
        params,
        error: error.message,
        stack: error.stack
      })
      throw this.normalizeError(error)
    }
  }

  /**
   * Execute single request attempt
   */
  async executeRequest(config) {
    const { endpoint, params, method } = config
    let proxy = null
    let axiosInstance = null

    try {
      // Get random proxy if rotation is enabled
      if (SETTINGS.PROXY.ROTATION_ENABLED && await this.proxyManager.hasProxies()) {
        proxy = await this.proxyManager.getRandomProxy()
        
        if (!proxy) {
          this.logger.warn('No healthy proxies available, making request without proxy')
        }
      }

      // Create axios instance
      axiosInstance = this.createAxiosInstance(proxy)

      // Add random delay if configured
      if (SETTINGS.RATE_LIMITING.RANDOMIZE_DELAYS) {
        const delay = Math.random() * SETTINGS.RATE_LIMITING.REQUEST_DELAY_MS
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      // Make the request
      const response = await axiosInstance({
        url: endpoint,
        method,
        params: method === 'GET' ? params : undefined,
        data: method !== 'GET' ? params : undefined
      })

      // Handle response based on status code
      if (response.status === 200) {
        // Success - mark proxy as successful if used
        if (proxy) {
          await this.proxyManager.markProxySuccess(proxy)
        }
        return response

      } else if (response.status === 429) {
        // Rate limited
        this.stats.rateLimitedRequests++
        
        if (proxy) {
          await this.proxyManager.markProxyRateLimited(proxy, 60000) // 1 minute
        }
        
        const error = new Error(`Rate limited: ${response.status}`)
        error.status = response.status
        error.isRateLimit = true
        throw error

      } else if (response.status >= 400 && response.status < 500) {
        // Client error - don't retry, but don't mark proxy as failed
        const error = new Error(`Client error: ${response.status} - ${response.statusText}`)
        error.status = response.status
        error.isClientError = true
        throw error

      } else {
        // Server error or other - mark proxy as failed and retry
        if (proxy) {
          await this.proxyManager.markProxyFailure(proxy, `HTTP ${response.status}`)
          this.stats.proxyFailures++
        }
        
        const error = new Error(`Server error: ${response.status} - ${response.statusText}`)
        error.status = response.status
        error.isServerError = true
        throw error
      }

    } catch (error) {
      // Network or other errors
      if (proxy && !error.isClientError) {
        await this.proxyManager.markProxyFailure(proxy, error.message)
        this.stats.proxyFailures++
      }

      // Re-throw the error for retry logic
      throw error
    }
  }

  /**
   * Normalize different types of errors
   */
  normalizeError(error) {
    if (error.isRateLimit) {
      return {
        type: 'RATE_LIMIT',
        message: 'Request was rate limited',
        status: error.status,
        retryAfter: error.retryAfter || 60
      }
    }

    if (error.isClientError) {
      return {
        type: 'CLIENT_ERROR',
        message: error.message,
        status: error.status
      }
    }

    if (error.isServerError) {
      return {
        type: 'SERVER_ERROR',
        message: error.message,
        status: error.status
      }
    }

    return {
      type: 'NETWORK_ERROR',
      message: error.message || 'Unknown network error',
      code: error.code
    }
  }

  /**
   * Update running average response time
   */
  updateAverageResponseTime(responseTime) {
    const totalRequests = this.stats.successfulRequests
    this.stats.averageResponseTime = 
      ((this.stats.averageResponseTime * (totalRequests - 1)) + responseTime) / totalRequests
  }

  // AT Protocol API Methods

  /**
   * Search for actors (users)
   */
  async searchActors(query, options = {}) {
    return this.makeRequest(ENDPOINTS.SEARCH_ACTORS, {
      q: query,
      limit: options.limit || 25,
      cursor: options.cursor
    })
  }

  /**
   * Get actor profile
   */
  async getProfile(actor) {
    return this.makeRequest(ENDPOINTS.GET_PROFILE, { actor })
  }

  /**
   * Get multiple actor profiles
   */
  async getProfiles(actors) {
    return this.makeRequest(ENDPOINTS.GET_PROFILES, { actors })
  }

  /**
   * Get suggested follows
   */
  async getSuggestions(options = {}) {
    return this.makeRequest(ENDPOINTS.GET_SUGGESTIONS, {
      limit: options.limit || 50,
      cursor: options.cursor
    })
  }

  /**
   * Get author's feed (posts)
   */
  async getAuthorFeed(actor, options = {}) {
    return this.makeRequest(ENDPOINTS.GET_AUTHOR_FEED, {
      actor,
      limit: options.limit || 50,
      cursor: options.cursor,
      filter: options.filter || 'posts_and_author_threads'
    })
  }

  /**
   * Get post thread
   */
  async getPostThread(uri, options = {}) {
    return this.makeRequest(ENDPOINTS.GET_POST_THREAD, {
      uri,
      depth: options.depth || 6,
      parentHeight: options.parentHeight || 80
    })
  }

  /**
   * Search posts
   */
  async searchPosts(query, options = {}) {
    return this.makeRequest(ENDPOINTS.SEARCH_POSTS, {
      q: query,
      limit: options.limit || 25,
      cursor: options.cursor,
      since: options.since,
      until: options.until,
      mentions: options.mentions,
      author: options.author,
      lang: options.lang,
      domain: options.domain,
      url: options.url
    })
  }

  /**
   * Get actor's followers
   */
  async getFollowers(actor, options = {}) {
    return this.makeRequest(ENDPOINTS.GET_FOLLOWERS, {
      actor,
      limit: options.limit || 100,
      cursor: options.cursor
    })
  }

  /**
   * Get who actor follows
   */
  async getFollows(actor, options = {}) {
    return this.makeRequest(ENDPOINTS.GET_FOLLOWS, {
      actor,
      limit: options.limit || 100,
      cursor: options.cursor
    })
  }

  /**
   * Get API client statistics
   */
  async getStats() {
    const proxyStats = await this.proxyManager.getStats()
    
    return {
      requests: {
        total: this.stats.totalRequests,
        successful: this.stats.successfulRequests,
        failed: this.stats.failedRequests,
        rateLimited: this.stats.rateLimitedRequests,
        successRate: this.stats.totalRequests > 0 
          ? (this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(2) + '%'
          : '0%'
      },
      performance: {
        averageResponseTime: Math.round(this.stats.averageResponseTime),
        proxyFailures: this.stats.proxyFailures
      },
      proxies: proxyStats
    }
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitedRequests: 0,
      proxyFailures: 0,
      averageResponseTime: 0
    }
    
    this.logger.info('API Client statistics reset')
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    await this.proxyManager.cleanup()
    this.logger.info('API Client cleaned up')
  }
}

export default APIClient 