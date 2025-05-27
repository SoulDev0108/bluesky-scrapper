#!/usr/bin/env node

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

import UsersScraper from '../src/scrapers/users_scraper.js'
import PostsScraper from '../src/scrapers/posts_scraper.js'
import RelationshipsScraper from '../src/scrapers/relationships_scraper.js'
import UserInfoScraper from '../src/scrapers/user_info_scraper.js'
import PostInfoScraper from '../src/scrapers/post_info_scraper.js'
import logger from '../src/core/logger.js'

/**
 * Main Bluesky Scraper Runner
 * Unified command-line interface for all scrapers
 */

const program = new Command();

program
    .name('bluesky-scraper')
    .description('Scalable Bluesky web scraper using AT Protocol')
    .version('1.0.0');

// Users scraper command
program
    .command('users')
    .description('Run the users scraper for bulk user discovery')
    .option('-m, --max-users <number>', 'Maximum number of users to scrape', '500000')
    .option('-b, --batch-size <number>', 'Batch size for API requests', '100')
    .option('-s, --save-interval <number>', 'Save interval (number of users)', '1000')
    .option('-c, --checkpoint-interval <number>', 'Checkpoint interval', '5000')
    .option('-r, --resume', 'Resume from last checkpoint', false)
    .option('-t, --search-terms <terms>', 'Comma-separated search terms', '')
    .option('--dry-run', 'Run in dry-run mode', false)
    .option('--verbose', 'Enable verbose logging', false)
    .action(async (options) => {
        await runUsersScraper(options);
    });

// Posts scraper command
program
    .command('posts')
    .description('Run the posts scraper to extract posts from users')
    .option('-m, --max-posts <number>', 'Maximum number of posts to scrape', '1000000')
    .option('-b, --batch-size <number>', 'Batch size for API requests', '50')
    .option('-u, --max-posts-per-user <number>', 'Max posts per user', '100')
    .option('-s, --save-interval <number>', 'Save interval (number of posts)', '500')
    .option('-c, --checkpoint-interval <number>', 'Checkpoint interval', '2500')
    .option('-r, --resume', 'Resume from last checkpoint', false)
    .option('--include-replies', 'Include reply posts', false)
    .option('--include-reposts', 'Include repost posts', true)
    .option('--min-post-length <number>', 'Minimum post length', '1')
    .option('--max-post-age <number>', 'Maximum post age in days', '30')
    .option('--dry-run', 'Run in dry-run mode', false)
    .option('--verbose', 'Enable verbose logging', false)
    .action(async (options) => {
        await runPostsScraper(options);
    });

// Relationships scraper command
program
    .command('relationships')
    .description('Run the relationships scraper for network mapping')
    .option('-m, --max-relationships <number>', 'Maximum relationships to scrape', '10000000')
    .option('-d, --max-depth <number>', 'Maximum crawling depth', '3')
    .option('-b, --batch-size <number>', 'Batch size for API requests', '100')
    .option('-f, --max-followers-per-user <number>', 'Max followers per user', '1000')
    .option('-g, --max-following-per-user <number>', 'Max following per user', '1000')
    .option('-s, --save-interval <number>', 'Save interval', '1000')
    .option('-c, --checkpoint-interval <number>', 'Checkpoint interval', '5000')
    .option('-r, --resume', 'Resume from last checkpoint', false)
    .option('--min-follower-count <number>', 'Minimum follower count', '10')
    .option('--prioritize-popular', 'Prioritize popular users', true)
    .option('--dry-run', 'Run in dry-run mode', false)
    .option('--verbose', 'Enable verbose logging', false)
    .action(async (options) => {
        await runRelationshipsScraper(options);
    });

// User info scraper command
program
    .command('user-info')
    .description('Scrape detailed info for specific users')
    .argument('[urls...]', 'Bluesky profile URLs or handles')
    .option('-f, --file <path>', 'File containing URLs/handles (one per line)')
    .option('--include-followers', 'Include follower information', false)
    .option('--include-following', 'Include following information', false)
    .option('--include-posts', 'Include recent posts', false)
    .option('--max-followers <number>', 'Max followers to fetch', '100')
    .option('--max-following <number>', 'Max following to fetch', '100')
    .option('--max-posts <number>', 'Max posts to fetch', '50')
    .option('--no-save', 'Don\'t save to file', false)
    .option('--verbose', 'Enable verbose logging', false)
    .action(async (urls, options) => {
        await runUserInfoScraper(urls, options);
    });

// Post info scraper command
program
    .command('post-info')
    .description('Scrape detailed info for specific posts')
    .argument('[urls...]', 'Bluesky post URLs or AT URIs')
    .option('-f, --file <path>', 'File containing URLs/URIs (one per line)')
    .option('--include-thread', 'Include thread context', false)
    .option('--include-replies', 'Include replies', false)
    .option('--include-likes', 'Include likes', false)
    .option('--include-reposts', 'Include reposts', false)
    .option('--max-replies <number>', 'Max replies to fetch', '50')
    .option('--max-likes <number>', 'Max likes to fetch', '100')
    .option('--max-reposts <number>', 'Max reposts to fetch', '100')
    .option('--no-save', 'Don\'t save to file', false)
    .option('--verbose', 'Enable verbose logging', false)
    .action(async (urls, options) => {
        await runPostInfoScraper(urls, options);
    });

// Full pipeline command
program
    .command('full')
    .description('Run the complete scraping pipeline (users -> posts -> relationships)')
    .option('--users-max <number>', 'Max users to scrape', '100000')
    .option('--posts-max <number>', 'Max posts to scrape', '500000')
    .option('--relationships-max <number>', 'Max relationships to scrape', '1000000')
    .option('--max-depth <number>', 'Max relationship depth', '2')
    .option('--skip-users', 'Skip users scraping', false)
    .option('--skip-posts', 'Skip posts scraping', false)
    .option('--skip-relationships', 'Skip relationships scraping', false)
    .option('--verbose', 'Enable verbose logging', false)
    .action(async (options) => {
        await runFullPipeline(options);
    });

// Status command
program
    .command('status')
    .description('Show scraper status and statistics')
    .action(async () => {
        await showStatus();
    });

/**
 * Run users scraper
 */
async function runUsersScraper(options) {
    try {
        configureLogging(options.verbose);
        logger.info('Starting Users Scraper');

        const searchTerms = options.searchTerms ? 
            options.searchTerms.split(',').map(term => term.trim()) : 
            undefined;

        const scraperOptions = {
            maxUsers: parseInt(options.maxUsers),
            batchSize: parseInt(options.batchSize),
            saveInterval: parseInt(options.saveInterval),
            checkpointInterval: parseInt(options.checkpointInterval),
            searchTerms: searchTerms
        };

        if (options.dryRun) {
            logger.info('DRY RUN MODE - Configuration:', scraperOptions);
            return;
        }

        const scraper = new UsersScraper(scraperOptions);
        await setupGracefulShutdown(scraper);
        
        await scraper.initialize();
        await scraper.start({ resume: options.resume });
        
        logFinalStats('Users', scraper.getStats());
        await scraper.cleanup();

    } catch (error) {
        logger.error('Users scraper failed:', error);
        process.exit(1);
    }
}

/**
 * Run posts scraper
 */
async function runPostsScraper(options) {
    try {
        configureLogging(options.verbose);
        logger.info('Starting Posts Scraper');

        const scraperOptions = {
            maxPosts: parseInt(options.maxPosts),
            batchSize: parseInt(options.batchSize),
            maxPostsPerUser: parseInt(options.maxPostsPerUser),
            saveInterval: parseInt(options.saveInterval),
            checkpointInterval: parseInt(options.checkpointInterval),
            includeReplies: options.includeReplies,
            includeReposts: options.includeReposts,
            minPostLength: parseInt(options.minPostLength),
            maxPostAge: parseInt(options.maxPostAge)
        };

        if (options.dryRun) {
            logger.info('DRY RUN MODE - Configuration:', scraperOptions);
            return;
        }

        const scraper = new PostsScraper(scraperOptions);
        await setupGracefulShutdown(scraper);
        
        await scraper.initialize();
        await scraper.start({ resume: options.resume });
        
        logFinalStats('Posts', scraper.getStats());
        await scraper.cleanup();

    } catch (error) {
        logger.error('Posts scraper failed:', error);
        process.exit(1);
    }
}

/**
 * Run relationships scraper
 */
async function runRelationshipsScraper(options) {
    try {
        configureLogging(options.verbose);
        logger.info('Starting Relationships Scraper');

        const scraperOptions = {
            maxRelationships: parseInt(options.maxRelationships),
            maxDepth: parseInt(options.maxDepth),
            batchSize: parseInt(options.batchSize),
            maxFollowersPerUser: parseInt(options.maxFollowersPerUser),
            maxFollowingPerUser: parseInt(options.maxFollowingPerUser),
            saveInterval: parseInt(options.saveInterval),
            checkpointInterval: parseInt(options.checkpointInterval),
            minFollowerCount: parseInt(options.minFollowerCount),
            prioritizePopularUsers: options.prioritizePopular
        };

        if (options.dryRun) {
            logger.info('DRY RUN MODE - Configuration:', scraperOptions);
            return;
        }

        const scraper = new RelationshipsScraper(scraperOptions);
        await setupGracefulShutdown(scraper);
        
        await scraper.initialize();
        await scraper.start({ resume: options.resume });
        
        logFinalStats('Relationships', scraper.getStats());
        await scraper.cleanup();

    } catch (error) {
        logger.error('Relationships scraper failed:', error);
        process.exit(1);
    }
}

/**
 * Run user info scraper
 */
async function runUserInfoScraper(urls, options) {
    try {
        configureLogging(options.verbose);
        logger.info('Starting User Info Scraper');

        // Load URLs from file if specified
        if (options.file) {
            const fs = await import('fs')
            const fileContent = fs.readFileSync(options.file, 'utf8')
            const fileUrls = fileContent.split('\n').map(line => line.trim()).filter(line => line)
            urls = [...urls, ...fileUrls]
        }

        if (urls.length === 0) {
            logger.error('No URLs provided. Use arguments or --file option.');
            process.exit(1);
        }

        const scraperOptions = {
            includeFollowers: options.includeFollowers,
            includeFollowing: options.includeFollowing,
            includePosts: options.includePosts,
            maxFollowers: parseInt(options.maxFollowers),
            maxFollowing: parseInt(options.maxFollowing),
            maxPosts: parseInt(options.maxPosts),
            saveToFile: !options.noSave
        };

        const scraper = new UserInfoScraper(scraperOptions);
        await scraper.initialize();

        let results;
        if (urls.length === 1) {
            results = await scraper.scrapeByUrl(urls[0]);
            logger.info('User Info:', scraper.getUserSummary(results));
        } else {
            results = await scraper.scrapeMultipleByUrls(urls);
            logger.info(`Scraped ${results.users.length} users (${results.errors.length} errors)`);
        }

        logFinalStats('User Info', scraper.getStats());

    } catch (error) {
        logger.error('User info scraper failed:', error);
        process.exit(1);
    }
}

/**
 * Run post info scraper
 */
async function runPostInfoScraper(urls, options) {
    try {
        configureLogging(options.verbose);
        logger.info('Starting Post Info Scraper');

        // Load URLs from file if specified
        if (options.file) {
            const fs = await import('fs')
            const fileContent = fs.readFileSync(options.file, 'utf8')
            const fileUrls = fileContent.split('\n').map(line => line.trim()).filter(line => line)
            urls = [...urls, ...fileUrls]
        }

        if (urls.length === 0) {
            logger.error('No URLs provided. Use arguments or --file option.');
            process.exit(1);
        }

        const scraperOptions = {
            includeThread: options.includeThread,
            includeReplies: options.includeReplies,
            includeLikes: options.includeLikes,
            includeReposts: options.includeReposts,
            maxReplies: parseInt(options.maxReplies),
            maxLikes: parseInt(options.maxLikes),
            maxReposts: parseInt(options.maxReposts),
            saveToFile: !options.noSave
        };

        const scraper = new PostInfoScraper(scraperOptions);
        await scraper.initialize();

        let results;
        if (urls.length === 1) {
            results = await scraper.scrapeByUrl(urls[0]);
            logger.info('Post Info:', scraper.getPostSummary(results));
        } else {
            results = await scraper.scrapeMultipleByUrls(urls);
            logger.info(`Scraped ${results.posts.length} posts (${results.errors.length} errors)`);
        }

        logFinalStats('Post Info', scraper.getStats());

    } catch (error) {
        logger.error('Post info scraper failed:', error);
        process.exit(1);
    }
}

/**
 * Run full pipeline
 */
async function runFullPipeline(options) {
    try {
        configureLogging(options.verbose);
        logger.info('Starting Full Scraping Pipeline');

        // Step 1: Users scraper
        if (!options.skipUsers) {
            logger.info('=== STEP 1: Users Scraping ===');
            const usersScraper = new UsersScraper({
                maxUsers: parseInt(options.usersMax),
                batchSize: 100,
                saveInterval: 1000
            });
            
            await usersScraper.initialize();
            await usersScraper.start({ resume: false });
            await usersScraper.cleanup();
            
            logger.info('Users scraping completed');
        }

        // Step 2: Posts scraper
        if (!options.skipPosts) {
            logger.info('=== STEP 2: Posts Scraping ===');
            const postsScraper = new PostsScraper({
                maxPosts: parseInt(options.postsMax),
                batchSize: 50,
                saveInterval: 500
            });
            
            await postsScraper.initialize();
            await postsScraper.start({ resume: false });
            await postsScraper.cleanup();
            
            logger.info('Posts scraping completed');
        }

        // Step 3: Relationships scraper
        if (!options.skipRelationships) {
            logger.info('=== STEP 3: Relationships Scraping ===');
            const relationshipsScraper = new RelationshipsScraper({
                maxRelationships: parseInt(options.relationshipsMax),
                maxDepth: parseInt(options.maxDepth),
                batchSize: 100,
                saveInterval: 1000
            });
            
            await relationshipsScraper.initialize();
            await relationshipsScraper.start({ resume: false });
            await relationshipsScraper.cleanup();
            
            logger.info('Relationships scraping completed');
        }

        logger.info('=== FULL PIPELINE COMPLETED ===');

    } catch (error) {
        logger.error('Full pipeline failed:', error);
        process.exit(1);
    }
}

/**
 * Show status and statistics
 */
async function showStatus() {
    try {
        const { default: FileManager } = await import('../src/utils/file_manager.js')
        const fileManager = new FileManager()
        await fileManager.initialize()

        const stats = await fileManager.getStats()
        
        console.log('\n=== BLUESKY SCRAPER STATUS ===\n');
        
        console.log('📊 Storage Statistics:');
        console.log(`  Files Created: ${stats.filesCreated}`);
        console.log(`  Bytes Written: ${(stats.bytesWritten / 1024 / 1024).toFixed(2)} MB`);
        
        if (stats.users) {
            console.log(`\n👥 Users: ${stats.users.fileCount} files, ${stats.users.totalSizeMB} MB`);
        }
        
        if (stats.posts) {
            console.log(`📝 Posts: ${stats.posts.fileCount} files, ${stats.posts.totalSizeMB} MB`);
        }
        
        if (stats.relationships) {
            console.log(`🔗 Relationships: ${stats.relationships.fileCount} files, ${stats.relationships.totalSizeMB} MB`);
        }
        
        console.log('\n');

    } catch (error) {
        logger.error('Failed to get status:', error);
        process.exit(1);
    }
}

/**
 * Configure logging based on verbosity
 */
function configureLogging(verbose) {
    if (verbose) {
        process.env.LOG_LEVEL = 'debug';
    }
}

/**
 * Setup graceful shutdown for scrapers
 */
async function setupGracefulShutdown(scraper) {
    let isShuttingDown = false;
    
    const gracefulShutdown = async (signal) => {
        if (isShuttingDown) {
            logger.warn('Force shutdown requested');
            process.exit(1);
        }
        
        isShuttingDown = true;
        logger.info(`Received ${signal}, shutting down gracefully...`);
        
        try {
            await scraper.stop();
            await scraper.cleanup();
            logger.info('Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

/**
 * Log final statistics
 */
function logFinalStats(scraperName, stats) {
    logger.info(`${scraperName} scraping completed successfully!`);
    logger.info('Final Statistics:', {
        runtime: stats.runtimeFormatted,
        processed: stats.usersProcessed || stats.postsProcessed || stats.relationshipsProcessed,
        saved: stats.usersSaved || stats.postsSaved || stats.relationshipsSaved,
        duplicatesSkipped: stats.duplicatesSkipped,
        errors: stats.errors
    });
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

// Run the main function
if (import.meta.url === `file://${process.argv[1]}`) {
    program.parse()
}

export default program 