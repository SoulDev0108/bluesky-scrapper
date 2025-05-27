import ApiClient from '../core/api_client.js'
import DataValidator from '../utils/data_validator.js'
import FileManager from '../utils/file_manager.js'
import logger from '../core/logger.js'

/**
 * User Info Scraper for extracting detailed information about individual users
 * Supports scraping by Bluesky URL, handle, or DID
 */
class UserInfoScraper {
    constructor(options = {}) {
        this.apiClient = new ApiClient();
        this.validator = new DataValidator();
        this.fileManager = new FileManager();
        
        this.options = {
            includeFollowers: options.includeFollowers || false,
            includeFollowing: options.includeFollowing || false,
            includePosts: options.includePosts || false,
            maxFollowers: options.maxFollowers || 100,
            maxFollowing: options.maxFollowing || 100,
            maxPosts: options.maxPosts || 50,
            saveToFile: options.saveToFile || true,
            ...options
        };
        
        this.stats = {
            usersScraped: 0,
            errors: 0,
            startTime: null
        };
    }

    /**
     * Initialize the scraper
     */
    async initialize() {
        try {
            await this.apiClient.initialize();
            if (this.options.saveToFile) {
                await this.fileManager.initialize();
            }
            
            logger.info('User info scraper initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize user info scraper:', error);
            throw error;
        }
    }

    /**
     * Scrape user information by URL
     * @param {string} url - Bluesky profile URL
     * @returns {Object} User information
     */
    async scrapeByUrl(url) {
        try {
            const handle = this.extractHandleFromUrl(url);
            if (!handle) {
                throw new Error(`Invalid Bluesky URL: ${url}`);
            }
            
            return await this.scrapeByHandle(handle);
            
        } catch (error) {
            logger.error(`Error scraping user by URL ${url}:`, error);
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * Scrape user information by handle
     * @param {string} handle - User handle (e.g., 'user.bsky.social')
     * @returns {Object} User information
     */
    async scrapeByHandle(handle) {
        try {
            this.stats.startTime = this.stats.startTime || new Date();
            
            logger.info(`Scraping user info for handle: ${handle}`);
            
            // Get user profile
            const profile = await this.apiClient.getProfile(handle);
            
            if (!profile) {
                throw new Error(`User not found: ${handle}`);
            }
            
            // Validate user data
            const validatedUser = this.validator.validateUser(profile);
            
            // Enrich with additional data if requested
            const enrichedUser = await this.enrichUserData(validatedUser);
            
            // Add metadata
            enrichedUser._metadata = {
                scrapedAt: new Date().toISOString(),
                scraper: 'user_info_scraper',
                version: '1.0.0',
                source: 'handle',
                originalHandle: handle
            };
            
            this.stats.usersScraped++;
            
            // Save to file if enabled
            if (this.options.saveToFile) {
                await this.saveUserData(enrichedUser);
            }
            
            logger.info(`Successfully scraped user: ${enrichedUser.handle}`);
            
            return enrichedUser;
            
        } catch (error) {
            logger.error(`Error scraping user by handle ${handle}:`, error);
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * Scrape user information by DID
     * @param {string} did - User DID
     * @returns {Object} User information
     */
    async scrapeByDid(did) {
        try {
            this.stats.startTime = this.stats.startTime || new Date();
            
            logger.info(`Scraping user info for DID: ${did}`);
            
            // Get user profile by DID
            const profile = await this.apiClient.getProfile(did);
            
            if (!profile) {
                throw new Error(`User not found: ${did}`);
            }
            
            // Validate user data
            const validatedUser = this.validator.validateUser(profile);
            
            // Enrich with additional data if requested
            const enrichedUser = await this.enrichUserData(validatedUser);
            
            // Add metadata
            enrichedUser._metadata = {
                scrapedAt: new Date().toISOString(),
                scraper: 'user_info_scraper',
                version: '1.0.0',
                source: 'did',
                originalDid: did
            };
            
            this.stats.usersScraped++;
            
            // Save to file if enabled
            if (this.options.saveToFile) {
                await this.saveUserData(enrichedUser);
            }
            
            logger.info(`Successfully scraped user: ${enrichedUser.handle}`);
            
            return enrichedUser;
            
        } catch (error) {
            logger.error(`Error scraping user by DID ${did}:`, error);
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * Scrape multiple users by URLs
     * @param {Array} urls - Array of Bluesky profile URLs
     * @returns {Array} Array of user information objects
     */
    async scrapeMultipleByUrls(urls) {
        if (!Array.isArray(urls)) {
            throw new Error('URLs must be an array');
        }

        logger.info(`Scraping ${urls.length} users by URLs`);
        
        const results = [];
        const errors = [];
        
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            
            try {
                const userInfo = await this.scrapeByUrl(url);
                results.push(userInfo);
                
                logger.info(`Progress: ${i + 1}/${urls.length} users scraped`);
                
                // Add delay to avoid rate limiting
                if (i < urls.length - 1) {
                    await this.delay(1000);
                }
                
            } catch (error) {
                errors.push({
                    url: url,
                    error: error.message
                });
                logger.error(`Failed to scrape ${url}:`, error.message);
            }
        }
        
        // Save batch if enabled
        if (this.options.saveToFile && results.length > 0) {
            await this.saveBatchUserData(results);
        }
        
        logger.info(`Completed scraping ${results.length} users (${errors.length} errors)`);
        
        return {
            users: results,
            errors: errors,
            stats: {
                total: urls.length,
                successful: results.length,
                failed: errors.length
            }
        };
    }

    /**
     * Scrape multiple users by handles
     * @param {Array} handles - Array of user handles
     * @returns {Array} Array of user information objects
     */
    async scrapeMultipleByHandles(handles) {
        if (!Array.isArray(handles)) {
            throw new Error('Handles must be an array');
        }

        logger.info(`Scraping ${handles.length} users by handles`);
        
        const results = [];
        const errors = [];
        
        for (let i = 0; i < handles.length; i++) {
            const handle = handles[i];
            
            try {
                const userInfo = await this.scrapeByHandle(handle);
                results.push(userInfo);
                
                logger.info(`Progress: ${i + 1}/${handles.length} users scraped`);
                
                // Add delay to avoid rate limiting
                if (i < handles.length - 1) {
                    await this.delay(1000);
                }
                
            } catch (error) {
                errors.push({
                    handle: handle,
                    error: error.message
                });
                logger.error(`Failed to scrape ${handle}:`, error.message);
            }
        }
        
        // Save batch if enabled
        if (this.options.saveToFile && results.length > 0) {
            await this.saveBatchUserData(results);
        }
        
        logger.info(`Completed scraping ${results.length} users (${errors.length} errors)`);
        
        return {
            users: results,
            errors: errors,
            stats: {
                total: handles.length,
                successful: results.length,
                failed: errors.length
            }
        };
    }

    /**
     * Enrich user data with additional information
     * @param {Object} user - Base user object
     * @returns {Object} Enriched user object
     */
    async enrichUserData(user) {
        const enrichedUser = { ...user };
        
        try {
            // Add followers if requested
            if (this.options.includeFollowers) {
                enrichedUser.followers = await this.getUserFollowers(user.did);
            }
            
            // Add following if requested
            if (this.options.includeFollowing) {
                enrichedUser.following = await this.getUserFollowing(user.did);
            }
            
            // Add recent posts if requested
            if (this.options.includePosts) {
                enrichedUser.recentPosts = await this.getUserPosts(user.did);
            }
            
            // Add computed metrics
            enrichedUser.metrics = this.computeUserMetrics(enrichedUser);
            
        } catch (error) {
            logger.warn(`Error enriching user data for ${user.handle}:`, error.message);
        }
        
        return enrichedUser;
    }

    /**
     * Get user followers
     * @param {string} did - User DID
     * @returns {Array} Array of follower objects
     */
    async getUserFollowers(did) {
        try {
            const response = await this.apiClient.getFollowers(did, {
                limit: this.options.maxFollowers
            });
            
            return response.followers || [];
            
        } catch (error) {
            logger.warn(`Error getting followers for ${did}:`, error.message);
            return [];
        }
    }

    /**
     * Get user following
     * @param {string} did - User DID
     * @returns {Array} Array of following objects
     */
    async getUserFollowing(did) {
        try {
            const response = await this.apiClient.getFollows(did, {
                limit: this.options.maxFollowing
            });
            
            return response.follows || [];
            
        } catch (error) {
            logger.warn(`Error getting following for ${did}:`, error.message);
            return [];
        }
    }

    /**
     * Get user posts
     * @param {string} did - User DID
     * @returns {Array} Array of post objects
     */
    async getUserPosts(did) {
        try {
            const response = await this.apiClient.getAuthorFeed(did, {
                limit: this.options.maxPosts,
                filter: 'posts_no_replies'
            });
            
            if (response.feed) {
                return response.feed.map(item => item.post).filter(Boolean);
            }
            
            return [];
            
        } catch (error) {
            logger.warn(`Error getting posts for ${did}:`, error.message);
            return [];
        }
    }

    /**
     * Compute user metrics
     * @param {Object} user - User object
     * @returns {Object} Computed metrics
     */
    computeUserMetrics(user) {
        const metrics = {
            engagementRate: 0,
            averagePostLength: 0,
            postFrequency: 0,
            followerToFollowingRatio: 0
        };
        
        try {
            // Follower to following ratio
            if (user.followsCount > 0) {
                metrics.followerToFollowingRatio = (user.followersCount / user.followsCount).toFixed(2);
            }
            
            // Post-based metrics
            if (user.recentPosts && user.recentPosts.length > 0) {
                const posts = user.recentPosts;
                
                // Average post length
                const totalLength = posts.reduce((sum, post) => {
                    return sum + (post.record?.text?.length || 0);
                }, 0);
                metrics.averagePostLength = Math.round(totalLength / posts.length);
                
                // Engagement rate (likes + reposts + replies per post)
                const totalEngagement = posts.reduce((sum, post) => {
                    return sum + (post.likeCount || 0) + (post.repostCount || 0) + (post.replyCount || 0);
                }, 0);
                metrics.engagementRate = (totalEngagement / posts.length).toFixed(2);
                
                // Post frequency (posts per day based on recent posts)
                if (posts.length > 1) {
                    const firstPost = new Date(posts[posts.length - 1].record?.createdAt);
                    const lastPost = new Date(posts[0].record?.createdAt);
                    const daysDiff = (lastPost - firstPost) / (1000 * 60 * 60 * 24);
                    
                    if (daysDiff > 0) {
                        metrics.postFrequency = (posts.length / daysDiff).toFixed(2);
                    }
                }
            }
            
        } catch (error) {
            logger.warn('Error computing user metrics:', error.message);
        }
        
        return metrics;
    }

    /**
     * Extract handle from Bluesky URL
     * @param {string} url - Bluesky profile URL
     * @returns {string|null} Extracted handle or null
     */
    extractHandleFromUrl(url) {
        try {
            // Handle different URL formats:
            // https://bsky.app/profile/user.bsky.social
            // https://bsky.app/profile/did:plc:...
            // bsky.app/profile/user.bsky.social
            
            const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
            
            if (urlObj.hostname !== 'bsky.app') {
                return null;
            }
            
            const pathParts = urlObj.pathname.split('/');
            if (pathParts[1] === 'profile' && pathParts[2]) {
                return pathParts[2];
            }
            
            return null;
            
        } catch (error) {
            logger.warn(`Invalid URL format: ${url}`);
            return null;
        }
    }

    /**
     * Save individual user data to file
     * @param {Object} userData - User data to save
     */
    async saveUserData(userData) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `user_${userData.handle}_${timestamp}.json`;
            
            await this.fileManager.saveUsers([userData], {
                scraper: 'user_info_scraper',
                type: 'individual_user',
                handle: userData.handle,
                scrapedAt: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Error saving user data:', error);
        }
    }

    /**
     * Save batch user data to file
     * @param {Array} usersData - Array of user data to save
     */
    async saveBatchUserData(usersData) {
        try {
            await this.fileManager.saveUsers(usersData, {
                scraper: 'user_info_scraper',
                type: 'batch_users',
                count: usersData.length,
                scrapedAt: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Error saving batch user data:', error);
        }
    }

    /**
     * Validate Bluesky URL format
     * @param {string} url - URL to validate
     * @returns {boolean} True if valid Bluesky URL
     */
    isValidBlueskyUrl(url) {
        try {
            const handle = this.extractHandleFromUrl(url);
            return handle !== null;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get user information summary
     * @param {Object} user - User object
     * @returns {Object} User summary
     */
    getUserSummary(user) {
        return {
            handle: user.handle,
            displayName: user.displayName,
            description: user.description,
            followersCount: user.followersCount,
            followsCount: user.followsCount,
            postsCount: user.postsCount,
            createdAt: user.createdAt,
            metrics: user.metrics,
            scrapedAt: user._metadata?.scrapedAt
        };
    }

    /**
     * Get scraper statistics
     * @returns {Object} Current statistics
     */
    getStats() {
        const now = new Date();
        const runtime = this.stats.startTime ? now - this.stats.startTime : 0;
        
        return {
            ...this.stats,
            runtime: runtime,
            runtimeFormatted: this.formatDuration(runtime),
            averageTimePerUser: this.stats.usersScraped > 0 
                ? Math.round(runtime / this.stats.usersScraped)
                : 0
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
     * Add delay between requests
     * @param {number} ms - Delay in milliseconds
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default UserInfoScraper; 