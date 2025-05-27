import ApiClient from '../core/api_client.js'
import DataValidator from '../utils/data_validator.js'
import Deduplicator from '../utils/deduplicator.js'
import FileManager from '../utils/file_manager.js'
import CheckpointManager from '../core/checkpoint_manager.js'
import logger from '../core/logger.js'
import settings from '../config/settings.js'

/**
 * Users Scraper for bulk user discovery and scraping
 * Discovers users through search, trending, and network crawling
 */
class UsersScraper {
    constructor(options = {}) {
        this.apiClient = new ApiClient();
        this.validator = new DataValidator();
        this.deduplicator = new Deduplicator();
        this.fileManager = new FileManager();
        this.checkpointManager = new CheckpointManager();
        
        this.options = {
            batchSize: options.batchSize || 100,
            maxUsers: options.maxUsers || 500000,
            searchTerms: options.searchTerms || this.getDefaultSearchTerms(),
            saveInterval: options.saveInterval || 1000,
            checkpointInterval: options.checkpointInterval || 5000,
            ...options
        };
        
        this.stats = {
            usersDiscovered: 0,
            usersProcessed: 0,
            usersSaved: 0,
            duplicatesSkipped: 0,
            errors: 0,
            startTime: null,
            lastSaveTime: null
        };
        
        this.isRunning = false;
        this.shouldStop = false;
        this.currentBatch = [];
    }

    /**
     * Initialize the scraper
     */
    async initialize() {
        try {
            await this.apiClient.initialize();
            await this.deduplicator.initialize();
            await this.fileManager.initialize();
            
            logger.info('Users scraper initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize users scraper:', error);
            throw error;
        }
    }

    /**
     * Start scraping users
     * @param {Object} resumeOptions - Options for resuming from checkpoint
     */
    async start(resumeOptions = {}) {
        if (this.isRunning) {
            throw new Error('Scraper is already running');
        }

        this.isRunning = true;
        this.shouldStop = false;
        this.stats.startTime = new Date();
        
        logger.info('Starting users scraper', {
            maxUsers: this.options.maxUsers,
            batchSize: this.options.batchSize,
            searchTerms: this.options.searchTerms.length
        });

        try {
            // Try to resume from checkpoint
            let checkpoint = null;
            if (resumeOptions.resume) {
                checkpoint = await this.checkpointManager.loadCheckpoint('users_scraper');
                if (checkpoint) {
                    logger.info('Resuming from checkpoint', checkpoint.metadata);
                    this.stats = { ...this.stats, ...checkpoint.data.stats };
                }
            }

            // Start scraping process
            await this.scrapeUsers(checkpoint);
            
            // Final save
            await this.saveBatch(true);
            
            logger.info('Users scraping completed', this.getStats());
            
        } catch (error) {
            logger.error('Users scraping failed:', error);
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
        
        logger.info('Stopping users scraper...');
        this.shouldStop = true;
        
        // Wait for current operation to complete
        while (this.isRunning) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        logger.info('Users scraper stopped');
    }

    /**
     * Main scraping logic
     * @param {Object} checkpoint - Checkpoint data for resuming
     */
    async scrapeUsers(checkpoint = null) {
        const strategies = [
            { name: 'search', method: this.scrapeBySearch.bind(this) },
            { name: 'popular', method: this.scrapePopularUsers.bind(this) },
            { name: 'network', method: this.scrapeByNetwork.bind(this) }
        ];

        let startStrategy = 0;
        let searchTermIndex = 0;
        
        if (checkpoint) {
            startStrategy = checkpoint.data.currentStrategy || 0;
            searchTermIndex = checkpoint.data.searchTermIndex || 0;
        }

        for (let i = startStrategy; i < strategies.length && !this.shouldStop; i++) {
            const strategy = strategies[i];
            logger.info(`Starting ${strategy.name} strategy`);
            
            try {
                await strategy.method(searchTermIndex);
                
                // Save checkpoint after each strategy
                await this.saveCheckpoint(i, searchTermIndex);
                
            } catch (error) {
                logger.error(`Error in ${strategy.name} strategy:`, error);
                this.stats.errors++;
            }
            
            if (this.stats.usersProcessed >= this.options.maxUsers) {
                logger.info('Reached maximum users limit');
                break;
            }
        }
    }

    /**
     * Scrape users by search terms
     * @param {number} startIndex - Starting search term index
     */
    async scrapeBySearch(startIndex = 0) {
        const searchTerms = this.options.searchTerms;
        
        for (let i = startIndex; i < searchTerms.length && !this.shouldStop; i++) {
            const term = searchTerms[i];
            logger.info(`Searching for users with term: "${term}"`);
            
            let cursor = null;
            let pageCount = 0;
            const maxPages = 50; // Limit pages per search term
            
            do {
                try {
                    const response = await this.apiClient.searchActors(term, {
                        limit: this.options.batchSize,
                        cursor: cursor
                    });
                    
                    if (response.actors && response.actors.length > 0) {
                        await this.processUsers(response.actors, {
                            source: 'search',
                            searchTerm: term,
                            page: pageCount
                        });
                    }
                    
                    cursor = response.cursor;
                    pageCount++;
                    
                    // Check limits
                    if (this.stats.usersProcessed >= this.options.maxUsers) {
                        break;
                    }
                    
                    if (pageCount >= maxPages) {
                        logger.info(`Reached max pages (${maxPages}) for search term: ${term}`);
                        break;
                    }
                    
                } catch (error) {
                    logger.error(`Error searching for "${term}":`, error);
                    this.stats.errors++;
                    break;
                }
                
                // Save checkpoint periodically
                if (this.stats.usersProcessed % this.options.checkpointInterval === 0) {
                    await this.saveCheckpoint(0, i);
                }
                
            } while (cursor && !this.shouldStop);
        }
    }

    /**
     * Scrape popular/trending users
     */
    async scrapePopularUsers() {
        logger.info('Scraping popular users');
        
        // Use various popular search terms and patterns
        const popularTerms = [
            'bsky', 'bluesky', 'twitter', 'tech', 'ai', 'crypto', 'nft',
            'art', 'music', 'news', 'politics', 'science', 'sports'
        ];
        
        for (const term of popularTerms) {
            if (this.shouldStop) break;
            
            try {
                const response = await this.apiClient.searchActors(term, {
                    limit: this.options.batchSize,
                    sort: 'popular' // If supported
                });
                
                if (response.actors && response.actors.length > 0) {
                    await this.processUsers(response.actors, {
                        source: 'popular',
                        searchTerm: term
                    });
                }
                
            } catch (error) {
                logger.error(`Error getting popular users for "${term}":`, error);
                this.stats.errors++;
            }
            
            if (this.stats.usersProcessed >= this.options.maxUsers) {
                break;
            }
        }
    }

    /**
     * Scrape users through network crawling
     */
    async scrapeByNetwork() {
        logger.info('Scraping users by network crawling');
        
        // Get some seed users from already discovered users
        const seedUsers = this.getSeedUsers();
        
        for (const seedUser of seedUsers) {
            if (this.shouldStop) break;
            
            try {
                // Get followers of seed user
                await this.crawlUserNetwork(seedUser.did, 'followers');
                
                // Get following of seed user
                await this.crawlUserNetwork(seedUser.did, 'following');
                
            } catch (error) {
                logger.error(`Error crawling network for ${seedUser.handle}:`, error);
                this.stats.errors++;
            }
            
            if (this.stats.usersProcessed >= this.options.maxUsers) {
                break;
            }
        }
    }

    /**
     * Crawl user network (followers/following)
     * @param {string} userDid - User DID to crawl
     * @param {string} type - 'followers' or 'following'
     */
    async crawlUserNetwork(userDid, type) {
        let cursor = null;
        let pageCount = 0;
        const maxPages = 10; // Limit network crawling depth
        
        do {
            try {
                let response;
                if (type === 'followers') {
                    response = await this.apiClient.getFollowers(userDid, {
                        limit: this.options.batchSize,
                        cursor: cursor
                    });
                } else {
                    response = await this.apiClient.getFollows(userDid, {
                        limit: this.options.batchSize,
                        cursor: cursor
                    });
                }
                
                if (response.followers || response.follows) {
                    const users = response.followers || response.follows;
                    const subjects = users.map(item => item.subject).filter(Boolean);
                    
                    if (subjects.length > 0) {
                        await this.processUsers(subjects, {
                            source: 'network',
                            networkType: type,
                            seedUser: userDid
                        });
                    }
                }
                
                cursor = response.cursor;
                pageCount++;
                
            } catch (error) {
                logger.error(`Error crawling ${type} for ${userDid}:`, error);
                break;
            }
            
        } while (cursor && pageCount < maxPages && !this.shouldStop);
    }

    /**
     * Process a batch of users
     * @param {Array} users - Array of user objects
     * @param {Object} metadata - Metadata about the source
     */
    async processUsers(users, metadata = {}) {
        if (!Array.isArray(users) || users.length === 0) {
            return;
        }

        this.stats.usersDiscovered += users.length;
        
        // Validate users
        const validation = this.validator.validateBatch(users, 'user');
        const validUsers = validation.validItems;
        
        if (validation.errors.length > 0) {
            logger.warn(`Validation errors: ${validation.errors.length}/${users.length}`);
            this.stats.errors += validation.errors.length;
        }

        // Check for duplicates
        const newUsers = [];
        for (const user of validUsers) {
            try {
                const isDuplicate = await this.deduplicator.isUserDuplicate(user.did);
                if (!isDuplicate) {
                    newUsers.push(user);
                    await this.deduplicator.markUserProcessed(user.did, {
                        handle: user.handle,
                        source: metadata.source,
                        discoveredAt: new Date().toISOString()
                    });
                } else {
                    this.stats.duplicatesSkipped++;
                }
            } catch (error) {
                logger.error(`Error checking duplicate for ${user.handle}:`, error);
                this.stats.errors++;
            }
        }

        if (newUsers.length > 0) {
            // Add metadata to users
            const enrichedUsers = newUsers.map(user => ({
                ...user,
                _metadata: {
                    ...metadata,
                    scrapedAt: new Date().toISOString(),
                    scraper: 'users_scraper',
                    version: '1.0.0'
                }
            }));

            this.currentBatch.push(...enrichedUsers);
            this.stats.usersProcessed += newUsers.length;
            
            logger.info(`Processed ${newUsers.length} new users (${this.stats.duplicatesSkipped} duplicates skipped)`);
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
            const filePath = await this.fileManager.saveUsers(this.currentBatch, {
                scraper: 'users_scraper',
                batchSize: this.currentBatch.length,
                totalProcessed: this.stats.usersProcessed,
                stats: this.getStats()
            });

            this.stats.usersSaved += this.currentBatch.length;
            this.stats.lastSaveTime = new Date();
            
            logger.info(`Saved batch of ${this.currentBatch.length} users to ${filePath}`);
            
            // Clear batch
            this.currentBatch = [];
            
        } catch (error) {
            logger.error('Error saving users batch:', error);
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * Save checkpoint for resuming
     * @param {number} currentStrategy - Current strategy index
     * @param {number} searchTermIndex - Current search term index
     */
    async saveCheckpoint(currentStrategy, searchTermIndex) {
        try {
            await this.checkpointManager.saveCheckpoint('users_scraper', {
                currentStrategy,
                searchTermIndex,
                stats: this.stats,
                options: this.options
            }, {
                scraper: 'users_scraper',
                timestamp: new Date().toISOString()
            });
            
            logger.debug('Checkpoint saved');
            
        } catch (error) {
            logger.error('Error saving checkpoint:', error);
        }
    }

    /**
     * Get seed users for network crawling
     * @returns {Array} Array of seed users
     */
    getSeedUsers() {
        // This would ideally load from previously saved users
        // For now, return some well-known Bluesky accounts
        return [
            { did: 'did:plc:z72i7hdynmk6r22z27h6tvur', handle: 'bsky.app' },
            { did: 'did:plc:ewvi7nxzyoun6zhxrhs64oiz', handle: 'atproto.com' },
            // Add more seed users as needed
        ];
    }

    /**
     * Get default search terms for user discovery
     * @returns {Array} Array of search terms
     */
    getDefaultSearchTerms() {
        return [
            // Technology
            'developer', 'programmer', 'engineer', 'tech', 'software', 'coding',
            'javascript', 'python', 'react', 'nodejs', 'ai', 'ml', 'data',
            
            // Social/Community
            'artist', 'writer', 'journalist', 'blogger', 'creator', 'influencer',
            'photographer', 'designer', 'musician', 'podcaster',
            
            // Topics
            'crypto', 'blockchain', 'nft', 'web3', 'startup', 'entrepreneur',
            'science', 'research', 'academic', 'professor', 'student',
            
            // Interests
            'gaming', 'sports', 'fitness', 'travel', 'food', 'books',
            'movies', 'tv', 'anime', 'manga', 'comics',
            
            // Professional
            'ceo', 'founder', 'manager', 'consultant', 'freelancer',
            'marketing', 'sales', 'hr', 'finance', 'legal',
            
            // Geographic (major cities)
            'nyc', 'sf', 'la', 'chicago', 'boston', 'seattle', 'austin',
            'london', 'paris', 'berlin', 'tokyo', 'sydney'
        ];
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
            usersPerHour: runtimeHours > 0 ? Math.round(this.stats.usersProcessed / runtimeHours) : 0,
            currentBatchSize: this.currentBatch.length,
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
            logger.info('Users scraper cleanup completed');
        } catch (error) {
            logger.error('Error during cleanup:', error);
        }
    }
}

export default UsersScraper; 