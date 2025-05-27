/**
 * Bluesky AT Protocol Scraper
 * Main entry point for the scraper library
 */

// Core components
import APIClient from './core/api_client.js'
import ProxyManager from './core/proxy_manager.js'
import RateLimiter from './core/rate_limiter.js'
import CheckpointManager from './core/checkpoint_manager.js'

// Scrapers
import UsersScraper from './scrapers/users_scraper.js'
import PostsScraper from './scrapers/posts_scraper.js'
import RelationshipsScraper from './scrapers/relationships_scraper.js'
import UserInfoScraper from './scrapers/user_info_scraper.js'
import PostInfoScraper from './scrapers/post_info_scraper.js'

// Utilities
import DataValidator from './utils/data_validator.js'
import Deduplicator from './utils/deduplicator.js'
import FileManager from './utils/file_manager.js'

// Configuration
import { ENDPOINTS, RATE_LIMITS, REQUEST_CONFIG } from './config/endpoints.js'
import SETTINGS from './config/settings.js'

/**
 * Main Bluesky Scraper class that orchestrates all components
 */
class BlueskyScraperOrchestrator {
  constructor(options = {}) {
    this.options = {
      enableUsers: true,
      enablePosts: true,
      enableRelationships: true,
      ...options
    }

    // Initialize components
    this.apiClient = new APIClient(options.apiClient)
    this.dataValidator = new DataValidator()
    this.deduplicator = new Deduplicator()
    this.fileManager = new FileManager()
    
    // Initialize scrapers
    this.usersScraper = new UsersScraper(options.users)
    this.postsScraper = new PostsScraper(options.posts)
    this.relationshipsScraper = new RelationshipsScraper(options.relationships)
    this.userInfoScraper = new UserInfoScraper(options.userInfo)
    this.postInfoScraper = new PostInfoScraper(options.postInfo)

    this.isInitialized = false
  }

  /**
   * Initialize all components
   */
  async initialize() {
    if (this.isInitialized) {
      return
    }

    console.log('Initializing Bluesky Scraper...')

    try {
      // Initialize core components
      await this.deduplicator.initialize()
      await this.fileManager.initialize()

      // Initialize scrapers
      await this.usersScraper.initialize()
      await this.postsScraper.initialize()
      await this.relationshipsScraper.initialize()
      await this.userInfoScraper.initialize()
      await this.postInfoScraper.initialize()

      this.isInitialized = true
      console.log('Bluesky Scraper initialized successfully')

    } catch (error) {
      console.error('Failed to initialize Bluesky Scraper:', error)
      throw error
    }
  }

  /**
   * Run full scraping pipeline
   */
  async runFullPipeline(options = {}) {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const pipeline = {
      users: this.options.enableUsers,
      posts: this.options.enablePosts,
      relationships: this.options.enableRelationships,
      ...options
    }

    console.log('Starting full scraping pipeline...', pipeline)

    try {
      // Step 1: Scrape users
      if (pipeline.users) {
        console.log('Step 1: Scraping users...')
        await this.usersScraper.start({ resume: options.resume })
      }

      // Step 2: Scrape posts from discovered users
      if (pipeline.posts) {
        console.log('Step 2: Scraping posts...')
        await this.postsScraper.start({ resume: options.resume })
      }

      // Step 3: Scrape relationships
      if (pipeline.relationships) {
        console.log('Step 3: Scraping relationships...')
        await this.relationshipsScraper.start({ resume: options.resume })
      }

      console.log('Full pipeline completed successfully')

    } catch (error) {
      console.error('Pipeline failed:', error)
      throw error
    }
  }

  /**
   * Scrape individual user by URL or handle
   */
  async scrapeUser(identifier) {
    if (!this.isInitialized) {
      await this.initialize()
    }

    if (identifier.startsWith('https://')) {
      return await this.userInfoScraper.scrapeByUrl(identifier)
    } else {
      return await this.userInfoScraper.scrapeByHandle(identifier)
    }
  }

  /**
   * Scrape individual post by URL or AT URI
   */
  async scrapePost(identifier) {
    if (!this.isInitialized) {
      await this.initialize()
    }

    if (identifier.startsWith('https://')) {
      return await this.postInfoScraper.scrapeByUrl(identifier)
    } else {
      return await this.postInfoScraper.scrapeByAtUri(identifier)
    }
  }

  /**
   * Get comprehensive statistics from all components
   */
  getStats() {
    return {
      users: this.usersScraper.getStats(),
      posts: this.postsScraper.getStats(),
      relationships: this.relationshipsScraper.getStats(),
      userInfo: this.userInfoScraper.getStats(),
      postInfo: this.postInfoScraper.getStats(),
      deduplication: this.deduplicator.getStats(),
      storage: this.fileManager.getStats(),
      api: this.apiClient.getStats()
    }
  }

  /**
   * Cleanup all resources
   */
  async cleanup() {
    console.log('Cleaning up Bluesky Scraper resources...')

    try {
      await this.usersScraper.cleanup()
      await this.postsScraper.cleanup()
      await this.relationshipsScraper.cleanup()
      await this.userInfoScraper.cleanup()
      await this.postInfoScraper.cleanup()
      await this.deduplicator.close()
      await this.apiClient.cleanup()

      console.log('Cleanup completed')

    } catch (error) {
      console.error('Error during cleanup:', error)
    }
  }
}

// Export everything
export {
  // Main orchestrator
  BlueskyScraperOrchestrator as default,
  BlueskyScraperOrchestrator,

  // Core components
  APIClient,
  ProxyManager,
  RateLimiter,
  CheckpointManager,

  // Scrapers
  UsersScraper,
  PostsScraper,
  RelationshipsScraper,
  UserInfoScraper,
  PostInfoScraper,

  // Utilities
  DataValidator,
  Deduplicator,
  FileManager,

  // Configuration
  ENDPOINTS,
  RATE_LIMITS,
  REQUEST_CONFIG,
  SETTINGS
}

// For CommonJS compatibility
export const createScraper = (options) => new BlueskyScraperOrchestrator(options) 