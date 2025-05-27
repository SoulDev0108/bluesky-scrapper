#!/usr/bin/env node

/**
 * Posts Scraper Runner
 * 
 * Extracts posts from discovered users with filtering, age limits, and content analysis.
 * Target: 1M+ posts daily
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import PostsScraper from '../src/scrapers/posts_scraper.js'

const program = new Command()

/**
 * Main posts scraping function
 */
async function runPostsScraper(options) {
  const spinner = ora('Initializing Posts Scraper...').start()
  
  try {
    // Initialize scraper with options
    const scraper = new PostsScraper({
      maxPosts: options.maxPosts,
      maxPostsPerUser: options.maxPostsPerUser,
      minAge: options.minAge,
      maxAge: options.maxAge,
      includeMedia: options.includeMedia,
      includeReplies: options.includeReplies,
      includeReposts: options.includeReposts,
      filterLanguages: options.languages ? options.languages.split(',') : null,
      outputDir: options.outputDir,
      dryRun: options.dryRun,
      resume: options.resume,
      checkpointInterval: options.checkpointInterval
    })

    await scraper.initialize()
    spinner.succeed('Posts Scraper initialized')

    // Display configuration
    console.log(chalk.bold('\n📝 POSTS SCRAPER CONFIGURATION'))
    console.log('─'.repeat(50))
    console.log(`Max Posts: ${chalk.cyan(options.maxPosts.toLocaleString())}`)
    console.log(`Max Posts Per User: ${chalk.cyan(options.maxPostsPerUser)}`)
    console.log(`Age Range: ${chalk.cyan(options.minAge + ' - ' + options.maxAge + ' days')}`)
    console.log(`Include Media: ${chalk.cyan(options.includeMedia ? 'Yes' : 'No')}`)
    console.log(`Include Replies: ${chalk.cyan(options.includeReplies ? 'Yes' : 'No')}`)
    console.log(`Include Reposts: ${chalk.cyan(options.includeReposts ? 'Yes' : 'No')}`)
    console.log(`Languages: ${chalk.cyan(options.languages || 'All')}`)
    console.log(`Output Directory: ${chalk.cyan(options.outputDir)}`)
    console.log(`Dry Run: ${chalk.cyan(options.dryRun ? 'Yes' : 'No')}`)
    console.log(`Resume: ${chalk.cyan(options.resume ? 'Yes' : 'No')}`)

    if (options.dryRun) {
      console.log(chalk.yellow('\n⚠️  DRY RUN MODE - No data will be saved'))
    }

    // Start scraping
    console.log(chalk.bold('\n🚀 Starting Posts Scraping...'))
    
    const startTime = Date.now()
    const results = await scraper.start({
      resume: options.resume
    })

    const duration = Date.now() - startTime
    const durationMinutes = Math.round(duration / 60000)

    // Display results
    console.log(chalk.bold.green('\n✅ Posts Scraping Completed!'))
    console.log('─'.repeat(50))
    console.log(`Posts Scraped: ${chalk.green(results.postsScraped.toLocaleString())}`)
    console.log(`Users Processed: ${chalk.cyan(results.usersProcessed.toLocaleString())}`)
    console.log(`Media Posts: ${chalk.yellow(results.mediaPosts.toLocaleString())}`)
    console.log(`Reply Posts: ${chalk.blue(results.replyPosts.toLocaleString())}`)
    console.log(`Repost Posts: ${chalk.magenta(results.repostPosts.toLocaleString())}`)
    console.log(`Duplicates Skipped: ${chalk.gray(results.duplicatesSkipped.toLocaleString())}`)
    console.log(`Errors: ${chalk.red(results.errors.toLocaleString())}`)
    console.log(`Duration: ${chalk.cyan(durationMinutes + ' minutes')}`)
    console.log(`Rate: ${chalk.green(Math.round(results.postsScraped / durationMinutes) + ' posts/minute')}`)

    if (results.outputFiles && results.outputFiles.length > 0) {
      console.log(chalk.bold('\n📁 Output Files:'))
      results.outputFiles.forEach(file => {
        console.log(`  ${chalk.cyan(file)}`)
      })
    }

    // Display statistics
    const stats = await scraper.getStats()
    console.log(chalk.bold('\n📊 Scraper Statistics:'))
    console.log(`API Requests: ${chalk.cyan(stats.apiRequests.toLocaleString())}`)
    console.log(`Success Rate: ${chalk.green(stats.successRate + '%')}`)
    console.log(`Average Response Time: ${chalk.yellow(stats.avgResponseTime + 'ms')}`)

    await scraper.cleanup()

  } catch (error) {
    spinner.fail(`Posts scraping failed: ${error.message}`)
    console.error(chalk.red('\nError details:'), error)
    process.exit(1)
  }
}

// Configure CLI
program
  .name('run-posts-scraper')
  .description('Extract posts from discovered Bluesky users')
  .version('1.0.0')
  .option('-m, --max-posts <number>', 'Maximum number of posts to scrape', (val) => parseInt(val), 1000000)
  .option('-u, --max-posts-per-user <number>', 'Maximum posts per user', (val) => parseInt(val), 100)
  .option('--min-age <days>', 'Minimum post age in days', (val) => parseInt(val), 0)
  .option('--max-age <days>', 'Maximum post age in days', (val) => parseInt(val), 30)
  .option('--include-media', 'Include posts with media (images/videos)', false)
  .option('--include-replies', 'Include reply posts', false)
  .option('--include-reposts', 'Include repost/quote posts', false)
  .option('-l, --languages <langs>', 'Comma-separated list of language codes (e.g., en,es,fr)')
  .option('-o, --output-dir <dir>', 'Output directory for scraped data', './data')
  .option('-d, --dry-run', 'Run without saving data (for testing)', false)
  .option('-r, --resume', 'Resume from last checkpoint', false)
  .option('-c, --checkpoint-interval <number>', 'Checkpoint interval (posts)', (val) => parseInt(val), 1000)
  .action(runPostsScraper)

// Add examples
program.addHelpText('after', `

Examples:
  $ npm run scrape:posts
  $ npm run scrape:posts -- --max-posts 500000 --include-media
  $ npm run scrape:posts -- --max-posts-per-user 50 --languages en,es
  $ npm run scrape:posts -- --min-age 1 --max-age 7 --include-replies
  $ npm run scrape:posts -- --dry-run --max-posts 1000
  $ npm run scrape:posts -- --resume

Post Filtering:
  --min-age 0 --max-age 1     # Only posts from last 24 hours
  --min-age 1 --max-age 7     # Posts from last week
  --include-media             # Only posts with images/videos
  --include-replies           # Include reply threads
  --languages en              # Only English posts
`)

program.parse()

export default runPostsScraper 