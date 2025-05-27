#!/usr/bin/env node

/**
 * User Info Scraper Runner
 * 
 * Scrapes individual user information by Bluesky URL or handle.
 * Provides detailed user profile data with metrics and enrichment.
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import UserInfoScraper from '../src/scrapers/user_info_scraper.js'

const program = new Command()

/**
 * Main user info scraping function
 */
async function runUserInfoScraper(options) {
  const spinner = ora('Initializing User Info Scraper...').start()
  
  try {
    // Initialize scraper with options
    const scraper = new UserInfoScraper({
      includeMetrics: options.includeMetrics,
      includePosts: options.includePosts,
      includeFollowers: options.includeFollowers,
      includeFollowing: options.includeFollowing,
      maxPosts: options.maxPosts,
      maxFollowers: options.maxFollowers,
      maxFollowing: options.maxFollowing,
      outputDir: options.outputDir,
      outputFormat: options.outputFormat,
      saveToFile: !options.stdout
    })

    await scraper.initialize()
    spinner.succeed('User Info Scraper initialized')

    // Parse input
    let targets = []
    
    if (options.url) {
      targets.push(options.url)
    }
    
    if (options.handle) {
      targets.push(options.handle)
    }
    
    if (options.file) {
      const fs = await import('fs-extra')
      const fileContent = await fs.readFile(options.file, 'utf8')
      const fileTargets = fileContent.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
      targets.push(...fileTargets)
    }

    if (targets.length === 0) {
      spinner.fail('No user URL, handle, or file specified')
      process.exit(1)
    }

    // Display configuration
    console.log(chalk.bold('\n👤 USER INFO SCRAPER CONFIGURATION'))
    console.log('─'.repeat(50))
    console.log(`Targets: ${chalk.cyan(targets.length)}`)
    console.log(`Include Metrics: ${chalk.cyan(options.includeMetrics ? 'Yes' : 'No')}`)
    console.log(`Include Posts: ${chalk.cyan(options.includePosts ? 'Yes' : 'No')}`)
    console.log(`Include Followers: ${chalk.cyan(options.includeFollowers ? 'Yes' : 'No')}`)
    console.log(`Include Following: ${chalk.cyan(options.includeFollowing ? 'Yes' : 'No')}`)
    console.log(`Max Posts: ${chalk.cyan(options.maxPosts)}`)
    console.log(`Max Followers: ${chalk.cyan(options.maxFollowers)}`)
    console.log(`Max Following: ${chalk.cyan(options.maxFollowing)}`)
    console.log(`Output Format: ${chalk.cyan(options.outputFormat)}`)
    console.log(`Output to: ${chalk.cyan(options.stdout ? 'stdout' : options.outputDir)}`)

    // Start scraping
    console.log(chalk.bold('\n🚀 Starting User Info Scraping...'))
    
    const startTime = Date.now()
    const results = []

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      const targetSpinner = ora(`Scraping user ${i + 1}/${targets.length}: ${target}`).start()
      
      try {
        const result = await scraper.scrapeUser(target)
        results.push(result)
        
        targetSpinner.succeed(`User ${i + 1}/${targets.length} scraped: ${result.user.handle}`)
        
        // Display user info if stdout mode
        if (options.stdout) {
          displayUserInfo(result, options)
        }
        
      } catch (error) {
        targetSpinner.fail(`Failed to scrape user ${i + 1}/${targets.length}: ${error.message}`)
        results.push({ error: error.message, target })
      }
    }

    const duration = Date.now() - startTime
    const durationSeconds = Math.round(duration / 1000)

    // Display summary
    const successful = results.filter(r => !r.error).length
    const failed = results.filter(r => r.error).length

    console.log(chalk.bold.green('\n✅ User Info Scraping Completed!'))
    console.log('─'.repeat(50))
    console.log(`Users Processed: ${chalk.cyan(targets.length)}`)
    console.log(`Successful: ${chalk.green(successful)}`)
    console.log(`Failed: ${chalk.red(failed)}`)
    console.log(`Duration: ${chalk.cyan(durationSeconds + ' seconds')}`)

    if (successful > 0) {
      const avgTime = Math.round(duration / successful)
      console.log(`Average Time per User: ${chalk.yellow(avgTime + 'ms')}`)
    }

    // Display failed targets
    if (failed > 0) {
      console.log(chalk.bold.red('\n❌ Failed Targets:'))
      results.filter(r => r.error).forEach(result => {
        console.log(`  ${chalk.red('•')} ${result.target}: ${result.error}`)
      })
    }

    // Display output files
    if (!options.stdout && successful > 0) {
      const outputFiles = await scraper.getOutputFiles()
      if (outputFiles.length > 0) {
        console.log(chalk.bold('\n📁 Output Files:'))
        outputFiles.forEach(file => {
          console.log(`  ${chalk.cyan(file)}`)
        })
      }
    }

    // Display statistics
    const stats = await scraper.getStats()
    console.log(chalk.bold('\n📊 Scraper Statistics:'))
    console.log(`API Requests: ${chalk.cyan(stats.apiRequests)}`)
    console.log(`Success Rate: ${chalk.green(stats.successRate + '%')}`)
    console.log(`Average Response Time: ${chalk.yellow(stats.avgResponseTime + 'ms')}`)

    await scraper.cleanup()

  } catch (error) {
    spinner.fail(`User info scraping failed: ${error.message}`)
    console.error(chalk.red('\nError details:'), error)
    process.exit(1)
  }
}

/**
 * Display user information to stdout
 */
function displayUserInfo(result, options) {
  const user = result.user
  
  console.log(chalk.bold(`\n👤 ${user.displayName || user.handle}`))
  console.log('─'.repeat(40))
  console.log(`Handle: ${chalk.cyan(user.handle)}`)
  console.log(`DID: ${chalk.gray(user.did)}`)
  
  if (user.description) {
    console.log(`Bio: ${chalk.white(user.description)}`)
  }
  
  if (user.avatar) {
    console.log(`Avatar: ${chalk.blue(user.avatar)}`)
  }
  
  console.log(`Created: ${chalk.yellow(new Date(user.createdAt).toLocaleDateString())}`)
  
  if (options.includeMetrics && result.metrics) {
    console.log(chalk.bold('\n📊 Metrics:'))
    console.log(`Followers: ${chalk.green(result.metrics.followersCount.toLocaleString())}`)
    console.log(`Following: ${chalk.blue(result.metrics.followsCount.toLocaleString())}`)
    console.log(`Posts: ${chalk.magenta(result.metrics.postsCount.toLocaleString())}`)
    
    if (result.metrics.engagementRate) {
      console.log(`Engagement Rate: ${chalk.yellow(result.metrics.engagementRate.toFixed(2) + '%')}`)
    }
  }
  
  if (options.includePosts && result.recentPosts) {
    console.log(chalk.bold(`\n📝 Recent Posts (${result.recentPosts.length}):`))
    result.recentPosts.slice(0, 3).forEach((post, index) => {
      const text = post.text.length > 100 ? post.text.substring(0, 100) + '...' : post.text
      console.log(`  ${index + 1}. ${chalk.white(text)}`)
      console.log(`     ${chalk.gray(new Date(post.createdAt).toLocaleDateString())} • ${chalk.cyan(post.likeCount)} likes`)
    })
  }
  
  if (options.includeFollowers && result.topFollowers) {
    console.log(chalk.bold(`\n👥 Top Followers (${result.topFollowers.length}):`))
    result.topFollowers.slice(0, 5).forEach((follower, index) => {
      console.log(`  ${index + 1}. ${chalk.cyan(follower.handle)} - ${chalk.green(follower.followersCount.toLocaleString())} followers`)
    })
  }
}

// Configure CLI
program
  .name('run-user-info')
  .description('Scrape individual Bluesky user information')
  .version('1.0.0')
  .option('-u, --url <url>', 'Bluesky profile URL (e.g., https://bsky.app/profile/username)')
  .option('-h, --handle <handle>', 'User handle (e.g., username.bsky.social)')
  .option('-f, --file <file>', 'File containing URLs/handles (one per line)')
  .option('--include-metrics', 'Include detailed metrics and analytics', false)
  .option('--include-posts', 'Include recent posts', false)
  .option('--include-followers', 'Include top followers', false)
  .option('--include-following', 'Include following list', false)
  .option('--max-posts <number>', 'Maximum recent posts to fetch', (val) => parseInt(val), 20)
  .option('--max-followers <number>', 'Maximum followers to fetch', (val) => parseInt(val), 100)
  .option('--max-following <number>', 'Maximum following to fetch', (val) => parseInt(val), 100)
  .option('-o, --output-dir <dir>', 'Output directory for scraped data', './data')
  .option('--output-format <format>', 'Output format (json, csv)', 'json')
  .option('--stdout', 'Output to stdout instead of file', false)
  .action(runUserInfoScraper)

// Add examples
program.addHelpText('after', `

Examples:
  $ npm run scrape:user-info -- --url "https://bsky.app/profile/username.bsky.social"
  $ npm run scrape:user-info -- --handle "username.bsky.social"
  $ npm run scrape:user-info -- --handle "username.bsky.social" --include-metrics --include-posts
  $ npm run scrape:user-info -- --file users.txt --include-followers --max-followers 50
  $ npm run scrape:user-info -- --url "https://bsky.app/profile/username" --stdout
  $ npm run scrape:user-info -- --handle "user.bsky.social" --output-format csv

URL Formats Supported:
  https://bsky.app/profile/username.bsky.social
  https://bsky.app/profile/username
  username.bsky.social
  username
  did:plc:abc123...

File Format (users.txt):
  https://bsky.app/profile/user1.bsky.social
  user2.bsky.social
  user3
  # Comments are ignored
  did:plc:abc123...

Data Enrichment:
  --include-metrics           # Follower/following counts, engagement rate
  --include-posts             # Recent posts with engagement data
  --include-followers         # Top followers by influence
  --include-following         # Following list analysis
`)

program.parse()

export default runUserInfoScraper 