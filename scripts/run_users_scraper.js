#!/usr/bin/env node

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

import UsersScraper from '../src/scrapers/users_scraper.js'
import logger from '../src/core/logger.js'

/**
 * Users Scraper Runner
 * Command-line interface for running the users scraper
 */

const program = new Command();

program
    .name('run-users-scraper')
    .description('Run the Bluesky users scraper')
    .version('1.0.0')
    .option('-m, --max-users <number>', 'Maximum number of users to scrape', '500000')
    .option('-b, --batch-size <number>', 'Batch size for API requests', '100')
    .option('-s, --save-interval <number>', 'Save interval (number of users)', '1000')
    .option('-c, --checkpoint-interval <number>', 'Checkpoint interval (number of users)', '5000')
    .option('-r, --resume', 'Resume from last checkpoint', false)
    .option('-t, --search-terms <terms>', 'Comma-separated search terms', '')
    .option('--dry-run', 'Run in dry-run mode (no actual scraping)', false)
    .option('--verbose', 'Enable verbose logging', false);

program.parse();

const options = program.opts();

// Configure logging
if (options.verbose) {
    process.env.LOG_LEVEL = 'debug';
}

async function main() {
    try {
        logger.info('Starting Bluesky Users Scraper');
        logger.info('Options:', options);

        // Parse search terms if provided
        let searchTerms = undefined;
        if (options.searchTerms) {
            searchTerms = options.searchTerms.split(',').map(term => term.trim());
            logger.info(`Using custom search terms: ${searchTerms.join(', ')}`);
        }

        // Create scraper instance
        const scraperOptions = {
            maxUsers: parseInt(options.maxUsers),
            batchSize: parseInt(options.batchSize),
            saveInterval: parseInt(options.saveInterval),
            checkpointInterval: parseInt(options.checkpointInterval),
            searchTerms: searchTerms
        };

        const scraper = new UsersScraper(scraperOptions);

        // Handle graceful shutdown
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

        if (options.dryRun) {
            logger.info('DRY RUN MODE - No actual scraping will be performed');
            logger.info('Scraper configuration:', scraperOptions);
            return;
        }

        // Initialize and start scraper
        await scraper.initialize();
        
        const resumeOptions = {
            resume: options.resume
        };

        await scraper.start(resumeOptions);

        // Print final statistics
        const stats = scraper.getStats();
        logger.info('Scraping completed successfully!');
        logger.info('Final Statistics:', {
            usersProcessed: stats.usersProcessed,
            usersSaved: stats.usersSaved,
            duplicatesSkipped: stats.duplicatesSkipped,
            errors: stats.errors,
            runtime: stats.runtimeFormatted,
            usersPerHour: stats.usersPerHour
        });

        await scraper.cleanup();

    } catch (error) {
        logger.error('Users scraper failed:', error);
        process.exit(1);
    }
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
if (import.meta.main) {
    main().catch(error => {
        logger.error('Fatal error:', error);
        process.exit(1);
    });
}

export default main; 