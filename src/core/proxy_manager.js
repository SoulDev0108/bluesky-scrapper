/**
 * Proxy Manager
 * 
 * Manages proxy rotation, health checking, and failure handling.
 * Supports HTTP, HTTPS, and SOCKS proxies with automatic failover.
 * Uses Redis for dynamic proxy storage and random selection.
 */

import axios from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import winston from 'winston'
import redis from 'redis'

import SETTINGS from '../config/settings.js'
import { parseProxyString, validateProxy, maskProxyCredentials } from '../config/proxies.js'

class ProxyManager {
  constructor() {
    this.redisClient = null
    this.proxyStats = new Map()
    this.rateLimitedProxies = new Map()
    this.healthCheckInterval = null
    this.isInitialized = false
    
    // Redis keys for proxy management
    this.REDIS_KEYS = {
      PROXIES: 'bluesky:proxies:list',
      HEALTHY_PROXIES: 'bluesky:proxies:healthy',
      UNHEALTHY_PROXIES: 'bluesky:proxies:unhealthy',
      RATE_LIMITED: 'bluesky:proxies:rate_limited',
      STATS: 'bluesky:proxies:stats'
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
          filename: SETTINGS.LOGGING.FILE.replace('scraper.log', 'proxy_manager.log')
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
   * Initialize proxy manager with Redis connection
   */
  async initialize() {
    if (this.isInitialized) {
      return
    }

    try {
      // Initialize Redis connection
      this.redisClient = redis.createClient({
        url: SETTINGS.REDIS.URL,
        password: SETTINGS.REDIS.PASSWORD,
        database: SETTINGS.REDIS.DB
      })

      await this.redisClient.connect()
      this.logger.info('Connected to Redis for proxy management')

      // Load initial proxies from configuration
      await this.loadInitialProxies()

      // Start health checking
      this.startHealthChecking()

      this.isInitialized = true
      this.logger.info('Proxy Manager initialized with Redis backend')

    } catch (error) {
      this.logger.error('Failed to initialize proxy manager', { error: error.message })
      // Fall back to in-memory mode
      this.redisClient = null
      this.logger.warn('Running proxy manager in fallback mode without Redis')
    }
  }

  /**
   * Load initial proxies from configuration into Redis
   */
  async loadInitialProxies() {
    const proxyList = SETTINGS.PROXY.LIST || []
    
    if (proxyList.length === 0) {
      this.logger.warn('No proxies configured in settings')
      return
    }

    const validProxies = []
    
    for (const proxyString of proxyList) {
      try {
        const parsed = parseProxyString(proxyString)
        if (parsed) {
          const validation = validateProxy(parsed)
          if (validation.isValid) {
            validProxies.push(proxyString)
          } else {
            this.logger.warn('Invalid proxy configuration', { 
              proxy: proxyString, 
              errors: validation.errors 
            })
          }
        }
      } catch (error) {
        this.logger.error('Failed to parse proxy string', {
          proxyString,
          error: error.message
        })
      }
    }

    if (validProxies.length > 0) {
      await this.addProxies(validProxies)
      this.logger.info('Loaded initial proxies', { count: validProxies.length })
    }
  }

  /**
   * Add proxies to Redis storage
   * @param {Array} proxies - Array of proxy strings
   */
  async addProxies(proxies) {
    if (!this.redisClient) {
      this.logger.warn('Redis not available, cannot add proxies')
      return
    }

    try {
      // Add to main proxy list
      if (proxies.length > 0) {
        await this.redisClient.sAdd(this.REDIS_KEYS.PROXIES, proxies)
        
        // Initially mark all as healthy
        await this.redisClient.sAdd(this.REDIS_KEYS.HEALTHY_PROXIES, proxies)
        
        this.logger.info('Added proxies to Redis', { count: proxies.length })
      }
    } catch (error) {
      this.logger.error('Failed to add proxies to Redis', { error: error.message })
    }
  }

  /**
   * Remove proxies from Redis storage
   * @param {Array} proxies - Array of proxy strings to remove
   */
  async removeProxies(proxies) {
    if (!this.redisClient) {
      return
    }

    try {
      if (proxies.length > 0) {
        await Promise.all([
          this.redisClient.sRem(this.REDIS_KEYS.PROXIES, proxies),
          this.redisClient.sRem(this.REDIS_KEYS.HEALTHY_PROXIES, proxies),
          this.redisClient.sRem(this.REDIS_KEYS.UNHEALTHY_PROXIES, proxies),
          this.redisClient.sRem(this.REDIS_KEYS.RATE_LIMITED, proxies)
        ])
        
        this.logger.info('Removed proxies from Redis', { count: proxies.length })
      }
    } catch (error) {
      this.logger.error('Failed to remove proxies from Redis', { error: error.message })
    }
  }

  /**
   * Get a random healthy proxy from Redis
   */
  async getRandomProxy() {
    if (!this.redisClient) {
      this.logger.warn('Redis not available, cannot get proxy')
      return null
    }

    try {
      // Get all healthy proxies
      const healthyProxies = await this.redisClient.sMembers(this.REDIS_KEYS.HEALTHY_PROXIES)
      
      if (healthyProxies.length === 0) {
        this.logger.warn('No healthy proxies available')
        return null
      }

      // Select random proxy
      const randomIndex = Math.floor(Math.random() * healthyProxies.length)
      const selectedProxy = healthyProxies[randomIndex]

      // Update usage statistics
      await this.updateProxyStats(selectedProxy, 'request')

      this.logger.debug('Selected random proxy', { 
        proxy: maskProxyCredentials({ url: selectedProxy }),
        availableCount: healthyProxies.length 
      })

      return selectedProxy

    } catch (error) {
      this.logger.error('Failed to get random proxy', { error: error.message })
      return null
    }
  }

  /**
   * Mark proxy as successful
   */
  async markProxySuccess(proxy) {
    if (!this.redisClient) {
      return
    }

    try {
      // Move to healthy set if it was unhealthy
      await Promise.all([
        this.redisClient.sAdd(this.REDIS_KEYS.HEALTHY_PROXIES, proxy),
        this.redisClient.sRem(this.REDIS_KEYS.UNHEALTHY_PROXIES, proxy),
        this.redisClient.sRem(this.REDIS_KEYS.RATE_LIMITED, proxy)
      ])

      // Update statistics
      await this.updateProxyStats(proxy, 'success')

      this.logger.debug('Marked proxy as successful', { 
        proxy: maskProxyCredentials({ url: proxy }) 
      })

    } catch (error) {
      this.logger.error('Failed to mark proxy success', { error: error.message })
    }
  }

  /**
   * Mark proxy as failed
   */
  async markProxyFailure(proxy, reason = 'unknown') {
    if (!this.redisClient) {
      return
    }

    try {
      // Get current failure count
      const statsKey = `${this.REDIS_KEYS.STATS}:${proxy}`
      const stats = await this.redisClient.hGetAll(statsKey)
      const consecutiveFailures = parseInt(stats.consecutiveFailures || '0') + 1

      // Update failure statistics
      await this.updateProxyStats(proxy, 'failure', { consecutiveFailures })

      // Move to unhealthy if too many consecutive failures
      if (consecutiveFailures >= SETTINGS.PROXY.MAX_CONSECUTIVE_FAILURES) {
        await Promise.all([
          this.redisClient.sRem(this.REDIS_KEYS.HEALTHY_PROXIES, proxy),
          this.redisClient.sAdd(this.REDIS_KEYS.UNHEALTHY_PROXIES, proxy)
        ])

        this.logger.warn('Marked proxy as unhealthy', {
          proxy: maskProxyCredentials({ url: proxy }),
          consecutiveFailures,
          reason
        })
      }

    } catch (error) {
      this.logger.error('Failed to mark proxy failure', { error: error.message })
    }
  }

  /**
   * Mark proxy as rate limited
   */
  async markProxyRateLimited(proxy, duration = 60000) {
    if (!this.redisClient) {
      return
    }

    try {
      // Add to rate limited set with expiration
      await Promise.all([
        this.redisClient.sAdd(this.REDIS_KEYS.RATE_LIMITED, proxy),
        this.redisClient.sRem(this.REDIS_KEYS.HEALTHY_PROXIES, proxy)
      ])

      // Set expiration for rate limit
      setTimeout(async () => {
        try {
          await this.redisClient.sRem(this.REDIS_KEYS.RATE_LIMITED, proxy)
          // Re-add to healthy if not in unhealthy set
          const isUnhealthy = await this.redisClient.sIsMember(this.REDIS_KEYS.UNHEALTHY_PROXIES, proxy)
          if (!isUnhealthy) {
            await this.redisClient.sAdd(this.REDIS_KEYS.HEALTHY_PROXIES, proxy)
          }
        } catch (error) {
          this.logger.error('Failed to remove rate limit', { error: error.message })
        }
      }, duration)

      this.logger.info('Marked proxy as rate limited', {
        proxy: maskProxyCredentials({ url: proxy }),
        duration
      })

    } catch (error) {
      this.logger.error('Failed to mark proxy as rate limited', { error: error.message })
    }
  }

  /**
   * Update proxy statistics in Redis
   */
  async updateProxyStats(proxy, action, additionalData = {}) {
    if (!this.redisClient) {
      return
    }

    try {
      const statsKey = `${this.REDIS_KEYS.STATS}:${proxy}`
      const now = Date.now()

      const updates = {
        lastUsed: now.toString(),
        ...additionalData
      }

      switch (action) {
        case 'request':
          const requests = await this.redisClient.hGet(statsKey, 'requests') || '0'
          updates.requests = (parseInt(requests) + 1).toString()
          break

        case 'success':
          const successes = await this.redisClient.hGet(statsKey, 'successes') || '0'
          updates.successes = (parseInt(successes) + 1).toString()
          updates.lastSuccess = now.toString()
          updates.consecutiveFailures = '0'
          break

        case 'failure':
          const failures = await this.redisClient.hGet(statsKey, 'failures') || '0'
          updates.failures = (parseInt(failures) + 1).toString()
          updates.lastFailure = now.toString()
          break
      }

      await this.redisClient.hSet(statsKey, updates)

    } catch (error) {
      this.logger.error('Failed to update proxy stats', { error: error.message })
    }
  }

  /**
   * Test proxy health
   */
  async testProxyHealth(proxy) {
    try {
      const startTime = Date.now()
      
      // Create proxy agent
      let agent
      if (proxy.startsWith('socks')) {
        agent = new SocksProxyAgent(proxy)
      } else {
        agent = new HttpsProxyAgent(proxy)
      }

      // Test with a simple HTTP request
      const response = await axios.get('https://httpbin.org/ip', {
        httpsAgent: agent,
        httpAgent: agent,
        timeout: SETTINGS.PROXY.TIMEOUT,
        validateStatus: () => true // Accept any status code
      })

      const responseTime = Date.now() - startTime

      if (response.status === 200) {
        await this.markProxySuccess(proxy)
        await this.updateProxyStats(proxy, 'success', { 
          responseTime: responseTime.toString() 
        })
        return true
      } else {
        await this.markProxyFailure(proxy, `HTTP ${response.status}`)
        return false
      }

    } catch (error) {
      await this.markProxyFailure(proxy, error.message)
      return false
    }
  }

  /**
   * Start periodic health checking
   */
  startHealthChecking() {
    if (this.healthCheckInterval) {
      return
    }

    const interval = SETTINGS.PROXY.HEALTH_CHECK_INTERVAL || 300000 // 5 minutes

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck()
    }, interval)

    this.logger.info('Started proxy health checking', { interval })
  }

  /**
   * Perform health check on all proxies
   */
  async performHealthCheck() {
    if (!this.redisClient) {
      return
    }

    try {
      const allProxies = await this.redisClient.sMembers(this.REDIS_KEYS.PROXIES)
      
      if (allProxies.length === 0) {
        return
      }

      this.logger.info('Starting proxy health check', { proxyCount: allProxies.length })

      const healthCheckPromises = allProxies.map(proxy => 
        this.testProxyHealth(proxy).catch(error => {
          this.logger.error('Health check failed for proxy', {
            proxy: maskProxyCredentials({ url: proxy }),
            error: error.message
          })
          return false
        })
      )

      const results = await Promise.allSettled(healthCheckPromises)
      const healthyCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length

      this.logger.info('Proxy health check completed', {
        total: allProxies.length,
        healthy: healthyCount,
        unhealthy: allProxies.length - healthyCount
      })

    } catch (error) {
      this.logger.error('Failed to perform health check', { error: error.message })
    }
  }

  /**
   * Stop health checking
   */
  stopHealthChecking() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
      this.logger.info('Stopped proxy health checking')
    }
  }

  /**
   * Get proxy statistics
   */
  async getStats() {
    if (!this.redisClient) {
      return {
        total: 0,
        healthy: 0,
        unhealthy: 0,
        rateLimited: 0,
        successRate: 0
      }
    }

    try {
      const [total, healthy, unhealthy, rateLimited] = await Promise.all([
        this.redisClient.sCard(this.REDIS_KEYS.PROXIES),
        this.redisClient.sCard(this.REDIS_KEYS.HEALTHY_PROXIES),
        this.redisClient.sCard(this.REDIS_KEYS.UNHEALTHY_PROXIES),
        this.redisClient.sCard(this.REDIS_KEYS.RATE_LIMITED)
      ])

      // Calculate overall success rate
      const allProxies = await this.redisClient.sMembers(this.REDIS_KEYS.PROXIES)
      let totalRequests = 0
      let totalSuccesses = 0

      for (const proxy of allProxies) {
        const statsKey = `${this.REDIS_KEYS.STATS}:${proxy}`
        const stats = await this.redisClient.hGetAll(statsKey)
        totalRequests += parseInt(stats.requests || '0')
        totalSuccesses += parseInt(stats.successes || '0')
      }

      const successRate = totalRequests > 0 ? (totalSuccesses / totalRequests * 100) : 0

      return {
        total,
        healthy,
        unhealthy,
        rateLimited,
        successRate: parseFloat(successRate.toFixed(2)),
        totalRequests,
        totalSuccesses
      }

    } catch (error) {
      this.logger.error('Failed to get proxy stats', { error: error.message })
      return {
        total: 0,
        healthy: 0,
        unhealthy: 0,
        rateLimited: 0,
        successRate: 0
      }
    }
  }

  /**
   * Get all proxies by status
   */
  async getProxiesByStatus(status = 'all') {
    if (!this.redisClient) {
      return []
    }

    try {
      switch (status) {
        case 'healthy':
          return await this.redisClient.sMembers(this.REDIS_KEYS.HEALTHY_PROXIES)
        case 'unhealthy':
          return await this.redisClient.sMembers(this.REDIS_KEYS.UNHEALTHY_PROXIES)
        case 'rate_limited':
          return await this.redisClient.sMembers(this.REDIS_KEYS.RATE_LIMITED)
        case 'all':
        default:
          return await this.redisClient.sMembers(this.REDIS_KEYS.PROXIES)
      }
    } catch (error) {
      this.logger.error('Failed to get proxies by status', { error: error.message })
      return []
    }
  }

  /**
   * Check if proxy manager has proxies
   */
  async hasProxies() {
    if (!this.redisClient) {
      return false
    }

    try {
      const count = await this.redisClient.sCard(this.REDIS_KEYS.PROXIES)
      return count > 0
    } catch (error) {
      return false
    }
  }

  /**
   * Get proxy count
   */
  async getProxyCount() {
    if (!this.redisClient) {
      return 0
    }

    try {
      return await this.redisClient.sCard(this.REDIS_KEYS.PROXIES)
    } catch (error) {
      return 0
    }
  }

  /**
   * Reset all proxy statistics
   */
  async resetStats() {
    if (!this.redisClient) {
      return
    }

    try {
      const allProxies = await this.redisClient.sMembers(this.REDIS_KEYS.PROXIES)
      
      // Reset all proxy stats
      const deletePromises = allProxies.map(proxy => 
        this.redisClient.del(`${this.REDIS_KEYS.STATS}:${proxy}`)
      )
      
      await Promise.all(deletePromises)

      // Reset proxy status - mark all as healthy
      await Promise.all([
        this.redisClient.del(this.REDIS_KEYS.UNHEALTHY_PROXIES),
        this.redisClient.del(this.REDIS_KEYS.RATE_LIMITED),
        this.redisClient.sAdd(this.REDIS_KEYS.HEALTHY_PROXIES, allProxies)
      ])

      this.logger.info('Reset all proxy statistics')

    } catch (error) {
      this.logger.error('Failed to reset proxy stats', { error: error.message })
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.stopHealthChecking()
    
    if (this.redisClient) {
      try {
        await this.redisClient.quit()
        this.logger.info('Disconnected from Redis')
      } catch (error) {
        this.logger.error('Error disconnecting from Redis', { error: error.message })
      }
    }
  }
}

export default ProxyManager 