#!/usr/bin/env node

/**
 * Followers/Relationships Scraper Runner
 * 
 * Maps follower/following networks with configurable depth crawling (2-3 levels).
 * Builds comprehensive relationship graphs for network analysis.
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import RelationshipsScraper from '../src/scrapers/relationships_scraper.js'

const program = new Command()

/**
 * Main relationships scraping function
 */
async function runRelationshipsScraper(options) {
  const spinner = ora('Initializing Relationships Scraper...').start()
  
  try {
    // Initialize scraper with options
    const scraper = new RelationshipsScraper({
      maxRelationships: options.maxRelationships,
      maxDepth: options.maxDepth,
      maxFollowersPerUser: options.maxFollowersPerUser,
      maxFollowingPerUser: options.maxFollowingPerUser,
      includeFollowers: options.includeFollowers,
      includeFollowing: options.includeFollowing,
      seedUsers: options.seedUsers ? options.seedUsers.split(',') : null,
      outputDir: options.outputDir,
      dryRun: options.dryRun,
      resume: options.resume,
      checkpointInterval: options.checkpointInterval,
      bidirectional: options.bidirectional
    })

    await scraper.initialize()
    spinner.succeed('Relationships Scraper initialized')

    // Display configuration
    console.log(chalk.bold('\n🕸️  RELATIONSHIPS SCRAPER CONFIGURATION'))
    console.log('─'.repeat(50))
    console.log(`Max Relationships: ${chalk.cyan(options.maxRelationships.toLocaleString())}`)
    console.log(`Crawl Depth: ${chalk.cyan(options.maxDepth + ' levels')}`)
    console.log(`Max Followers Per User: ${chalk.cyan(options.maxFollowersPerUser)}`)
    console.log(`Max Following Per User: ${chalk.cyan(options.maxFollowingPerUser)}`)
    console.log(`Include Followers: ${chalk.cyan(options.includeFollowers ? 'Yes' : 'No')}`)
    console.log(`Include Following: ${chalk.cyan(options.includeFollowing ? 'Yes' : 'No')}`)
    console.log(`Bidirectional Analysis: ${chalk.cyan(options.bidirectional ? 'Yes' : 'No')}`)
    console.log(`Seed Users: ${chalk.cyan(options.seedUsers || 'Auto-discover')}`)
    console.log(`Output Directory: ${chalk.cyan(options.outputDir)}`)
    console.log(`Dry Run: ${chalk.cyan(options.dryRun ? 'Yes' : 'No')}`)
    console.log(`Resume: ${chalk.cyan(options.resume ? 'Yes' : 'No')}`)

    if (options.dryRun) {
      console.log(chalk.yellow('\n⚠️  DRY RUN MODE - No data will be saved'))
    }

    // Start scraping
    console.log(chalk.bold('\n🚀 Starting Relationships Scraping...'))
    
    const startTime = Date.now()
    const results = await scraper.start({
      resume: options.resume
    })

    const duration = Date.now() - startTime
    const durationMinutes = Math.round(duration / 60000)

    // Display results
    console.log(chalk.bold.green('\n✅ Relationships Scraping Completed!'))
    console.log('─'.repeat(50))
    console.log(`Relationships Mapped: ${chalk.green(results.relationshipsMapped.toLocaleString())}`)
    console.log(`Users Processed: ${chalk.cyan(results.usersProcessed.toLocaleString())}`)
    console.log(`Follower Relationships: ${chalk.blue(results.followerRelationships.toLocaleString())}`)
    console.log(`Following Relationships: ${chalk.magenta(results.followingRelationships.toLocaleString())}`)
    console.log(`Bidirectional Relationships: ${chalk.yellow(results.bidirectionalRelationships.toLocaleString())}`)
    console.log(`Network Depth Reached: ${chalk.cyan(results.maxDepthReached + ' levels')}`)
    console.log(`Duplicates Skipped: ${chalk.gray(results.duplicatesSkipped.toLocaleString())}`)
    console.log(`Errors: ${chalk.red(results.errors.toLocaleString())}`)
    console.log(`Duration: ${chalk.cyan(durationMinutes + ' minutes')}`)
    console.log(`Rate: ${chalk.green(Math.round(results.relationshipsMapped / durationMinutes) + ' relationships/minute')}`)

    // Network analysis summary
    if (results.networkAnalysis) {
      console.log(chalk.bold('\n📊 Network Analysis:'))
      console.log(`Total Nodes: ${chalk.cyan(results.networkAnalysis.totalNodes.toLocaleString())}`)
      console.log(`Total Edges: ${chalk.cyan(results.networkAnalysis.totalEdges.toLocaleString())}`)
      console.log(`Average Degree: ${chalk.yellow(results.networkAnalysis.averageDegree.toFixed(2))}`)
      console.log(`Network Density: ${chalk.yellow(results.networkAnalysis.density.toFixed(4))}`)
      console.log(`Connected Components: ${chalk.cyan(results.networkAnalysis.components)}`)
      
      if (results.networkAnalysis.topInfluencers) {
        console.log(chalk.bold('\n🌟 Top Influencers (by follower count):'))
        results.networkAnalysis.topInfluencers.slice(0, 5).forEach((user, index) => {
          console.log(`  ${index + 1}. ${chalk.cyan(user.handle)} - ${chalk.green(user.followersCount.toLocaleString())} followers`)
        })
      }
    }

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
    spinner.fail(`Relationships scraping failed: ${error.message}`)
    console.error(chalk.red('\nError details:'), error)
    process.exit(1)
  }
}

// Configure CLI
program
  .name('run-followers-scraper')
  .description('Map follower/following relationships in Bluesky network')
  .version('1.0.0')
  .option('-m, --max-relationships <number>', 'Maximum number of relationships to map', (val) => parseInt(val), 1000000)
  .option('-d, --max-depth <levels>', 'Maximum crawl depth (1-5)', (val) => parseInt(val), 3)
  .option('--max-followers-per-user <number>', 'Maximum followers to scrape per user', (val) => parseInt(val), 1000)
  .option('--max-following-per-user <number>', 'Maximum following to scrape per user', (val) => parseInt(val), 1000)
  .option('--include-followers', 'Include follower relationships', true)
  .option('--include-following', 'Include following relationships', true)
  .option('--no-followers', 'Exclude follower relationships')
  .option('--no-following', 'Exclude following relationships')
  .option('--bidirectional', 'Analyze bidirectional relationships', false)
  .option('-s, --seed-users <users>', 'Comma-separated list of seed users (handles or DIDs)')
  .option('-o, --output-dir <dir>', 'Output directory for scraped data', './data')
  .option('--dry-run', 'Run without saving data (for testing)', false)
  .option('-r, --resume', 'Resume from last checkpoint', false)
  .option('-c, --checkpoint-interval <number>', 'Checkpoint interval (relationships)', (val) => parseInt(val), 1000)
  .action(runRelationshipsScraper)

// Add examples
program.addHelpText('after', `

Examples:
  $ npm run scrape:followers
  $ npm run scrape:followers -- --max-depth 2 --max-relationships 500000
  $ npm run scrape:followers -- --seed-users "user1.bsky.social,user2.bsky.social"
  $ npm run scrape:followers -- --no-following --max-followers-per-user 500
  $ npm run scrape:followers -- --bidirectional --max-depth 2
  $ npm run scrape:followers -- --dry-run --max-relationships 1000
  $ npm run scrape:followers -- --resume

Network Analysis:
  --max-depth 1               # Direct connections only
  --max-depth 2               # Friends of friends
  --max-depth 3               # 3 degrees of separation
  --bidirectional             # Find mutual follows
  --no-followers              # Only following relationships
  --no-following              # Only follower relationships

Performance Tuning:
  --max-followers-per-user 100    # Limit for high-follower accounts
  --checkpoint-interval 500       # More frequent checkpoints
`)

program.parse()

export default runRelationshipsScraper 