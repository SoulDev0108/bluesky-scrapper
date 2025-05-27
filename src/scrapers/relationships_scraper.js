import ApiClient from '../core/api_client.js'
import DataValidator from '../utils/data_validator.js'
import Deduplicator from '../utils/deduplicator.js'
import FileManager from '../utils/file_manager.js'
import CheckpointManager from '../core/checkpoint_manager.js'
import logger from '../core/logger.js'
import settings from '../config/settings.js'

/**
 * Relationships Scraper for mapping follower/following networks
 * Performs deep crawling of social connections with configurable depth
 */
class RelationshipsScraper {
    constructor(options = {}) {
        this.apiClient = new ApiClient();
        this.validator = new DataValidator();
        this.deduplicator = new Deduplicator();
        this.fileManager = new FileManager();
        this.checkpointManager = new CheckpointManager();
        
        this.options = {
            batchSize: options.batchSize || 100,
            maxRelationships: options.maxRelationships || 10000000,
            maxDepth: options.maxDepth || 3,
            maxFollowersPerUser: options.maxFollowersPerUser || 1000,
            maxFollowingPerUser: options.maxFollowingPerUser || 1000,
            saveInterval: options.saveInterval || 1000,
            checkpointInterval: options.checkpointInterval || 5000,
            prioritizePopularUsers: options.prioritizePopularUsers || true,
            minFollowerCount: options.minFollowerCount || 10,
            ...options
        };
        
        this.stats = {
            usersProcessed: 0,
            relationshipsDiscovered: 0,
            relationshipsProcessed: 0,
            relationshipsSaved: 0,
            duplicatesSkipped: 0,
            errors: 0,
            currentDepth: 0,
            startTime: null,
            lastSaveTime: null
        };
        
        this.isRunning = false;
        this.shouldStop = false;
        this.currentBatch = [];
        this.userQueue = [];
        this.processedUsers = new Set();
        this.depthQueues = new Map(); // Map of depth -> user queue
    }

    /**
     * Initialize the scraper
     */
    async initialize() {
        try {
            await this.apiClient.initialize();
            await this.deduplicator.initialize();
            await this.fileManager.initialize();
            
            // Initialize depth queues
            for (let i = 0; i <= this.options.maxDepth; i++) {
                this.depthQueues.set(i, []);
            }
            
            logger.info('Relationships scraper initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize relationships scraper:', error);
            throw error;
        }
    }

    /**
     * Start scraping relationships
     * @param {Object} resumeOptions - Options for resuming from checkpoint
     */
    async start(resumeOptions = {}) {
        if (this.isRunning) {
            throw new Error('Scraper is already running');
        }

        this.isRunning = true;
        this.shouldStop = false;
        this.stats.startTime = new Date();
        
        logger.info('Starting relationships scraper', {
            maxRelationships: this.options.maxRelationships,
            maxDepth: this.options.maxDepth,
            batchSize: this.options.batchSize
        });

        try {
            // Try to resume from checkpoint
            let checkpoint = null;
            if (resumeOptions.resume) {
                checkpoint = await this.checkpointManager.loadCheckpoint('relationships_scraper');
                if (checkpoint) {
                    logger.info('Resuming from checkpoint', checkpoint.metadata);
                    this.stats = { ...this.stats, ...checkpoint.data.stats };
                    this.processedUsers = new Set(checkpoint.data.processedUsers || []);
                    this.loadDepthQueues(checkpoint.data.depthQueues || {});
                }
            }

            // Load initial user queue if not resuming
            if (!checkpoint) {
                await this.loadInitialUserQueue();
            }
            
            // Start scraping process
            await this.scrapeRelationships(checkpoint);
            
            // Final save
            await this.saveBatch(true);
            
            logger.info('Relationships scraping completed', this.getStats());
            
        } catch (error) {
            logger.error('Relationships scraping failed:', error);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Stop the scraper gracefully
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }
        
        logger.info('Stopping relationships scraper...');
        this.shouldStop = true;
        
        // Wait for current operation to complete
        while (this.isRunning) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        logger.info('Relationships scraper stopped');
    }

    /**
     * Load initial user queue from saved user files
     */
    async loadInitialUserQueue() {
        try {
            const userFiles = await this.fileManager.listFiles('users');
            
            if (userFiles.length === 0) {
                throw new Error('No user files found. Run users scraper first.');
            }

            logger.info(`Loading seed users from ${userFiles.length} files`);
            
            const seedUsers = [];
            
            for (const file of userFiles) {
                if (this.shouldStop) break;
                
                try {
                    const fileData = await this.fileManager.loadData(file);
                    const users = fileData.data || [];
                    
                    for (const user of users) {
                        if (user.did && user.followersCount >= this.options.minFollowerCount) {
                            seedUsers.push({
                                did: user.did,
                                handle: user.handle,
                                displayName: user.displayName,
                                followersCount: user.followersCount || 0,
                                followsCount: user.followsCount || 0,
                                depth: 0
                            });
                        }
                    }
                } catch (error) {
                    logger.error(`Error loading user file ${file}:`, error);
                }
            }
            
            // Sort by follower count if prioritizing popular users
            if (this.options.prioritizePopularUsers) {
                seedUsers.sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0));
            }
            
            // Add to depth 0 queue
            this.depthQueues.get(0).push(...seedUsers.slice(0, 1000)); // Limit initial seeds
            
            logger.info(`Loaded ${this.depthQueues.get(0).length} seed users for relationship scraping`);
            
        } catch (error) {
            logger.error('Error loading initial user queue:', error);
            throw error;
        }
    }

    /**
     * Load depth queues from checkpoint
     * @param {Object} depthQueuesData - Saved depth queues data
     */
    loadDepthQueues(depthQueuesData) {
        for (const [depth, users] of Object.entries(depthQueuesData)) {
            const depthNum = parseInt(depth);
            if (depthNum <= this.options.maxDepth) {
                this.depthQueues.set(depthNum, users || []);
            }
        }
    }

    /**
     * Main scraping logic
     * @param {Object} checkpoint - Checkpoint data for resuming
     */
    async scrapeRelationships(checkpoint = null) {
        let startDepth = 0;
        
        if (checkpoint && checkpoint.data.currentDepth !== undefined) {
            startDepth = checkpoint.data.currentDepth;
        }

        for (let depth = startDepth; depth <= this.options.maxDepth && !this.shouldStop; depth++) {
            this.stats.currentDepth = depth;
            const queue = this.depthQueues.get(depth);
            
            if (!queue || queue.length === 0) {
                logger.info(`No users in queue for depth ${depth}, skipping`);
                continue;
            }
            
            logger.info(`Processing depth ${depth} with ${queue.length} users`);
            
            while (queue.length > 0 && !this.shouldStop) {
                const user = queue.shift();
                
                if (this.processedUsers.has(user.did)) {
                    continue;
                }
                
                try {
                    await this.scrapeUserRelationships(user, depth);
                    this.processedUsers.add(user.did);
                    this.stats.usersProcessed++;
                    
                    // Save checkpoint periodically
                    if (this.stats.usersProcessed % 50 === 0) {
                        await this.saveCheckpoint(depth);
                    }
                    
                } catch (error) {
                    logger.error(`Error scraping relationships for ${user.handle}:`, error);
                    this.stats.errors++;
                }
                
                if (this.stats.relationshipsProcessed >= this.options.maxRelationships) {
                    logger.info('Reached maximum relationships limit');
                    return;
                }
            }
        }
    }

    /**
     * Scrape relationships for a specific user
     * @param {Object} user - User object with DID and handle
     * @param {number} currentDepth - Current crawling depth
     */
    async scrapeUserRelationships(user, currentDepth) {
        logger.debug(`Scraping relationships for ${user.handle} at depth ${currentDepth}`);
        
        // Scrape followers
        await this.scrapeUserFollowers(user, currentDepth);
        
        // Scrape following
        await this.scrapeUserFollowing(user, currentDepth);
    }

    /**
     * Scrape followers for a user
     * @param {Object} user - User object
     * @param {number} currentDepth - Current depth
     */
    async scrapeUserFollowers(user, currentDepth) {
        let cursor = null;
        let followersScraped = 0;
        const maxFollowers = Math.min(
            this.options.maxFollowersPerUser,
            user.followersCount || this.options.maxFollowersPerUser
        );
        
        do {
            try {
                const response = await this.apiClient.getFollowers(user.did, {
                    limit: this.options.batchSize,
                    cursor: cursor
                });
                
                if (response.followers && response.followers.length > 0) {
                    await this.processRelationships(
                        response.followers,
                        user,
                        'follower',
                        currentDepth
                    );
                    
                    followersScraped += response.followers.length;
                }
                
                cursor = response.cursor;
                
                // Check limits
                if (followersScraped >= maxFollowers) {
                    break;
                }
                
                if (this.stats.relationshipsProcessed >= this.options.maxRelationships) {
                    break;
                }
                
            } catch (error) {
                logger.error(`Error getting followers for ${user.handle}:`, error);
                this.stats.errors++;
                break;
            }
            
        } while (cursor && !this.shouldStop);
    }

    /**
     * Scrape following for a user
     * @param {Object} user - User object
     * @param {number} currentDepth - Current depth
     */
    async scrapeUserFollowing(user, currentDepth) {
        let cursor = null;
        let followingScraped = 0;
        const maxFollowing = Math.min(
            this.options.maxFollowingPerUser,
            user.followsCount || this.options.maxFollowingPerUser
        );
        
        do {
            try {
                const response = await this.apiClient.getFollows(user.did, {
                    limit: this.options.batchSize,
                    cursor: cursor
                });
                
                if (response.follows && response.follows.length > 0) {
                    await this.processRelationships(
                        response.follows,
                        user,
                        'following',
                        currentDepth
                    );
                    
                    followingScraped += response.follows.length;
                }
                
                cursor = response.cursor;
                
                // Check limits
                if (followingScraped >= maxFollowing) {
                    break;
                }
                
                if (this.stats.relationshipsProcessed >= this.options.maxRelationships) {
                    break;
                }
                
            } catch (error) {
                logger.error(`Error getting following for ${user.handle}:`, error);
                this.stats.errors++;
                break;
            }
            
        } while (cursor && !this.shouldStop);
    }

    /**
     * Process a batch of relationships
     * @param {Array} relationships - Array of relationship objects
     * @param {Object} sourceUser - Source user object
     * @param {string} relationshipType - 'follower' or 'following'
     * @param {number} currentDepth - Current crawling depth
     */
    async processRelationships(relationships, sourceUser, relationshipType, currentDepth) {
        if (!Array.isArray(relationships) || relationships.length === 0) {
            return;
        }

        this.stats.relationshipsDiscovered += relationships.length;
        
        // Validate relationships
        const validation = this.validator.validateBatch(relationships, 'follow');
        const validRelationships = validation.validItems;
        
        if (validation.errors.length > 0) {
            logger.warn(`Relationship validation errors: ${validation.errors.length}/${relationships.length}`);
            this.stats.errors += validation.errors.length;
        }

        // Process each relationship
        const newRelationships = [];
        const nextDepthUsers = [];
        
        for (const relationship of validRelationships) {
            try {
                const targetUser = relationship.subject;
                if (!targetUser || !targetUser.did) {
                    continue;
                }
                
                // Create relationship record
                const relationshipRecord = {
                    source: {
                        did: sourceUser.did,
                        handle: sourceUser.handle
                    },
                    target: {
                        did: targetUser.did,
                        handle: targetUser.handle,
                        displayName: targetUser.displayName
                    },
                    type: relationshipType,
                    depth: currentDepth,
                    createdAt: relationship.createdAt,
                    indexedAt: relationship.indexedAt,
                    uri: relationship.uri
                };
                
                // Check for duplicates
                const relationshipId = `${sourceUser.did}:${targetUser.did}`;
                const isDuplicate = await this.deduplicator.isFollowDuplicate(
                    sourceUser.did,
                    targetUser.did
                );
                
                if (!isDuplicate) {
                    newRelationships.push(relationshipRecord);
                    await this.deduplicator.markFollowProcessed(
                        sourceUser.did,
                        targetUser.did,
                        {
                            type: relationshipType,
                            depth: currentDepth,
                            scrapedAt: new Date().toISOString()
                        }
                    );
                    
                    // Add target user to next depth queue if within limits
                    if (currentDepth < this.options.maxDepth && 
                        !this.processedUsers.has(targetUser.did) &&
                        (targetUser.followersCount || 0) >= this.options.minFollowerCount) {
                        
                        nextDepthUsers.push({
                            did: targetUser.did,
                            handle: targetUser.handle,
                            displayName: targetUser.displayName,
                            followersCount: targetUser.followersCount || 0,
                            followsCount: targetUser.followsCount || 0,
                            depth: currentDepth + 1
                        });
                    }
                } else {
                    this.stats.duplicatesSkipped++;
                }
                
            } catch (error) {
                logger.error(`Error processing relationship:`, error);
                this.stats.errors++;
            }
        }

        if (newRelationships.length > 0) {
            // Add metadata to relationships
            const enrichedRelationships = newRelationships.map(rel => ({
                ...rel,
                _metadata: {
                    scrapedAt: new Date().toISOString(),
                    scraper: 'relationships_scraper',
                    version: '1.0.0',
                    sourceUser: sourceUser.handle,
                    depth: currentDepth
                }
            }));

            this.currentBatch.push(...enrichedRelationships);
            this.stats.relationshipsProcessed += newRelationships.length;
            
            logger.debug(`Processed ${newRelationships.length} new relationships from ${sourceUser.handle}`);
        }

        // Add users to next depth queue
        if (nextDepthUsers.length > 0 && currentDepth < this.options.maxDepth) {
            const nextDepthQueue = this.depthQueues.get(currentDepth + 1);
            
            // Sort by follower count if prioritizing popular users
            if (this.options.prioritizePopularUsers) {
                nextDepthUsers.sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0));
            }
            
            nextDepthQueue.push(...nextDepthUsers);
            
            logger.debug(`Added ${nextDepthUsers.length} users to depth ${currentDepth + 1} queue`);
        }

        // Save batch if needed
        if (this.currentBatch.length >= this.options.saveInterval) {
            await this.saveBatch();
        }
    }

    /**
     * Save current batch to file
     * @param {boolean} force - Force save even if batch is small
     */
    async saveBatch(force = false) {
        if (this.currentBatch.length === 0) {
            return;
        }

        if (!force && this.currentBatch.length < this.options.saveInterval) {
            return;
        }

        try {
            const filePath = await this.fileManager.saveRelationships(this.currentBatch, {
                scraper: 'relationships_scraper',
                batchSize: this.currentBatch.length,
                totalProcessed: this.stats.relationshipsProcessed,
                currentDepth: this.stats.currentDepth,
                stats: this.getStats()
            });

            this.stats.relationshipsSaved += this.currentBatch.length;
            this.stats.lastSaveTime = new Date();
            
            logger.info(`Saved batch of ${this.currentBatch.length} relationships to ${filePath}`);
            
            // Clear batch
            this.currentBatch = [];
            
        } catch (error) {
            logger.error('Error saving relationships batch:', error);
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * Save checkpoint for resuming
     * @param {number} currentDepth - Current crawling depth
     */
    async saveCheckpoint(currentDepth) {
        try {
            // Convert depth queues to serializable format
            const depthQueuesData = {};
            for (const [depth, queue] of this.depthQueues.entries()) {
                depthQueuesData[depth] = queue;
            }
            
            await this.checkpointManager.saveCheckpoint('relationships_scraper', {
                currentDepth,
                processedUsers: Array.from(this.processedUsers),
                depthQueues: depthQueuesData,
                stats: this.stats,
                options: this.options
            }, {
                scraper: 'relationships_scraper',
                timestamp: new Date().toISOString()
            });
            
            logger.debug('Checkpoint saved');
            
        } catch (error) {
            logger.error('Error saving checkpoint:', error);
        }
    }

    /**
     * Analyze relationship patterns
     * @returns {Object} Relationship analysis
     */
    analyzeRelationships() {
        // This would analyze the scraped relationships for patterns
        // For now, return basic stats
        return {
            totalRelationships: this.stats.relationshipsProcessed,
            averageRelationshipsPerUser: this.stats.usersProcessed > 0 
                ? Math.round(this.stats.relationshipsProcessed / this.stats.usersProcessed)
                : 0,
            currentDepth: this.stats.currentDepth,
            queueSizes: Object.fromEntries(
                Array.from(this.depthQueues.entries()).map(([depth, queue]) => [depth, queue.length])
            )
        };
    }

    /**
     * Get relationship network statistics
     * @returns {Object} Network statistics
     */
    getNetworkStats() {
        const queueSizes = {};
        let totalQueueSize = 0;
        
        for (const [depth, queue] of this.depthQueues.entries()) {
            queueSizes[depth] = queue.length;
            totalQueueSize += queue.length;
        }
        
        return {
            queueSizes,
            totalQueueSize,
            processedUsersCount: this.processedUsers.size,
            currentDepth: this.stats.currentDepth,
            maxDepth: this.options.maxDepth,
            relationshipDensity: this.stats.usersProcessed > 0 
                ? (this.stats.relationshipsProcessed / this.stats.usersProcessed).toFixed(2)
                : 0
        };
    }

    /**
     * Get scraper statistics
     * @returns {Object} Current statistics
     */
    getStats() {
        const now = new Date();
        const runtime = this.stats.startTime ? now - this.stats.startTime : 0;
        const runtimeHours = runtime / (1000 * 60 * 60);
        
        return {
            ...this.stats,
            runtime: runtime,
            runtimeFormatted: this.formatDuration(runtime),
            relationshipsPerHour: runtimeHours > 0 ? Math.round(this.stats.relationshipsProcessed / runtimeHours) : 0,
            usersPerHour: runtimeHours > 0 ? Math.round(this.stats.usersProcessed / runtimeHours) : 0,
            currentBatchSize: this.currentBatch.length,
            networkStats: this.getNetworkStats(),
            deduplicationStats: this.deduplicator.getStats(),
            isRunning: this.isRunning
        };
    }

    /**
     * Format duration in human readable format
     * @param {number} ms - Duration in milliseconds
     * @returns {string} Formatted duration
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Clean up resources
     */
    async cleanup() {
        try {
            await this.saveBatch(true);
            await this.deduplicator.close();
            logger.info('Relationships scraper cleanup completed');
        } catch (error) {
            logger.error('Error during cleanup:', error);
        }
    }
}

export default RelationshipsScraper; 