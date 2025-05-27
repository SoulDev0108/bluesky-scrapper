import logger from '../core/logger.js'

/**
 * Data validation utilities for Bluesky scraper
 * Validates and sanitizes data from AT Protocol responses
 */
class DataValidator {
    constructor() {
        this.requiredUserFields = ['did', 'handle'];
        this.requiredPostFields = ['uri', 'cid', 'author'];
        this.requiredFollowFields = ['subject', 'cursor'];
    }

    /**
     * Validate user profile data
     * @param {Object} user - User profile data
     * @returns {Object} Validated and sanitized user data
     */
    validateUser(user) {
        if (!user || typeof user !== 'object') {
            throw new Error('Invalid user data: must be an object');
        }

        // Check required fields
        for (const field of this.requiredUserFields) {
            if (!user[field]) {
                throw new Error(`Missing required user field: ${field}`);
            }
        }

        // Validate DID format
        if (!this.isValidDID(user.did)) {
            throw new Error(`Invalid DID format: ${user.did}`);
        }

        // Validate handle format
        if (!this.isValidHandle(user.handle)) {
            throw new Error(`Invalid handle format: ${user.handle}`);
        }

        return {
            did: user.did,
            handle: user.handle,
            displayName: this.sanitizeString(user.displayName),
            description: this.sanitizeString(user.description),
            avatar: this.sanitizeUrl(user.avatar),
            banner: this.sanitizeUrl(user.banner),
            followersCount: this.sanitizeNumber(user.followersCount),
            followsCount: this.sanitizeNumber(user.followsCount),
            postsCount: this.sanitizeNumber(user.postsCount),
            indexedAt: this.sanitizeDate(user.indexedAt),
            createdAt: this.sanitizeDate(user.createdAt),
            labels: Array.isArray(user.labels) ? user.labels : [],
            viewer: user.viewer || {},
            associated: user.associated || {}
        };
    }

    /**
     * Validate post data
     * @param {Object} post - Post data
     * @returns {Object} Validated and sanitized post data
     */
    validatePost(post) {
        if (!post || typeof post !== 'object') {
            throw new Error('Invalid post data: must be an object');
        }

        // Check required fields
        for (const field of this.requiredPostFields) {
            if (!post[field]) {
                throw new Error(`Missing required post field: ${field}`);
            }
        }

        // Validate URI format
        if (!this.isValidATUri(post.uri)) {
            throw new Error(`Invalid AT URI format: ${post.uri}`);
        }

        const record = post.record || {};
        
        return {
            uri: post.uri,
            cid: post.cid,
            author: this.validateUser(post.author),
            record: {
                text: this.sanitizeString(record.text),
                createdAt: this.sanitizeDate(record.createdAt),
                langs: Array.isArray(record.langs) ? record.langs : [],
                reply: record.reply || null,
                embed: record.embed || null,
                facets: Array.isArray(record.facets) ? record.facets : [],
                tags: Array.isArray(record.tags) ? record.tags : []
            },
            replyCount: this.sanitizeNumber(post.replyCount),
            repostCount: this.sanitizeNumber(post.repostCount),
            likeCount: this.sanitizeNumber(post.likeCount),
            indexedAt: this.sanitizeDate(post.indexedAt),
            viewer: post.viewer || {},
            labels: Array.isArray(post.labels) ? post.labels : [],
            threadgate: post.threadgate || null
        };
    }

    /**
     * Validate follow relationship data
     * @param {Object} follow - Follow relationship data
     * @returns {Object} Validated follow data
     */
    validateFollow(follow) {
        if (!follow || typeof follow !== 'object') {
            throw new Error('Invalid follow data: must be an object');
        }

        if (!follow.subject) {
            throw new Error('Missing required follow field: subject');
        }

        return {
            subject: this.validateUser(follow.subject),
            createdAt: this.sanitizeDate(follow.createdAt),
            indexedAt: this.sanitizeDate(follow.indexedAt),
            uri: follow.uri || null,
            cid: follow.cid || null
        };
    }

    /**
     * Validate search results
     * @param {Object} results - Search results
     * @returns {Object} Validated search results
     */
    validateSearchResults(results) {
        if (!results || typeof results !== 'object') {
            throw new Error('Invalid search results: must be an object');
        }

        return {
            actors: Array.isArray(results.actors) 
                ? results.actors.map(actor => this.validateUser(actor))
                : [],
            cursor: results.cursor || null,
            hitsTotal: this.sanitizeNumber(results.hitsTotal)
        };
    }

    /**
     * Validate DID format
     * @param {string} did - DID string
     * @returns {boolean} True if valid DID
     */
    isValidDID(did) {
        if (typeof did !== 'string') return false;
        return /^did:[a-z]+:[a-zA-Z0-9._-]+$/.test(did);
    }

    /**
     * Validate handle format
     * @param {string} handle - Handle string
     * @returns {boolean} True if valid handle
     */
    isValidHandle(handle) {
        if (typeof handle !== 'string') return false;
        return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(handle);
    }

    /**
     * Validate AT URI format
     * @param {string} uri - AT URI string
     * @returns {boolean} True if valid AT URI
     */
    isValidATUri(uri) {
        if (typeof uri !== 'string') return false;
        return /^at:\/\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(uri);
    }

    /**
     * Sanitize string input
     * @param {any} value - Input value
     * @returns {string|null} Sanitized string or null
     */
    sanitizeString(value) {
        if (typeof value !== 'string') return null;
        return value.trim().substring(0, 10000); // Limit length
    }

    /**
     * Sanitize URL input
     * @param {any} value - Input value
     * @returns {string|null} Sanitized URL or null
     */
    sanitizeUrl(value) {
        if (typeof value !== 'string') return null;
        try {
            new URL(value);
            return value;
        } catch {
            return null;
        }
    }

    /**
     * Sanitize number input
     * @param {any} value - Input value
     * @returns {number} Sanitized number
     */
    sanitizeNumber(value) {
        const num = parseInt(value);
        return isNaN(num) ? 0 : Math.max(0, num);
    }

    /**
     * Sanitize date input
     * @param {any} value - Input value
     * @returns {string|null} ISO date string or null
     */
    sanitizeDate(value) {
        if (!value) return null;
        try {
            const date = new Date(value);
            return isNaN(date.getTime()) ? null : date.toISOString();
        } catch {
            return null;
        }
    }

    /**
     * Validate batch of items
     * @param {Array} items - Array of items to validate
     * @param {string} type - Type of validation ('user', 'post', 'follow')
     * @returns {Array} Array of validated items
     */
    validateBatch(items, type) {
        if (!Array.isArray(items)) {
            throw new Error('Items must be an array');
        }

        const validItems = [];
        const errors = [];

        for (let i = 0; i < items.length; i++) {
            try {
                let validItem;
                switch (type) {
                    case 'user':
                        validItem = this.validateUser(items[i]);
                        break;
                    case 'post':
                        validItem = this.validatePost(items[i]);
                        break;
                    case 'follow':
                        validItem = this.validateFollow(items[i]);
                        break;
                    default:
                        throw new Error(`Unknown validation type: ${type}`);
                }
                validItems.push(validItem);
            } catch (error) {
                errors.push({
                    index: i,
                    item: items[i],
                    error: error.message
                });
                logger.warn(`Validation error at index ${i}:`, error.message);
            }
        }

        if (errors.length > 0) {
            logger.warn(`Validation completed with ${errors.length} errors out of ${items.length} items`);
        }

        return {
            validItems,
            errors,
            stats: {
                total: items.length,
                valid: validItems.length,
                invalid: errors.length,
                successRate: (validItems.length / items.length * 100).toFixed(2) + '%'
            }
        };
    }
}

export default DataValidator; 