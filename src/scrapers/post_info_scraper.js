import ApiClient from '../core/api_client.js'
import DataValidator from '../utils/data_validator.js'
import FileManager from '../utils/file_manager.js'
import logger from '../core/logger.js'

/**
 * Post Info Scraper for extracting detailed information about individual posts
 * Supports scraping by Bluesky post URL or AT URI
 */
class PostInfoScraper {
    constructor(options = {}) {
        this.apiClient = new ApiClient();
        this.validator = new DataValidator();
        this.fileManager = new FileManager();
        
        this.options = {
            includeThread: options.includeThread || false,
            includeReplies: options.includeReplies || false,
            includeLikes: options.includeLikes || false,
            includeReposts: options.includeReposts || false,
            maxReplies: options.maxReplies || 50,
            maxLikes: options.maxLikes || 100,
            maxReposts: options.maxReposts || 100,
            saveToFile: options.saveToFile || true,
            ...options
        };
        
        this.stats = {
            postsScraped: 0,
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
            
            logger.info('Post info scraper initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize post info scraper:', error);
            throw error;
        }
    }

    /**
     * Scrape post information by URL
     * @param {string} url - Bluesky post URL
     * @returns {Object} Post information
     */
    async scrapeByUrl(url) {
        try {
            const atUri = this.extractAtUriFromUrl(url);
            if (!atUri) {
                throw new Error(`Invalid Bluesky post URL: ${url}`);
            }
            
            return await this.scrapeByAtUri(atUri);
            
        } catch (error) {
            logger.error(`Error scraping post by URL ${url}:`, error);
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * Scrape post information by AT URI
     * @param {string} atUri - AT URI of the post
     * @returns {Object} Post information
     */
    async scrapeByAtUri(atUri) {
        try {
            this.stats.startTime = this.stats.startTime || new Date();
            
            logger.info(`Scraping post info for AT URI: ${atUri}`);
            
            // Get post thread (includes the post and context)
            const threadResponse = await this.apiClient.getPostThread(atUri);
            
            if (!threadResponse || !threadResponse.thread) {
                throw new Error(`Post not found: ${atUri}`);
            }
            
            const post = threadResponse.thread.post;
            if (!post) {
                throw new Error(`Invalid post data for: ${atUri}`);
            }
            
            // Validate post data
            const validatedPost = this.validator.validatePost(post);
            
            // Enrich with additional data if requested
            const enrichedPost = await this.enrichPostData(validatedPost, threadResponse.thread);
            
            // Add metadata
            enrichedPost._metadata = {
                scrapedAt: new Date().toISOString(),
                scraper: 'post_info_scraper',
                version: '1.0.0',
                source: 'at_uri',
                originalAtUri: atUri
            };
            
            this.stats.postsScraped++;
            
            // Save to file if enabled
            if (this.options.saveToFile) {
                await this.savePostData(enrichedPost);
            }
            
            logger.info(`Successfully scraped post: ${enrichedPost.uri}`);
            
            return enrichedPost;
            
        } catch (error) {
            logger.error(`Error scraping post by AT URI ${atUri}:`, error);
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * Scrape multiple posts by URLs
     * @param {Array} urls - Array of Bluesky post URLs
     * @returns {Object} Results with posts and errors
     */
    async scrapeMultipleByUrls(urls) {
        if (!Array.isArray(urls)) {
            throw new Error('URLs must be an array');
        }

        logger.info(`Scraping ${urls.length} posts by URLs`);
        
        const results = [];
        const errors = [];
        
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            
            try {
                const postInfo = await this.scrapeByUrl(url);
                results.push(postInfo);
                
                logger.info(`Progress: ${i + 1}/${urls.length} posts scraped`);
                
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
            await this.saveBatchPostData(results);
        }
        
        logger.info(`Completed scraping ${results.length} posts (${errors.length} errors)`);
        
        return {
            posts: results,
            errors: errors,
            stats: {
                total: urls.length,
                successful: results.length,
                failed: errors.length
            }
        };
    }

    /**
     * Scrape multiple posts by AT URIs
     * @param {Array} atUris - Array of AT URIs
     * @returns {Object} Results with posts and errors
     */
    async scrapeMultipleByAtUris(atUris) {
        if (!Array.isArray(atUris)) {
            throw new Error('AT URIs must be an array');
        }

        logger.info(`Scraping ${atUris.length} posts by AT URIs`);
        
        const results = [];
        const errors = [];
        
        for (let i = 0; i < atUris.length; i++) {
            const atUri = atUris[i];
            
            try {
                const postInfo = await this.scrapeByAtUri(atUri);
                results.push(postInfo);
                
                logger.info(`Progress: ${i + 1}/${atUris.length} posts scraped`);
                
                // Add delay to avoid rate limiting
                if (i < atUris.length - 1) {
                    await this.delay(1000);
                }
                
            } catch (error) {
                errors.push({
                    atUri: atUri,
                    error: error.message
                });
                logger.error(`Failed to scrape ${atUri}:`, error.message);
            }
        }
        
        // Save batch if enabled
        if (this.options.saveToFile && results.length > 0) {
            await this.saveBatchPostData(results);
        }
        
        logger.info(`Completed scraping ${results.length} posts (${errors.length} errors)`);
        
        return {
            posts: results,
            errors: errors,
            stats: {
                total: atUris.length,
                successful: results.length,
                failed: errors.length
            }
        };
    }

    /**
     * Enrich post data with additional information
     * @param {Object} post - Base post object
     * @param {Object} thread - Thread context
     * @returns {Object} Enriched post object
     */
    async enrichPostData(post, thread) {
        const enrichedPost = { ...post };
        
        try {
            // Add thread context if requested
            if (this.options.includeThread && thread) {
                enrichedPost.thread = this.extractThreadContext(thread);
            }
            
            // Add replies if requested
            if (this.options.includeReplies) {
                enrichedPost.replies = await this.getPostReplies(post.uri);
            }
            
            // Add likes if requested
            if (this.options.includeLikes) {
                enrichedPost.likes = await this.getPostLikes(post.uri);
            }
            
            // Add reposts if requested
            if (this.options.includeReposts) {
                enrichedPost.reposts = await this.getPostReposts(post.uri);
            }
            
            // Add computed metrics
            enrichedPost.metrics = this.computePostMetrics(enrichedPost);
            
            // Add content analysis
            enrichedPost.analysis = this.analyzePostContent(enrichedPost);
            
        } catch (error) {
            logger.warn(`Error enriching post data for ${post.uri}:`, error.message);
        }
        
        return enrichedPost;
    }

    /**
     * Extract thread context from thread response
     * @param {Object} thread - Thread object
     * @returns {Object} Thread context
     */
    extractThreadContext(thread) {
        const context = {
            hasParent: !!thread.parent,
            hasReplies: !!(thread.replies && thread.replies.length > 0),
            replyCount: thread.replies ? thread.replies.length : 0
        };
        
        // Add parent post info if available
        if (thread.parent && thread.parent.post) {
            context.parent = {
                uri: thread.parent.post.uri,
                author: thread.parent.post.author,
                text: thread.parent.post.record?.text,
                createdAt: thread.parent.post.record?.createdAt
            };
        }
        
        // Add immediate replies info
        if (thread.replies && thread.replies.length > 0) {
            context.immediateReplies = thread.replies.map(reply => ({
                uri: reply.post?.uri,
                author: reply.post?.author,
                text: reply.post?.record?.text,
                createdAt: reply.post?.record?.createdAt,
                likeCount: reply.post?.likeCount || 0,
                replyCount: reply.post?.replyCount || 0
            }));
        }
        
        return context;
    }

    /**
     * Get post replies
     * @param {string} postUri - Post AT URI
     * @returns {Array} Array of reply objects
     */
    async getPostReplies(postUri) {
        try {
            // Note: This would require implementing a method to get replies
            // For now, return empty array as AT Protocol doesn't have a direct replies endpoint
            logger.debug(`Getting replies for ${postUri} - not implemented yet`);
            return [];
            
        } catch (error) {
            logger.warn(`Error getting replies for ${postUri}:`, error.message);
            return [];
        }
    }

    /**
     * Get post likes
     * @param {string} postUri - Post AT URI
     * @returns {Array} Array of like objects
     */
    async getPostLikes(postUri) {
        try {
            const response = await this.apiClient.getLikes(postUri, {
                limit: this.options.maxLikes
            });
            
            return response.likes || [];
            
        } catch (error) {
            logger.warn(`Error getting likes for ${postUri}:`, error.message);
            return [];
        }
    }

    /**
     * Get post reposts
     * @param {string} postUri - Post AT URI
     * @returns {Array} Array of repost objects
     */
    async getPostReposts(postUri) {
        try {
            const response = await this.apiClient.getRepostedBy(postUri, {
                limit: this.options.maxReposts
            });
            
            return response.repostedBy || [];
            
        } catch (error) {
            logger.warn(`Error getting reposts for ${postUri}:`, error.message);
            return [];
        }
    }

    /**
     * Compute post metrics
     * @param {Object} post - Post object
     * @returns {Object} Computed metrics
     */
    computePostMetrics(post) {
        const metrics = {
            totalEngagement: 0,
            engagementRate: 0,
            likeToRepostRatio: 0,
            replyToLikeRatio: 0,
            viralityScore: 0
        };
        
        try {
            const likes = post.likeCount || 0;
            const reposts = post.repostCount || 0;
            const replies = post.replyCount || 0;
            const authorFollowers = post.author?.followersCount || 1;
            
            // Total engagement
            metrics.totalEngagement = likes + reposts + replies;
            
            // Engagement rate (engagement / author followers)
            metrics.engagementRate = (metrics.totalEngagement / authorFollowers * 100).toFixed(2);
            
            // Like to repost ratio
            if (reposts > 0) {
                metrics.likeToRepostRatio = (likes / reposts).toFixed(2);
            }
            
            // Reply to like ratio
            if (likes > 0) {
                metrics.replyToLikeRatio = (replies / likes).toFixed(2);
            }
            
            // Virality score (reposts are weighted more heavily)
            metrics.viralityScore = (likes * 1 + reposts * 3 + replies * 2).toFixed(0);
            
        } catch (error) {
            logger.warn('Error computing post metrics:', error.message);
        }
        
        return metrics;
    }

    /**
     * Analyze post content
     * @param {Object} post - Post object
     * @returns {Object} Content analysis
     */
    analyzePostContent(post) {
        const text = post.record?.text || '';
        const analysis = {
            wordCount: 0,
            characterCount: text.length,
            hasLinks: false,
            hasHashtags: false,
            hasMentions: false,
            hasEmojis: false,
            hasMedia: false,
            language: 'unknown',
            sentiment: 'neutral',
            topics: []
        };
        
        try {
            // Word count
            const words = text.split(/\s+/).filter(word => word.length > 0);
            analysis.wordCount = words.length;
            
            // Check for various content types
            analysis.hasLinks = /https?:\/\//.test(text);
            analysis.hasHashtags = /#\w+/.test(text);
            analysis.hasMentions = /@\w+/.test(text);
            analysis.hasEmojis = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(text);
            
            // Check for media
            analysis.hasMedia = !!(post.record?.embed);
            
            // Language detection (basic)
            analysis.language = post.record?.langs?.[0] || 'unknown';
            
            // Extract hashtags
            const hashtags = text.match(/#\w+/g);
            if (hashtags) {
                analysis.topics = hashtags.map(tag => tag.toLowerCase());
            }
            
            // Basic sentiment analysis (very simple)
            const positiveWords = ['good', 'great', 'awesome', 'amazing', 'love', 'happy', 'excellent'];
            const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'sad', 'angry', 'horrible'];
            
            const lowerText = text.toLowerCase();
            const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
            const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
            
            if (positiveCount > negativeCount) {
                analysis.sentiment = 'positive';
            } else if (negativeCount > positiveCount) {
                analysis.sentiment = 'negative';
            }
            
        } catch (error) {
            logger.warn('Error analyzing post content:', error.message);
        }
        
        return analysis;
    }

    /**
     * Extract AT URI from Bluesky post URL
     * @param {string} url - Bluesky post URL
     * @returns {string|null} Extracted AT URI or null
     */
    extractAtUriFromUrl(url) {
        try {
            // Handle different URL formats:
            // https://bsky.app/profile/user.bsky.social/post/3k...
            // https://bsky.app/profile/did:plc:.../post/3k...
            
            const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
            
            if (urlObj.hostname !== 'bsky.app') {
                return null;
            }
            
            const pathParts = urlObj.pathname.split('/');
            if (pathParts[1] === 'profile' && pathParts[3] === 'post' && pathParts[4]) {
                const handle = pathParts[2];
                const postId = pathParts[4];
                
                // Construct AT URI
                return `at://${handle}/app.bsky.feed.post/${postId}`;
            }
            
            return null;
            
        } catch (error) {
            logger.warn(`Invalid URL format: ${url}`);
            return null;
        }
    }

    /**
     * Save individual post data to file
     * @param {Object} postData - Post data to save
     */
    async savePostData(postData) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const postId = postData.uri.split('/').pop();
            const filename = `post_${postId}_${timestamp}.json`;
            
            await this.fileManager.savePosts([postData], {
                scraper: 'post_info_scraper',
                type: 'individual_post',
                postUri: postData.uri,
                scrapedAt: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Error saving post data:', error);
        }
    }

    /**
     * Save batch post data to file
     * @param {Array} postsData - Array of post data to save
     */
    async saveBatchPostData(postsData) {
        try {
            await this.fileManager.savePosts(postsData, {
                scraper: 'post_info_scraper',
                type: 'batch_posts',
                count: postsData.length,
                scrapedAt: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Error saving batch post data:', error);
        }
    }

    /**
     * Validate Bluesky post URL format
     * @param {string} url - URL to validate
     * @returns {boolean} True if valid Bluesky post URL
     */
    isValidBlueskyPostUrl(url) {
        try {
            const atUri = this.extractAtUriFromUrl(url);
            return atUri !== null;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get post information summary
     * @param {Object} post - Post object
     * @returns {Object} Post summary
     */
    getPostSummary(post) {
        return {
            uri: post.uri,
            author: {
                handle: post.author?.handle,
                displayName: post.author?.displayName
            },
            text: post.record?.text,
            createdAt: post.record?.createdAt,
            likeCount: post.likeCount,
            repostCount: post.repostCount,
            replyCount: post.replyCount,
            metrics: post.metrics,
            analysis: post.analysis,
            scrapedAt: post._metadata?.scrapedAt
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
            averageTimePerPost: this.stats.postsScraped > 0 
                ? Math.round(runtime / this.stats.postsScraped)
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

export default PostInfoScraper; 