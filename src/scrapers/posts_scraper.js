import ApiClient from '../core/api_client.js'
import DataValidator from '../utils/data_validator.js'
import Deduplicator from '../utils/deduplicator.js'
import FileManager from '../utils/file_manager.js'
import CheckpointManager from '../core/checkpoint_manager.js'
import logger from '../core/logger.js'
import settings from '../config/settings.js'

/**
 * Posts Scraper for extracting posts from discovered users
 * Scrapes user feeds, timelines, and trending posts
 */
class PostsScraper {
    constructor(options = {}) {
        this.apiClient = new ApiClient();
        this.validator = new DataValidator();
        this.deduplicator = new Deduplicator();
        this.fileManager = new FileManager();
        this.checkpointManager = new CheckpointManager('posts_scraper');
        
        this.options = {
            batchSize: options.batchSize || 50,
            maxPosts: options.maxPosts || 1000000,
            maxPostsPerUser: options.maxPostsPerUser || 100,
            saveInterval: options.saveInterval || 500,
            checkpointInterval: options.checkpointInterval || 2500,
            includeReplies: options.includeReplies || false,
            includeReposts: options.includeReposts || true,
            minPostLength: options.minPostLength || 1,
            maxPostAge: options.maxPostAge || 30, // days
            ...options
        };
        
        this.stats = {
            usersProcessed: 0,
            postsDiscovered: 0,
            postsProcessed: 0,
            postsSaved: 0,
            duplicatesSkipped: 0,
            errors: 0,
            startTime: null,
            lastSaveTime: null
        };
        
        this.isRunning = false;
        this.shouldStop = false;
        this.currentBatch = [];
        this.userQueue = [];
        this.processedUsers = new Set();
    }

    /**
     * Initialize the scraper
     */
    async initialize() {
        try {
            await this.apiClient.initialize();
            await this.deduplicator.initialize();
            await this.fileManager.initialize();
            
            logger.info('Posts scraper initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize posts scraper:', error);
            throw error;
        }
    }

    /**
     * Start scraping posts
     * @param {Object} resumeOptions - Options for resuming from checkpoint
     */
    async start(resumeOptions = {}) {
        if (this.isRunning) {
            throw new Error('Scraper is already running');
        }

        this.isRunning = true;
        this.shouldStop = false;
        this.stats.startTime = new Date();
        
        logger.info('Starting posts scraper', {
            maxPosts: this.options.maxPosts,
            batchSize: this.options.batchSize,
            maxPostsPerUser: this.options.maxPostsPerUser
        });

        try {
            // Try to resume from checkpoint
            let checkpoint = null;
            if (resumeOptions.resume) {
                checkpoint = await this.checkpointManager.loadCheckpoint('posts_scraper');
                if (checkpoint) {
                    logger.info('Resuming from checkpoint', checkpoint.metadata);
                    this.stats = { ...this.stats, ...checkpoint.data.stats };
                    this.processedUsers = new Set(checkpoint.data.processedUsers || []);
                }
            }

            // Load user queue
            await this.loadUserQueue(checkpoint);
            
            // Start scraping process
            await this.scrapePosts(checkpoint);
            
            // Final save
            await this.saveBatch(true);
            
            logger.info('Posts scraping completed', this.getStats());
            
        } catch (error) {
            logger.error('Posts scraping failed:', error);
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
        
        logger.info('Stopping posts scraper...');
        this.shouldStop = true;
        
        // Wait for current operation to complete
        while (this.isRunning) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        logger.info('Posts scraper stopped');
    }

    /**
     * Load user queue from saved user files
     * @param {Object} checkpoint - Checkpoint data
     */
    async loadUserQueue(checkpoint = null) {
        try {
            // Load users from file manager
            const userFiles = await this.fileManager.listFiles('users');
            
            if (userFiles.length === 0) {
                throw new Error('No user files found. Run users scraper first.');
            }

            logger.info(`Loading users from ${userFiles.length} files`);
            
            for (const file of userFiles) {
                if (this.shouldStop) break;
                
                try {
                    const fileData = await this.fileManager.loadData(file);
                    const users = fileData.data || [];
                    
                    for (const user of users) {
                        if (user.did && !this.processedUsers.has(user.did)) {
                            this.userQueue.push({
                                did: user.did,
                                handle: user.handle,
                                displayName: user.displayName,
                                followersCount: user.followersCount || 0,
                                postsCount: user.postsCount || 0
                            });
                        }
                    }
                } catch (error) {
                    logger.error(`Error loading user file ${file}:`, error);
                }
            }
            
            // Sort users by follower count (prioritize popular users)
            this.userQueue.sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0));
            
            logger.info(`Loaded ${this.userQueue.length} users for post scraping`);
            
        } catch (error) {
            logger.error('Error loading user queue:', error);
            throw error;
        }
    }

    /**
     * Main scraping logic
     * @param {Object} checkpoint - Checkpoint data for resuming
     */
    async scrapePosts(checkpoint = null) {
        let startIndex = 0;
        
        if (checkpoint && checkpoint.data.currentUserIndex) {
            startIndex = checkpoint.data.currentUserIndex;
        }

        for (let i = startIndex; i < this.userQueue.length && !this.shouldStop; i++) {
            const user = this.userQueue[i];
            
            try {
                await this.scrapeUserPosts(user);
                this.processedUsers.add(user.did);
                this.stats.usersProcessed++;
                
                // Save checkpoint periodically
                if (this.stats.usersProcessed % 100 === 0) {
                    await this.saveCheckpoint(i);
                }
                
            } catch (error) {
                logger.error(`Error scraping posts for ${user.handle}:`, error);
                this.stats.errors++;
            }
            
            if (this.stats.postsProcessed >= this.options.maxPosts) {
                logger.info('Reached maximum posts limit');
                break;
            }
        }
    }

    /**
     * Scrape posts for a specific user
     * @param {Object} user - User object with DID and handle
     */
    async scrapeUserPosts(user) {
        logger.debug(`Scraping posts for ${user.handle} (${user.did})`);
        
        let cursor = null;
        let postsScraped = 0;
        const maxPostsForUser = Math.min(
            this.options.maxPostsPerUser,
            user.postsCount || this.options.maxPostsPerUser
        );
        
        do {
            try {
                const response = await this.apiClient.getAuthorFeed(user.did, {
                    limit: this.options.batchSize,
                    cursor: cursor,
                    filter: this.options.includeReplies ? 'posts_and_author_threads' : 'posts_no_replies'
                });
                
                if (response.feed && response.feed.length > 0) {
                    const posts = response.feed.map(item => item.post).filter(Boolean);
                    
                    if (posts.length > 0) {
                        await this.processPosts(posts, {
                            source: 'user_feed',
                            authorDid: user.did,
                            authorHandle: user.handle
                        });
                        
                        postsScraped += posts.length;
                    }
                }
                
                cursor = response.cursor;
                
                // Check limits
                if (postsScraped >= maxPostsForUser) {
                    logger.debug(`Reached max posts limit for ${user.handle}: ${postsScraped}`);
                    break;
                }
                
                if (this.stats.postsProcessed >= this.options.maxPosts) {
                    break;
                }
                
            } catch (error) {
                logger.error(`Error getting feed for ${user.handle}:`, error);
                this.stats.errors++;
                break;
            }
            
        } while (cursor && !this.shouldStop);
        
        if (postsScraped > 0) {
            logger.debug(`Scraped ${postsScraped} posts from ${user.handle}`);
        }
    }

    /**
     * Process a batch of posts
     * @param {Array} posts - Array of post objects
     * @param {Object} metadata - Metadata about the source
     */
    async processPosts(posts, metadata = {}) {
        if (!Array.isArray(posts) || posts.length === 0) {
            return;
        }

        this.stats.postsDiscovered += posts.length;
        
        // Filter posts by age if specified
        const filteredPosts = this.filterPostsByAge(posts);
        
        // Validate posts
        const validation = this.validator.validateBatch(filteredPosts, 'post');
        const validPosts = validation.validItems;
        
        if (validation.errors.length > 0) {
            logger.warn(`Post validation errors: ${validation.errors.length}/${posts.length}`);
            this.stats.errors += validation.errors.length;
        }

        // Check for duplicates and filter
        const newPosts = [];
        for (const post of validPosts) {
            try {
                // Skip posts that are too short
                const text = post.record?.text || '';
                if (text.length < this.options.minPostLength) {
                    continue;
                }
                
                // Skip reposts if not wanted
                if (!this.options.includeReposts && post.record?.repost) {
                    continue;
                }
                
                const isDuplicate = await this.deduplicator.isPostDuplicate(post.uri);
                if (!isDuplicate) {
                    newPosts.push(post);
                    await this.deduplicator.markPostProcessed(post.uri, {
                        authorDid: post.author?.did,
                        authorHandle: post.author?.handle,
                        source: metadata.source,
                        scrapedAt: new Date().toISOString()
                    });
                } else {
                    this.stats.duplicatesSkipped++;
                }
            } catch (error) {
                logger.error(`Error checking duplicate for post ${post.uri}:`, error);
                this.stats.errors++;
            }
        }

        if (newPosts.length > 0) {
            // Add metadata to posts
            const enrichedPosts = newPosts.map(post => ({
                ...post,
                _metadata: {
                    ...metadata,
                    scrapedAt: new Date().toISOString(),
                    scraper: 'posts_scraper',
                    version: '1.0.0'
                }
            }));

            this.currentBatch.push(...enrichedPosts);
            this.stats.postsProcessed += newPosts.length;
            
            logger.debug(`Processed ${newPosts.length} new posts (${this.stats.duplicatesSkipped} duplicates skipped)`);
        }

        // Save batch if needed
        if (this.currentBatch.length >= this.options.saveInterval) {
            await this.saveBatch();
        }
    }

    /**
     * Filter posts by age
     * @param {Array} posts - Array of posts
     * @returns {Array} Filtered posts
     */
    filterPostsByAge(posts) {
        if (!this.options.maxPostAge) {
            return posts;
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.options.maxPostAge);

        return posts.filter(post => {
            try {
                const createdAt = new Date(post.record?.createdAt || post.indexedAt);
                return createdAt >= cutoffDate;
            } catch (error) {
                return true; // Include posts with invalid dates
            }
        });
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
            const filePath = await this.fileManager.savePosts(this.currentBatch, {
                scraper: 'posts_scraper',
                batchSize: this.currentBatch.length,
                totalProcessed: this.stats.postsProcessed,
                stats: this.getStats()
            });

            this.stats.postsSaved += this.currentBatch.length;
            this.stats.lastSaveTime = new Date();
            
            logger.info(`Saved batch of ${this.currentBatch.length} posts to ${filePath}`);
            
            // Clear batch
            this.currentBatch = [];
            
        } catch (error) {
            logger.error('Error saving posts batch:', error);
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * Save checkpoint for resuming
     * @param {number} currentUserIndex - Current user index in queue
     */
    async saveCheckpoint(currentUserIndex) {
        try {
            await this.checkpointManager.saveCheckpoint('posts_scraper', {
                currentUserIndex,
                processedUsers: Array.from(this.processedUsers),
                stats: this.stats,
                options: this.options
            }, {
                scraper: 'posts_scraper',
                timestamp: new Date().toISOString()
            });
            
            logger.debug('Checkpoint saved');
            
        } catch (error) {
            logger.error('Error saving checkpoint:', error);
        }
    }

    /**
     * Scrape trending/popular posts
     */
    async scrapeTrendingPosts() {
        logger.info('Scraping trending posts');
        
        try {
            // Get timeline (popular posts)
            const response = await this.apiClient.getTimeline({
                limit: this.options.batchSize * 2
            });
            
            if (response.feed && response.feed.length > 0) {
                const posts = response.feed.map(item => item.post).filter(Boolean);
                
                await this.processPosts(posts, {
                    source: 'trending',
                    type: 'timeline'
                });
            }
            
        } catch (error) {
            logger.error('Error scraping trending posts:', error);
            this.stats.errors++;
        }
    }

    /**
     * Scrape posts by hashtags or keywords
     * @param {Array} keywords - Keywords to search for
     */
    async scrapePostsByKeywords(keywords = []) {
        if (!Array.isArray(keywords) || keywords.length === 0) {
            return;
        }

        logger.info(`Scraping posts by keywords: ${keywords.join(', ')}`);
        
        for (const keyword of keywords) {
            if (this.shouldStop) break;
            
            try {
                const response = await this.apiClient.searchPosts(keyword, {
                    limit: this.options.batchSize
                });
                
                if (response.posts && response.posts.length > 0) {
                    await this.processPosts(response.posts, {
                        source: 'keyword_search',
                        keyword: keyword
                    });
                }
                
            } catch (error) {
                logger.error(`Error searching posts for keyword "${keyword}":`, error);
                this.stats.errors++;
            }
            
            if (this.stats.postsProcessed >= this.options.maxPosts) {
                break;
            }
        }
    }

    /**
     * Get post engagement metrics
     * @param {Object} post - Post object
     * @returns {Object} Engagement metrics
     */
    getPostEngagement(post) {
        return {
            likes: post.likeCount || 0,
            reposts: post.repostCount || 0,
            replies: post.replyCount || 0,
            total: (post.likeCount || 0) + (post.repostCount || 0) + (post.replyCount || 0)
        };
    }

    /**
     * Analyze post content
     * @param {Object} post - Post object
     * @returns {Object} Content analysis
     */
    analyzePostContent(post) {
        const text = post.record?.text || '';
        const words = text.split(/\s+/).filter(word => word.length > 0);
        
        return {
            wordCount: words.length,
            characterCount: text.length,
            hasLinks: /https?:\/\//.test(text),
            hasHashtags: /#\w+/.test(text),
            hasMentions: /@\w+/.test(text),
            hasEmojis: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(text),
            language: post.record?.langs?.[0] || 'unknown'
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
            postsPerHour: runtimeHours > 0 ? Math.round(this.stats.postsProcessed / runtimeHours) : 0,
            usersPerHour: runtimeHours > 0 ? Math.round(this.stats.usersProcessed / runtimeHours) : 0,
            currentBatchSize: this.currentBatch.length,
            queueSize: this.userQueue.length,
            processedUsersCount: this.processedUsers.size,
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
            logger.info('Posts scraper cleanup completed');
        } catch (error) {
            logger.error('Error during cleanup:', error);
        }
    }
}

export default PostsScraper; 