/**
 * Rate Limiter
 * 
 * Manages request throttling per endpoint to avoid hitting rate limits.
 * Implements token bucket algorithm with per-endpoint limits.
 */

import Bottleneck from 'bottleneck'
import winston from 'winston'

import { RATE_LIMITS } from '../config/endpoints.js'
import SETTINGS from '../config/settings.js'

class RateLimiter {
  constructor() {
    this.limiters = new Map()
    this.stats = {
      totalRequests: 0,
      throttledRequests: 0,
      averageWaitTime: 0,
      endpointStats: new Map()
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
          filename: SETTINGS.LOGGING.FILE.replace('scraper.log', 'rate_limiter.log')
        })
      ]
    })

    if (SETTINGS.LOGGING.CONSOLE_LOG) {
      this.logger.add(new winston.transports.Console({
        format: winston.format.simple()
      }))
    }

    this.logger.info('Rate Limiter initialized', {
      globalRequestsPerMinute: SETTINGS.RATE_LIMITING.REQUESTS_PER_MINUTE,
      globalBurstLimit: SETTINGS.RATE_LIMITING.BURST_LIMIT
    })
  }

  /**
   * Get or create rate limiter for specific endpoint
   */
  getLimiterForEndpoint(endpoint) {
    if (this.limiters.has(endpoint)) {
      return this.limiters.get(endpoint)
    }

    // Get rate limit configuration for this endpoint
    const config = RATE_LIMITS[endpoint] || RATE_LIMITS.DEFAULT
    
    // Create bottleneck limiter with endpoint-specific settings
    const limiter = new Bottleneck({
      reservoir: config.burstLimit || SETTINGS.RATE_LIMITING.BURST_LIMIT,
      reservoirRefreshAmount: config.burstLimit || SETTINGS.RATE_LIMITING.BURST_LIMIT,
      reservoirRefreshInterval: 60 * 1000, // 1 minute
      maxConcurrent: SETTINGS.RATE_LIMITING.CONCURRENT_REQUESTS,
      minTime: this.calculateMinTime(config.requestsPerMinute || SETTINGS.RATE_LIMITING.REQUESTS_PER_MINUTE),
      trackDoneStatus: true,
      id: `endpoint-${endpoint}`
    })

    // Setup event handlers
    limiter.on('failed', (error, jobInfo) => {
      this.logger.warn('Rate limiter job failed', {
        endpoint,
        error: error.message,
        jobId: jobInfo.options.id
      })
    })

    limiter.on('retry', (error, jobInfo) => {
      this.logger.debug('Rate limiter job retrying', {
        endpoint,
        error: error.message,
        jobId: jobInfo.options.id,
        retryCount: jobInfo.retryCount
      })
    })

    limiter.on('depleted', () => {
      this.logger.debug('Rate limiter reservoir depleted', { endpoint })
    })

    limiter.on('dropped', (dropped) => {
      this.logger.warn('Rate limiter job dropped', {
        endpoint,
        droppedJobs: dropped
      })
    })

    this.limiters.set(endpoint, limiter)
    
    // Initialize endpoint stats
    this.stats.endpointStats.set(endpoint, {
      requests: 0,
      throttled: 0,
      averageWaitTime: 0,
      lastRequest: null
    })

    this.logger.debug('Created rate limiter for endpoint', {
      endpoint,
      requestsPerMinute: config.requestsPerMinute || SETTINGS.RATE_LIMITING.REQUESTS_PER_MINUTE,
      burstLimit: config.burstLimit || SETTINGS.RATE_LIMITING.BURST_LIMIT,
      minTime: this.calculateMinTime(config.requestsPerMinute || SETTINGS.RATE_LIMITING.REQUESTS_PER_MINUTE)
    })

    return limiter
  }

  /**
   * Calculate minimum time between requests based on requests per minute
   */
  calculateMinTime(requestsPerMinute) {
    const baseMinTime = Math.floor(60000 / requestsPerMinute) // Convert to milliseconds
    
    // Add some jitter to avoid thundering herd
    if (SETTINGS.RATE_LIMITING.RANDOMIZE_DELAYS) {
      const jitter = Math.random() * 0.2 * baseMinTime // ±20% jitter
      return Math.max(baseMinTime + jitter, SETTINGS.SECURITY.MIN_REQUEST_INTERVAL)
    }
    
    return Math.max(baseMinTime, SETTINGS.SECURITY.MIN_REQUEST_INTERVAL)
  }

  /**
   * Wait for available slot for the given endpoint
   */
  async waitForSlot(endpoint) {
    const startTime = Date.now()
    const limiter = this.getLimiterForEndpoint(endpoint)
    
    this.stats.totalRequests++
    const endpointStats = this.stats.endpointStats.get(endpoint)
    endpointStats.requests++
    endpointStats.lastRequest = Date.now()

    try {
      // Schedule the request through the rate limiter
      await limiter.schedule({ id: `request-${Date.now()}-${Math.random()}` }, () => {
        // This function just resolves immediately - the rate limiting happens in the scheduling
        return Promise.resolve()
      })

      const waitTime = Date.now() - startTime
      
      if (waitTime > 100) { // Only count as throttled if we waited more than 100ms
        this.stats.throttledRequests++
        endpointStats.throttled++
        
        // Update average wait times
        this.updateAverageWaitTime(waitTime)
        this.updateEndpointAverageWaitTime(endpoint, waitTime)

        this.logger.debug('Request throttled', {
          endpoint,
          waitTime,
          queueSize: limiter.queued()
        })
      }

    } catch (error) {
      this.logger.error('Rate limiter error', {
        endpoint,
        error: error.message
      })
      throw error
    }
  }

  /**
   * Update global average wait time
   */
  updateAverageWaitTime(waitTime) {
    const totalThrottled = this.stats.throttledRequests
    const currentAverage = this.stats.averageWaitTime
    this.stats.averageWaitTime = 
      ((currentAverage * (totalThrottled - 1)) + waitTime) / totalThrottled
  }

  /**
   * Update endpoint-specific average wait time
   */
  updateEndpointAverageWaitTime(endpoint, waitTime) {
    const endpointStats = this.stats.endpointStats.get(endpoint)
    const totalThrottled = endpointStats.throttled
    const currentAverage = endpointStats.averageWaitTime
    
    if (totalThrottled > 0) {
      endpointStats.averageWaitTime = 
        ((currentAverage * (totalThrottled - 1)) + waitTime) / totalThrottled
    }
  }

  /**
   * Get current queue status for all endpoints
   */
  getQueueStatus() {
    const status = {}
    
    for (const [endpoint, limiter] of this.limiters.entries()) {
      status[endpoint] = {
        queued: limiter.queued(),
        running: limiter.running(),
        done: limiter.done(),
        reservoir: limiter.reservoir()
      }
    }
    
    return status
  }

  /**
   * Get rate limiter statistics
   */
  getStats() {
    const endpointStatsArray = []
    
    for (const [endpoint, stats] of this.stats.endpointStats.entries()) {
      const limiter = this.limiters.get(endpoint)
      endpointStatsArray.push({
        endpoint,
        ...stats,
        currentQueue: limiter ? limiter.queued() : 0,
        currentRunning: limiter ? limiter.running() : 0,
        reservoir: limiter ? limiter.reservoir() : 0,
        throttleRate: stats.requests > 0 
          ? (stats.throttled / stats.requests * 100).toFixed(2) + '%'
          : '0%'
      })
    }

    return {
      global: {
        totalRequests: this.stats.totalRequests,
        throttledRequests: this.stats.throttledRequests,
        averageWaitTime: Math.round(this.stats.averageWaitTime),
        throttleRate: this.stats.totalRequests > 0 
          ? (this.stats.throttledRequests / this.stats.totalRequests * 100).toFixed(2) + '%'
          : '0%'
      },
      endpoints: endpointStatsArray,
      queueStatus: this.getQueueStatus()
    }
  }

  /**
   * Reset all statistics
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      throttledRequests: 0,
      averageWaitTime: 0,
      endpointStats: new Map()
    }

    // Reset endpoint stats for existing limiters
    for (const endpoint of this.limiters.keys()) {
      this.stats.endpointStats.set(endpoint, {
        requests: 0,
        throttled: 0,
        averageWaitTime: 0,
        lastRequest: null
      })
    }

    this.logger.info('Rate limiter statistics reset')
  }

  /**
   * Pause all rate limiters
   */
  async pauseAll() {
    const pausePromises = []
    
    for (const [endpoint, limiter] of this.limiters.entries()) {
      pausePromises.push(limiter.stop({ dropWaitingJobs: false }))
      this.logger.debug('Paused rate limiter', { endpoint })
    }
    
    await Promise.all(pausePromises)
    this.logger.info('All rate limiters paused')
  }

  /**
   * Resume all rate limiters
   */
  resumeAll() {
    for (const [endpoint, limiter] of this.limiters.entries()) {
      limiter.start()
      this.logger.debug('Resumed rate limiter', { endpoint })
    }
    
    this.logger.info('All rate limiters resumed')
  }

  /**
   * Get detailed information about a specific endpoint's rate limiter
   */
  getEndpointInfo(endpoint) {
    const limiter = this.limiters.get(endpoint)
    const stats = this.stats.endpointStats.get(endpoint)
    const config = RATE_LIMITS[endpoint] || RATE_LIMITS.DEFAULT
    
    if (!limiter || !stats) {
      return null
    }

    return {
      endpoint,
      configuration: {
        requestsPerMinute: config.requestsPerMinute || SETTINGS.RATE_LIMITING.REQUESTS_PER_MINUTE,
        burstLimit: config.burstLimit || SETTINGS.RATE_LIMITING.BURST_LIMIT,
        minTime: this.calculateMinTime(config.requestsPerMinute || SETTINGS.RATE_LIMITING.REQUESTS_PER_MINUTE)
      },
      currentState: {
        queued: limiter.queued(),
        running: limiter.running(),
        done: limiter.done(),
        reservoir: limiter.reservoir()
      },
      statistics: stats
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.logger.info('Cleaning up rate limiter resources')
    
    const stopPromises = []
    for (const [endpoint, limiter] of this.limiters.entries()) {
      stopPromises.push(limiter.stop({ dropWaitingJobs: true }))
    }
    
    await Promise.all(stopPromises)
    this.limiters.clear()
    
    this.logger.info('Rate limiter cleanup completed')
  }
}

export default RateLimiter 