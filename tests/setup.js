/**
 * Jest Test Setup
 * 
 * Global test configuration and setup for Bluesky Scraper tests
 */

import { jest } from '@jest/globals'

// Set test environment variables
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'error'
process.env.REDIS_DB = '15' // Use different Redis DB for tests
process.env.DRY_RUN = 'true'
process.env.OUTPUT_DIR = './test_data'

// Global test timeout
jest.setTimeout(30000)

// Mock console methods to reduce noise during tests
const originalConsole = { ...console }

beforeAll(() => {
  // Suppress console output during tests unless explicitly needed
  console.log = jest.fn()
  console.info = jest.fn()
  console.warn = jest.fn()
  console.error = jest.fn()
})

afterAll(() => {
  // Restore console methods
  Object.assign(console, originalConsole)
})

// Global test utilities
global.testUtils = {
  // Create mock user data
  createMockUser: (overrides = {}) => ({
    did: 'did:plc:test123',
    handle: 'test.bsky.social',
    displayName: 'Test User',
    description: 'Test user description',
    avatar: 'https://example.com/avatar.jpg',
    followersCount: 100,
    followsCount: 50,
    postsCount: 25,
    createdAt: new Date().toISOString(),
    ...overrides
  }),

  // Create mock post data
  createMockPost: (overrides = {}) => ({
    uri: 'at://test.bsky.social/app.bsky.feed.post/test123',
    cid: 'test_cid',
    author: {
      did: 'did:plc:test123',
      handle: 'test.bsky.social',
      displayName: 'Test User'
    },
    record: {
      text: 'Test post content',
      createdAt: new Date().toISOString(),
      langs: ['en']
    },
    likeCount: 5,
    repostCount: 2,
    replyCount: 1,
    indexedAt: new Date().toISOString(),
    ...overrides
  }),

  // Create mock relationship data
  createMockRelationship: (overrides = {}) => ({
    subject: {
      did: 'did:plc:follower123',
      handle: 'follower.bsky.social',
      displayName: 'Follower User'
    },
    createdAt: new Date().toISOString(),
    ...overrides
  }),

  // Wait for a specified time
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Generate random string
  randomString: (length = 10) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }
}

// Mock external dependencies that require network access
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setEx: jest.fn().mockResolvedValue('OK'),
    exists: jest.fn().mockResolvedValue(0),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([])
  }))
}))

// Mock axios for API calls
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    post: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    put: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    delete: jest.fn().mockResolvedValue({ data: {}, status: 200 })
  })),
  get: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  post: jest.fn().mockResolvedValue({ data: {}, status: 200 })
}))

// Mock file system operations for tests
jest.mock('fs-extra', () => ({
  ensureDir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('{}'),
  writeJson: jest.fn().mockResolvedValue(undefined),
  readJson: jest.fn().mockResolvedValue({}),
  pathExists: jest.fn().mockResolvedValue(true),
  readdir: jest.fn().mockResolvedValue([]),
  stat: jest.fn().mockResolvedValue({ size: 1024, mtime: new Date() }),
  copy: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined)
}))

export default {} 