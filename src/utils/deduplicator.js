import bloomFilters from 'bloom-filters'
const { BloomFilter } = bloomFilters
import redis from 'redis'
import crypto from 'crypto'
import logger from '../core/logger.js'
import settings from '../config/settings.js'

/**
 * Deduplication utility using Bloom filters and Redis
 * Efficiently tracks scraped users, posts, and relationships
 */
class Deduplicator {
    constructor() {
        this.bloomFilters = {
            users: null,
            posts: null,
            follows: null
        };
        
        this.redisClient = null;
        this.isInitialized = false;
        
        // Bloom filter configurations
        this.bloomConfig = {
            users: {
                expectedElements: settings.DATA_VALIDATION?.BLOOM_FILTER_SIZE || 1000000,
                falsePositiveRate: settings.DATA_VALIDATION?.BLOOM_FILTER_ERROR_RATE || 0.01
            },
            posts: {
                expectedElements: (settings.DATA_VALIDATION?.BLOOM_FILTER_SIZE || 1000000) * 5,
                falsePositiveRate: settings.DATA_VALIDATION?.BLOOM_FILTER_ERROR_RATE || 0.01
            },
            follows: {
                expectedElements: (settings.DATA_VALIDATION?.BLOOM_FILTER_SIZE || 1000000) * 10,
                falsePositiveRate: settings.DATA_VALIDATION?.BLOOM_FILTER_ERROR_RATE || 0.01
            }
        };
        
        this.stats = {
            users: { checked: 0, duplicates: 0, added: 0 },
            posts: { checked: 0, duplicates: 0, added: 0 },
            follows: { checked: 0, duplicates: 0, added: 0 }
        };
    }

    /**
     * Initialize deduplicator with Redis and Bloom filters
     */
    async initialize() {
        try {
            // Initialize Redis client
            this.redisClient = redis.createClient({
                url: settings.REDIS?.URL || 'redis://localhost:6379',
                password: settings.REDIS?.PASSWORD || undefined,
                database: settings.REDIS?.DB || 0
            });

            await this.redisClient.connect();
            logger.info('Redis client connected for deduplication');

            // Initialize or load Bloom filters
            await this.initializeBloomFilters();
            
            this.isInitialized = true;
            logger.info('Deduplicator initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize deduplicator:', error);
            throw error;
        }
    }

    /**
     * Initialize Bloom filters from Redis or create new ones
     */
    async initializeBloomFilters() {
        for (const [type, config] of Object.entries(this.bloomConfig)) {
            try {
                // Try to load existing Bloom filter from Redis
                const serialized = await this.redisClient.get(`bloom:${type}`);
                
                if (serialized) {
                    this.bloomFilters[type] = BloomFilter.fromJSON(JSON.parse(serialized));
                    logger.info(`Loaded existing Bloom filter for ${type}`);
                } else {
                    // Validate parameters before creating BloomFilter
                    const expectedElements = Math.max(1, config.expectedElements || 1000000);
                    const falsePositiveRate = Math.min(0.99, Math.max(0.001, config.falsePositiveRate || 0.01));
                    
                    // Calculate optimal parameters for BloomFilter
                    // Using the formula: m = -(n * ln(p)) / (ln(2)^2) for size
                    // and k = (m/n) * ln(2) for number of hash functions
                    const optimalSize = Math.ceil(-(expectedElements * Math.log(falsePositiveRate)) / (Math.log(2) ** 2));
                    const optimalHashCount = Math.max(1, Math.round((optimalSize / expectedElements) * Math.log(2)));
                    
                    logger.info(`Creating Bloom filter for ${type}`, {
                        expectedElements,
                        falsePositiveRate,
                        optimalSize,
                        optimalHashCount,
                        originalConfig: config
                    });
                    
                    // Create new Bloom filter with correct parameter order: (size, nbHashes)
                    this.bloomFilters[type] = new BloomFilter(
                        optimalSize,
                        optimalHashCount
                    );
                    logger.info(`Created new Bloom filter for ${type}`);
                }
            } catch (error) {
                logger.error(`Failed to initialize Bloom filter for ${type}:`, error);
                // Create new filter as fallback with safe defaults
                const safeExpectedElements = 1000000;
                const safeFalsePositiveRate = 0.01;
                
                // Calculate optimal parameters for fallback BloomFilter
                const fallbackSize = Math.ceil(-(safeExpectedElements * Math.log(safeFalsePositiveRate)) / (Math.log(2) ** 2));
                const fallbackHashCount = Math.max(1, Math.round((fallbackSize / safeExpectedElements) * Math.log(2)));
                
                logger.info(`Creating fallback Bloom filter for ${type}`, {
                    expectedElements: safeExpectedElements,
                    falsePositiveRate: safeFalsePositiveRate,
                    fallbackSize,
                    fallbackHashCount
                });
                
                this.bloomFilters[type] = new BloomFilter(
                    fallbackSize,
                    fallbackHashCount
                );
            }
        }
    }

    /**
     * Check if user has been processed
     * @param {string} userIdentifier - User DID or handle
     * @returns {boolean} True if user is duplicate
     */
    async isUserDuplicate(userIdentifier) {
        if (!this.isInitialized) {
            throw new Error('Deduplicator not initialized');
        }

        this.stats.users.checked++;
        
        const hash = this.hashIdentifier(userIdentifier);
        
        // Check Bloom filter first (fast)
        if (!this.bloomFilters.users.has(hash)) {
            return false; // Definitely not a duplicate
        }
        
        // Check Redis for confirmation (slower but accurate)
        const exists = await this.redisClient.exists(`user:${hash}`);
        
        if (exists) {
            this.stats.users.duplicates++;
            return true;
        }
        
        return false;
    }

    /**
     * Check if post has been processed
     * @param {string} postUri - Post AT URI
     * @returns {boolean} True if post is duplicate
     */
    async isPostDuplicate(postUri) {
        if (!this.isInitialized) {
            throw new Error('Deduplicator not initialized');
        }

        this.stats.posts.checked++;
        
        const hash = this.hashIdentifier(postUri);
        
        // Check Bloom filter first
        if (!this.bloomFilters.posts.has(hash)) {
            return false;
        }
        
        // Check Redis for confirmation
        const exists = await this.redisClient.exists(`post:${hash}`);
        
        if (exists) {
            this.stats.posts.duplicates++;
            return true;
        }
        
        return false;
    }

    /**
     * Check if follow relationship has been processed
     * @param {string} followerDid - Follower DID
     * @param {string} followeeDid - Followee DID
     * @returns {boolean} True if relationship is duplicate
     */
    async isFollowDuplicate(followerDid, followeeDid) {
        if (!this.isInitialized) {
            throw new Error('Deduplicator not initialized');
        }

        this.stats.follows.checked++;
        
        const relationshipId = `${followerDid}:${followeeDid}`;
        const hash = this.hashIdentifier(relationshipId);
        
        // Check Bloom filter first
        if (!this.bloomFilters.follows.has(hash)) {
            return false;
        }
        
        // Check Redis for confirmation
        const exists = await this.redisClient.exists(`follow:${hash}`);
        
        if (exists) {
            this.stats.follows.duplicates++;
            return true;
        }
        
        return false;
    }

    /**
     * Mark user as processed
     * @param {string} userIdentifier - User DID or handle
     * @param {Object} metadata - Optional metadata to store
     */
    async markUserProcessed(userIdentifier, metadata = {}) {
        if (!this.isInitialized) {
            throw new Error('Deduplicator not initialized');
        }

        const hash = this.hashIdentifier(userIdentifier);
        
        // Add to Bloom filter
        this.bloomFilters.users.add(hash);
        
        // Store in Redis with metadata
        const data = {
            identifier: userIdentifier,
            processedAt: new Date().toISOString(),
            ...metadata
        };
        
        await this.redisClient.setEx(
            `user:${hash}`, 
            86400 * 7, // 7 days default
            JSON.stringify(data)
        );
        
        this.stats.users.added++;
    }

    /**
     * Mark post as processed
     * @param {string} postUri - Post AT URI
     * @param {Object} metadata - Optional metadata to store
     */
    async markPostProcessed(postUri, metadata = {}) {
        if (!this.isInitialized) {
            throw new Error('Deduplicator not initialized');
        }

        const hash = this.hashIdentifier(postUri);
        
        // Add to Bloom filter
        this.bloomFilters.posts.add(hash);
        
        // Store in Redis with metadata
        const data = {
            uri: postUri,
            processedAt: new Date().toISOString(),
            ...metadata
        };
        
        await this.redisClient.setEx(
            `post:${hash}`, 
            86400 * 7, // 7 days default
            JSON.stringify(data)
        );
        
        this.stats.posts.added++;
    }

    /**
     * Mark follow relationship as processed
     * @param {string} followerDid - Follower DID
     * @param {string} followeeDid - Followee DID
     * @param {Object} metadata - Optional metadata to store
     */
    async markFollowProcessed(followerDid, followeeDid, metadata = {}) {
        if (!this.isInitialized) {
            throw new Error('Deduplicator not initialized');
        }

        const relationshipId = `${followerDid}:${followeeDid}`;
        const hash = this.hashIdentifier(relationshipId);
        
        // Add to Bloom filter
        this.bloomFilters.follows.add(hash);
        
        // Store in Redis with metadata
        const data = {
            follower: followerDid,
            followee: followeeDid,
            processedAt: new Date().toISOString(),
            ...metadata
        };
        
        await this.redisClient.setEx(
            `follow:${hash}`, 
            86400 * 7, // 7 days default
            JSON.stringify(data)
        );
        
        this.stats.follows.added++;
    }

    /**
     * Batch check for duplicates
     * @param {Array} items - Array of items to check
     * @param {string} type - Type of items ('users', 'posts', 'follows')
     * @returns {Object} Results with duplicates and new items
     */
    async batchCheckDuplicates(items, type) {
        if (!Array.isArray(items)) {
            throw new Error('Items must be an array');
        }

        const results = {
            duplicates: [],
            newItems: [],
            stats: {
                total: items.length,
                duplicateCount: 0,
                newCount: 0
            }
        };

        for (const item of items) {
            let isDuplicate = false;
            
            switch (type) {
                case 'users':
                    isDuplicate = await this.isUserDuplicate(item);
                    break;
                case 'posts':
                    isDuplicate = await this.isPostDuplicate(item);
                    break;
                case 'follows':
                    isDuplicate = await this.isFollowDuplicate(item.follower, item.followee);
                    break;
                default:
                    throw new Error(`Unknown type: ${type}`);
            }

            if (isDuplicate) {
                results.duplicates.push(item);
                results.stats.duplicateCount++;
            } else {
                results.newItems.push(item);
                results.stats.newCount++;
            }
        }

        return results;
    }

    /**
     * Save Bloom filters to Redis
     */
    async saveBloomFilters() {
        if (!this.isInitialized) {
            throw new Error('Deduplicator not initialized');
        }

        try {
            for (const [type, filter] of Object.entries(this.bloomFilters)) {
                if (filter) {
                    const serialized = JSON.stringify(filter.toJSON());
                    await this.redisClient.set(`bloom:${type}`, serialized);
                }
            }
            logger.info('Bloom filters saved to Redis');
        } catch (error) {
            logger.error('Failed to save Bloom filters:', error);
            throw error;
        }
    }

    /**
     * Get deduplication statistics
     * @returns {Object} Statistics for all types
     */
    getStats() {
        return {
            ...this.stats,
            bloomFilterStats: {
                users: this.bloomFilters.users ? {
                    size: this.bloomFilters.users.size,
                    nbHashes: this.bloomFilters.users.nbHashes
                } : null,
                posts: this.bloomFilters.posts ? {
                    size: this.bloomFilters.posts.size,
                    nbHashes: this.bloomFilters.posts.nbHashes
                } : null,
                follows: this.bloomFilters.follows ? {
                    size: this.bloomFilters.follows.size,
                    nbHashes: this.bloomFilters.follows.nbHashes
                } : null
            }
        };
    }

    /**
     * Clear all deduplication data
     * @param {string} type - Type to clear ('users', 'posts', 'follows', 'all')
     */
    async clear(type = 'all') {
        if (!this.isInitialized) {
            throw new Error('Deduplicator not initialized');
        }

        const types = type === 'all' ? ['users', 'posts', 'follows'] : [type];
        
        for (const t of types) {
            // Clear Bloom filter
            if (this.bloomFilters[t]) {
                this.bloomFilters[t].clear();
            }
            
            // Clear Redis keys
            const pattern = `${t}:*`;
            const keys = await this.redisClient.keys(pattern);
            if (keys.length > 0) {
                await this.redisClient.del(keys);
            }
            
            // Clear Bloom filter from Redis
            await this.redisClient.del(`bloom:${t}`);
            
            // Reset stats
            this.stats[t] = { checked: 0, duplicates: 0, added: 0 };
        }
        
        logger.info(`Cleared deduplication data for: ${types.join(', ')}`);
    }

    /**
     * Hash identifier for consistent storage
     * @param {string} identifier - Identifier to hash
     * @returns {string} SHA256 hash
     */
    hashIdentifier(identifier) {
        return crypto.createHash('sha256').update(identifier).digest('hex');
    }

    /**
     * Close connections and save state
     */
    async close() {
        if (this.isInitialized) {
            try {
                await this.saveBloomFilters();
                await this.redisClient.quit();
                this.isInitialized = false;
                logger.info('Deduplicator closed successfully');
            } catch (error) {
                logger.error('Error closing deduplicator:', error);
            }
        }
    }
}

export default Deduplicator 