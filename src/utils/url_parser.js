/**
 * Bluesky URL Parser
 * 
 * Utilities for parsing Bluesky URLs and AT Protocol URIs
 */

/**
 * Parse Bluesky profile URL
 * @param {string} url - Bluesky profile URL
 * @returns {Object|null} Parsed profile information
 */
export function parseProfileUrl(url) {
  if (!url || typeof url !== 'string') {
    return null
  }

  // Match Bluesky profile URLs
  // https://bsky.app/profile/username.bsky.social
  // https://bsky.app/profile/did:plc:abc123...
  const profileMatch = url.match(/^https:\/\/bsky\.app\/profile\/(.+)$/)
  
  if (!profileMatch) {
    return null
  }

  const identifier = profileMatch[1]
  
  return {
    type: 'profile',
    identifier,
    isDid: identifier.startsWith('did:'),
    isHandle: !identifier.startsWith('did:'),
    handle: identifier.startsWith('did:') ? null : identifier,
    did: identifier.startsWith('did:') ? identifier : null
  }
}

/**
 * Parse Bluesky post URL
 * @param {string} url - Bluesky post URL
 * @returns {Object|null} Parsed post information
 */
export function parsePostUrl(url) {
  if (!url || typeof url !== 'string') {
    return null
  }

  // Match Bluesky post URLs
  // https://bsky.app/profile/username.bsky.social/post/abc123def456
  const postMatch = url.match(/^https:\/\/bsky\.app\/profile\/(.+?)\/post\/(.+)$/)
  
  if (!postMatch) {
    return null
  }

  const [, identifier, postId] = postMatch
  
  return {
    type: 'post',
    identifier,
    postId,
    isDid: identifier.startsWith('did:'),
    isHandle: !identifier.startsWith('did:'),
    handle: identifier.startsWith('did:') ? null : identifier,
    did: identifier.startsWith('did:') ? identifier : null,
    atUri: `at://${identifier}/app.bsky.feed.post/${postId}`
  }
}

/**
 * Parse AT Protocol URI
 * @param {string} atUri - AT Protocol URI
 * @returns {Object|null} Parsed AT URI information
 */
export function parseAtUri(atUri) {
  if (!atUri || typeof atUri !== 'string') {
    return null
  }

  // Match AT URIs
  // at://did:plc:abc123.../app.bsky.feed.post/def456...
  // at://username.bsky.social/app.bsky.feed.post/def456...
  const atUriMatch = atUri.match(/^at:\/\/(.+?)\/(.+?)\/(.+)$/)
  
  if (!atUriMatch) {
    return null
  }

  const [, identifier, collection, recordKey] = atUriMatch
  
  return {
    type: 'atUri',
    identifier,
    collection,
    recordKey,
    isDid: identifier.startsWith('did:'),
    isHandle: !identifier.startsWith('did:'),
    handle: identifier.startsWith('did:') ? null : identifier,
    did: identifier.startsWith('did:') ? identifier : null,
    isPost: collection === 'app.bsky.feed.post',
    isProfile: collection === 'app.bsky.actor.profile',
    isFollow: collection === 'app.bsky.graph.follow',
    isLike: collection === 'app.bsky.feed.like',
    isRepost: collection === 'app.bsky.feed.repost'
  }
}

/**
 * Convert handle to DID format (placeholder - would need actual resolution)
 * @param {string} handle - Handle to convert
 * @returns {string|null} DID or null if invalid
 */
export function handleToDid(handle) {
  if (!handle || typeof handle !== 'string') {
    return null
  }

  // This is a placeholder - in a real implementation, you would
  // need to resolve the handle using the AT Protocol identity resolution
  // For now, we'll return null to indicate resolution is needed
  return null
}

/**
 * Convert DID to handle format (placeholder - would need actual resolution)
 * @param {string} did - DID to convert
 * @returns {string|null} Handle or null if invalid
 */
export function didToHandle(did) {
  if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
    return null
  }

  // This is a placeholder - in a real implementation, you would
  // need to resolve the DID using the AT Protocol identity resolution
  // For now, we'll return null to indicate resolution is needed
  return null
}

/**
 * Build Bluesky profile URL from identifier
 * @param {string} identifier - Handle or DID
 * @returns {string} Bluesky profile URL
 */
export function buildProfileUrl(identifier) {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Invalid identifier')
  }

  return `https://bsky.app/profile/${identifier}`
}

/**
 * Build Bluesky post URL from identifier and post ID
 * @param {string} identifier - Handle or DID
 * @param {string} postId - Post ID
 * @returns {string} Bluesky post URL
 */
export function buildPostUrl(identifier, postId) {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Invalid identifier')
  }
  
  if (!postId || typeof postId !== 'string') {
    throw new Error('Invalid post ID')
  }

  return `https://bsky.app/profile/${identifier}/post/${postId}`
}

/**
 * Build AT Protocol URI
 * @param {string} identifier - Handle or DID
 * @param {string} collection - Collection name
 * @param {string} recordKey - Record key
 * @returns {string} AT Protocol URI
 */
export function buildAtUri(identifier, collection, recordKey) {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Invalid identifier')
  }
  
  if (!collection || typeof collection !== 'string') {
    throw new Error('Invalid collection')
  }
  
  if (!recordKey || typeof recordKey !== 'string') {
    throw new Error('Invalid record key')
  }

  return `at://${identifier}/${collection}/${recordKey}`
}

/**
 * Validate Bluesky URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid Bluesky URL
 */
export function isValidBlueskyUrl(url) {
  if (!url || typeof url !== 'string') {
    return false
  }

  return parseProfileUrl(url) !== null || parsePostUrl(url) !== null
}

/**
 * Validate AT Protocol URI format
 * @param {string} atUri - AT URI to validate
 * @returns {boolean} True if valid AT URI
 */
export function isValidAtUri(atUri) {
  if (!atUri || typeof atUri !== 'string') {
    return false
  }

  return parseAtUri(atUri) !== null
}

/**
 * Validate handle format
 * @param {string} handle - Handle to validate
 * @returns {boolean} True if valid handle
 */
export function isValidHandle(handle) {
  if (!handle || typeof handle !== 'string') {
    return false
  }

  // Basic handle validation - should contain at least one dot and valid characters
  return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(handle)
}

/**
 * Validate DID format
 * @param {string} did - DID to validate
 * @returns {boolean} True if valid DID
 */
export function isValidDid(did) {
  if (!did || typeof did !== 'string') {
    return false
  }

  // Basic DID validation
  return /^did:[a-z]+:[a-zA-Z0-9._-]+$/.test(did)
}

/**
 * Extract post ID from AT URI
 * @param {string} atUri - AT Protocol URI
 * @returns {string|null} Post ID or null if not a post URI
 */
export function extractPostId(atUri) {
  const parsed = parseAtUri(atUri)
  
  if (!parsed || !parsed.isPost) {
    return null
  }

  return parsed.recordKey
}

/**
 * Extract identifier from AT URI
 * @param {string} atUri - AT Protocol URI
 * @returns {string|null} Identifier (handle or DID) or null if invalid
 */
export function extractIdentifier(atUri) {
  const parsed = parseAtUri(atUri)
  
  if (!parsed) {
    return null
  }

  return parsed.identifier
}

/**
 * Convert between different URL/URI formats
 * @param {string} input - Input URL or URI
 * @param {string} outputFormat - Desired output format ('profileUrl', 'postUrl', 'atUri')
 * @returns {string|null} Converted URL/URI or null if conversion not possible
 */
export function convertFormat(input, outputFormat) {
  if (!input || typeof input !== 'string') {
    return null
  }

  // Parse input
  let parsed = parseProfileUrl(input) || parsePostUrl(input) || parseAtUri(input)
  
  if (!parsed) {
    return null
  }

  switch (outputFormat) {
    case 'profileUrl':
      if (parsed.type === 'profile' || parsed.type === 'post' || parsed.type === 'atUri') {
        return buildProfileUrl(parsed.identifier)
      }
      break
      
    case 'postUrl':
      if (parsed.type === 'post') {
        return buildPostUrl(parsed.identifier, parsed.postId)
      } else if (parsed.type === 'atUri' && parsed.isPost) {
        return buildPostUrl(parsed.identifier, parsed.recordKey)
      }
      break
      
    case 'atUri':
      if (parsed.type === 'post') {
        return parsed.atUri
      } else if (parsed.type === 'atUri') {
        return input
      }
      break
  }

  return null
}

export default {
  parseProfileUrl,
  parsePostUrl,
  parseAtUri,
  handleToDid,
  didToHandle,
  buildProfileUrl,
  buildPostUrl,
  buildAtUri,
  isValidBlueskyUrl,
  isValidAtUri,
  isValidHandle,
  isValidDid,
  extractPostId,
  extractIdentifier,
  convertFormat
} 