/**
 * Bluesky AT Protocol API Endpoints Configuration
 * 
 * This file contains all the API endpoints used for scraping Bluesky data.
 * Based on the official AT Protocol documentation and Bluesky API reference.
 */

export const API_BASE_URL = 'https://public.api.bsky.app'

export const ENDPOINTS = {
  // Actor (User) endpoints
  ACTOR: {
    GET_PROFILE: '/xrpc/app.bsky.actor.getProfile',
    GET_PROFILES: '/xrpc/app.bsky.actor.getProfiles',
    SEARCH_ACTORS: '/xrpc/app.bsky.actor.searchActors',
    SEARCH_ACTORS_TYPEAHEAD: '/xrpc/app.bsky.actor.searchActorsTypeahead',
    GET_SUGGESTIONS: '/xrpc/app.bsky.actor.getSuggestions'
  },

  // Feed (Posts) endpoints
  FEED: {
    GET_AUTHOR_FEED: '/xrpc/app.bsky.feed.getAuthorFeed',
    GET_POST_THREAD: '/xrpc/app.bsky.feed.getPostThread',
    GET_POSTS: '/xrpc/app.bsky.feed.getPosts',
    GET_LIKES: '/xrpc/app.bsky.feed.getLikes',
    GET_REPOSTS: '/xrpc/app.bsky.feed.getRepostedBy',
    GET_QUOTES: '/xrpc/app.bsky.feed.getQuotes',
    SEARCH_POSTS: '/xrpc/app.bsky.feed.searchPosts',
    GET_TIMELINE: '/xrpc/app.bsky.feed.getTimeline'
  },

  // Graph (Relationships) endpoints
  GRAPH: {
    GET_FOLLOWERS: '/xrpc/app.bsky.graph.getFollowers',
    GET_FOLLOWS: '/xrpc/app.bsky.graph.getFollows',
    GET_KNOWN_FOLLOWERS: '/xrpc/app.bsky.graph.getKnownFollowers',
    GET_RELATIONSHIPS: '/xrpc/app.bsky.graph.getRelationships',
    GET_SUGGESTED_FOLLOWS: '/xrpc/app.bsky.graph.getSuggestedFollowsByActor'
  },

  // Identity resolution endpoints
  IDENTITY: {
    RESOLVE_HANDLE: '/xrpc/com.atproto.identity.resolveHandle',
    RESOLVE_DID: '/xrpc/com.atproto.identity.resolveDid'
  },

  // Repository endpoints for direct data access
  REPO: {
    DESCRIBE_REPO: '/xrpc/com.atproto.repo.describeRepo',
    LIST_RECORDS: '/xrpc/com.atproto.repo.listRecords',
    GET_RECORD: '/xrpc/com.atproto.repo.getRecord'
  },

  // Sync endpoints for bulk data
  SYNC: {
    LIST_REPOS: '/xrpc/com.atproto.sync.listRepos',
    GET_REPO: '/xrpc/com.atproto.sync.getRepo'
  }
}

// Rate limiting configuration per endpoint
export const RATE_LIMITS = {
  [ENDPOINTS.ACTOR.SEARCH_ACTORS]: {
    requestsPerMinute: 30,
    burstLimit: 5
  },
  [ENDPOINTS.ACTOR.GET_PROFILE]: {
    requestsPerMinute: 100,
    burstLimit: 10
  },
  [ENDPOINTS.ACTOR.GET_PROFILES]: {
    requestsPerMinute: 60,
    burstLimit: 8
  },
  [ENDPOINTS.ACTOR.GET_SUGGESTIONS]: {
    requestsPerMinute: 20,
    burstLimit: 3
  },
  [ENDPOINTS.FEED.GET_AUTHOR_FEED]: {
    requestsPerMinute: 80,
    burstLimit: 10
  },
  [ENDPOINTS.FEED.GET_POST_THREAD]: {
    requestsPerMinute: 100,
    burstLimit: 15
  },
  [ENDPOINTS.FEED.SEARCH_POSTS]: {
    requestsPerMinute: 25,
    burstLimit: 5
  },
  [ENDPOINTS.GRAPH.GET_FOLLOWERS]: {
    requestsPerMinute: 50,
    burstLimit: 8
  },
  [ENDPOINTS.GRAPH.GET_FOLLOWS]: {
    requestsPerMinute: 50,
    burstLimit: 8
  },
  // Default rate limit for unlisted endpoints
  DEFAULT: {
    requestsPerMinute: 60,
    burstLimit: 10
  }
}

// Request parameters and pagination settings
export const REQUEST_CONFIG = {
  // Default pagination limits
  PAGINATION: {
    DEFAULT_LIMIT: 50,
    MAX_LIMIT: 100,
    MIN_LIMIT: 1
  },

  // Timeout settings
  TIMEOUTS: {
    DEFAULT: 30000,
    SEARCH: 45000,
    BULK: 60000
  },

  // Retry configuration
  RETRY: {
    MAX_ATTEMPTS: 3,
    BASE_DELAY: 1000,
    MAX_DELAY: 30000,
    EXPONENTIAL_BASE: 2
  }
}

// Common query parameters for different endpoint types
export const QUERY_PARAMS = {
  ACTOR_SEARCH: {
    limit: 50,
    typeahead: false
  },
  FEED_PAGINATION: {
    limit: 50
  },
  GRAPH_PAGINATION: {
    limit: 100
  }
}

// Error codes and their meanings
export const ERROR_CODES = {
  RATE_LIMITED: 'RateLimitExceeded',
  NOT_FOUND: 'RecordNotFound',
  INVALID_REQUEST: 'InvalidRequest',
  UNAUTHORIZED: 'AuthRequired',
  SERVER_ERROR: 'InternalServerError',
  TIMEOUT: 'RequestTimeout',
  NETWORK_ERROR: 'NetworkError'
}

// Discovery patterns for finding new users
export const DISCOVERY_PATTERNS = {
  HASHTAGS: [
    'ai', 'tech', 'science', 'art', 'music', 'news', 'politics', 'sports',
    'photography', 'design', 'programming', 'crypto', 'web3', 'climate',
    'education', 'health', 'food', 'travel', 'books', 'movies', 'gaming'
  ],
  
  SEARCH_TERMS: [
    'bluesky', 'atproto', 'decentralized', 'social', 'twitter', 'mastodon',
    'developer', 'researcher', 'artist', 'journalist', 'scientist'
  ],

  // Common handle patterns to try
  HANDLE_PATTERNS: [
    '{username}.bsky.social',
    '{username}.com',
    '{username}.org',
    '{username}.net'
  ]
}

export default {
  API_BASE_URL,
  ENDPOINTS,
  RATE_LIMITS,
  REQUEST_CONFIG,
  QUERY_PARAMS,
  ERROR_CODES,
  DISCOVERY_PATTERNS
} 