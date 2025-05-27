#!/usr/bin/env node

/**
 * Post Info Scraper Runner
 * 
 * Scrapes individual post information by Bluesky URL or AT URI.
 * Provides complete post data with thread context, engagement metrics, and content analysis.
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import PostInfoScraper from '../src/scrapers/post_info_scraper.js'

const program = new Command()

/**
 * Main post info scraping function
 */
async function runPostInfoScraper(options) {
  const spinner = ora('Initializing Post Info Scraper...').start()
  
  try {
    // Initialize scraper with options
    const scraper = new PostInfoScraper({
      includeThread: options.includeThread,
      includeReplies: options.includeReplies,
      includeParent: options.includeParent,
      includeEngagement: options.includeEngagement,
      includeMedia: options.includeMedia,
      maxThreadDepth: options.maxThreadDepth,
      maxReplies: options.maxReplies,
      outputDir: options.outputDir,
      outputFormat: options.outputFormat,
      saveToFile: !options.stdout
    })

    await scraper.initialize()
    spinner.succeed('Post Info Scraper initialized')

    // Parse input
    let targets = []
    
    if (options.url) {
      targets.push(options.url)
    }
    
    if (options.uri) {
      targets.push(options.uri)
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
      spinner.fail('No post URL, URI, or file specified')
      process.exit(1)
    }

    // Display configuration
    console.log(chalk.bold('\n📝 POST INFO SCRAPER CONFIGURATION'))
    console.log('─'.repeat(50))
    console.log(`Targets: ${chalk.cyan(targets.length)}`)
    console.log(`Include Thread: ${chalk.cyan(options.includeThread ? 'Yes' : 'No')}`)
    console.log(`Include Replies: ${chalk.cyan(options.includeReplies ? 'Yes' : 'No')}`)
    console.log(`Include Parent: ${chalk.cyan(options.includeParent ? 'Yes' : 'No')}`)
    console.log(`Include Engagement: ${chalk.cyan(options.includeEngagement ? 'Yes' : 'No')}`)
    console.log(`Include Media: ${chalk.cyan(options.includeMedia ? 'Yes' : 'No')}`)
    console.log(`Max Thread Depth: ${chalk.cyan(options.maxThreadDepth)}`)
    console.log(`Max Replies: ${chalk.cyan(options.maxReplies)}`)
    console.log(`Output Format: ${chalk.cyan(options.outputFormat)}`)
    console.log(`Output to: ${chalk.cyan(options.stdout ? 'stdout' : options.outputDir)}`)

    // Start scraping
    console.log(chalk.bold('\n🚀 Starting Post Info Scraping...'))
    
    const startTime = Date.now()
    const results = []

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      const targetSpinner = ora(`Scraping post ${i + 1}/${targets.length}: ${target}`).start()
      
      try {
        const result = await scraper.scrapePost(target)
        results.push(result)
        
        targetSpinner.succeed(`Post ${i + 1}/${targets.length} scraped: ${result.post.uri}`)
        
        // Display post info if stdout mode
        if (options.stdout) {
          displayPostInfo(result, options)
        }
        
      } catch (error) {
        targetSpinner.fail(`Failed to scrape post ${i + 1}/${targets.length}: ${error.message}`)
        results.push({ error: error.message, target })
      }
    }

    const duration = Date.now() - startTime
    const durationSeconds = Math.round(duration / 1000)

    // Display summary
    const successful = results.filter(r => !r.error).length
    const failed = results.filter(r => r.error).length

    console.log(chalk.bold.green('\n✅ Post Info Scraping Completed!'))
    console.log('─'.repeat(50))
    console.log(`Posts Processed: ${chalk.cyan(targets.length)}`)
    console.log(`Successful: ${chalk.green(successful)}`)
    console.log(`Failed: ${chalk.red(failed)}`)
    console.log(`Duration: ${chalk.cyan(durationSeconds + ' seconds')}`)

    if (successful > 0) {
      const avgTime = Math.round(duration / successful)
      console.log(`Average Time per Post: ${chalk.yellow(avgTime + 'ms')}`)
      
      // Aggregate statistics
      const totalReplies = results.filter(r => !r.error).reduce((sum, r) => sum + (r.replies?.length || 0), 0)
      const totalLikes = results.filter(r => !r.error).reduce((sum, r) => sum + (r.post.likeCount || 0), 0)
      const totalReposts = results.filter(r => !r.error).reduce((sum, r) => sum + (r.post.repostCount || 0), 0)
      
      console.log(`Total Replies Collected: ${chalk.blue(totalReplies.toLocaleString())}`)
      console.log(`Total Likes: ${chalk.green(totalLikes.toLocaleString())}`)
      console.log(`Total Reposts: ${chalk.magenta(totalReposts.toLocaleString())}`)
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
    spinner.fail(`Post info scraping failed: ${error.message}`)
    console.error(chalk.red('\nError details:'), error)
    process.exit(1)
  }
}

/**
 * Display post information to stdout
 */
function displayPostInfo(result, options) {
  const post = result.post
  
  console.log(chalk.bold(`\n📝 Post by ${post.author.displayName || post.author.handle}`))
  console.log('─'.repeat(60))
  console.log(`Author: ${chalk.cyan(post.author.handle)}`)
  console.log(`URI: ${chalk.gray(post.uri)}`)
  console.log(`Created: ${chalk.yellow(new Date(post.createdAt).toLocaleString())}`)
  
  if (post.text) {
    console.log(`\nContent:`)
    console.log(chalk.white(post.text))
  }
  
  if (options.includeEngagement) {
    console.log(chalk.bold('\n📊 Engagement:'))
    console.log(`Likes: ${chalk.green(post.likeCount?.toLocaleString() || '0')}`)
    console.log(`Reposts: ${chalk.blue(post.repostCount?.toLocaleString() || '0')}`)
    console.log(`Replies: ${chalk.magenta(post.replyCount?.toLocaleString() || '0')}`)
  }
  
  if (options.includeMedia && post.embed) {
    console.log(chalk.bold('\n🖼️  Media:'))
    if (post.embed.images) {
      console.log(`Images: ${chalk.cyan(post.embed.images.length)}`)
      post.embed.images.forEach((img, index) => {
        console.log(`  ${index + 1}. ${chalk.blue(img.fullsize)}`)
        if (img.alt) {
          console.log(`     Alt: ${chalk.gray(img.alt)}`)
        }
      })
    }
    if (post.embed.external) {
      console.log(`External Link: ${chalk.blue(post.embed.external.uri)}`)
      console.log(`Title: ${chalk.white(post.embed.external.title)}`)
    }
  }
  
  if (options.includeParent && result.parent) {
    console.log(chalk.bold('\n⬆️  Parent Post:'))
    console.log(`Author: ${chalk.cyan(result.parent.author.handle)}`)
    const parentText = result.parent.text.length > 100 ? result.parent.text.substring(0, 100) + '...' : result.parent.text
    console.log(`Content: ${chalk.gray(parentText)}`)
  }
  
  if (options.includeReplies && result.replies && result.replies.length > 0) {
    console.log(chalk.bold(`\n💬 Replies (${result.replies.length}):`))
    result.replies.slice(0, 3).forEach((reply, index) => {
      const replyText = reply.text.length > 80 ? reply.text.substring(0, 80) + '...' : reply.text
      console.log(`  ${index + 1}. ${chalk.cyan(reply.author.handle)}: ${chalk.white(replyText)}`)
      console.log(`     ${chalk.gray(new Date(reply.createdAt).toLocaleDateString())} • ${chalk.green(reply.likeCount || 0)} likes`)
    })
    
    if (result.replies.length > 3) {
      console.log(`     ${chalk.gray(`... and ${result.replies.length - 3} more replies`)}`)
    }
  }
  
  if (options.includeThread && result.threadContext) {
    console.log(chalk.bold('\n🧵 Thread Context:'))
    console.log(`Thread Length: ${chalk.cyan(result.threadContext.length)} posts`)
    console.log(`Position in Thread: ${chalk.yellow(result.threadContext.position)}`)
    console.log(`Thread Author: ${chalk.cyan(result.threadContext.rootAuthor)}`)
  }
}

// Configure CLI
program
  .name('run-post-info')
  .description('Scrape individual Bluesky post information')
  .version('1.0.0')
  .option('-u, --url <url>', 'Bluesky post URL (e.g., https://bsky.app/profile/user/post/abc123)')
  .option('--uri <uri>', 'AT Protocol URI (e.g., at://did:plc:abc123/app.bsky.feed.post/abc123)')
  .option('-f, --file <file>', 'File containing URLs/URIs (one per line)')
  .option('--include-thread', 'Include full thread context', false)
  .option('--include-replies', 'Include post replies', false)
  .option('--include-parent', 'Include parent post (if reply)', false)
  .option('--include-engagement', 'Include engagement metrics', false)
  .option('--include-media', 'Include media attachments', false)
  .option('--max-thread-depth <number>', 'Maximum thread depth to follow', (val) => parseInt(val), 10)
  .option('--max-replies <number>', 'Maximum replies to fetch', (val) => parseInt(val), 50)
  .option('-o, --output-dir <dir>', 'Output directory for scraped data', './data')
  .option('--output-format <format>', 'Output format (json, csv)', 'json')
  .option('--stdout', 'Output to stdout instead of file', false)
  .action(runPostInfoScraper)

// Add examples
program.addHelpText('after', `

Examples:
  $ npm run scrape:post-info -- --url "https://bsky.app/profile/user.bsky.social/post/abc123"
  $ npm run scrape:post-info -- --uri "at://did:plc:abc123/app.bsky.feed.post/abc123"
  $ npm run scrape:post-info -- --url "https://bsky.app/profile/user/post/abc123" --include-thread --include-replies
  $ npm run scrape:post-info -- --file posts.txt --include-engagement --include-media
  $ npm run scrape:post-info -- --url "https://bsky.app/profile/user/post/abc123" --stdout
  $ npm run scrape:post-info -- --uri "at://..." --output-format csv

URL Formats Supported:
  https://bsky.app/profile/username.bsky.social/post/abc123
  https://bsky.app/profile/username/post/abc123
  at://did:plc:abc123.../app.bsky.feed.post/abc123

File Format (posts.txt):
  https://bsky.app/profile/user1.bsky.social/post/abc123
  https://bsky.app/profile/user2/post/def456
  at://did:plc:abc123.../app.bsky.feed.post/ghi789
  # Comments are ignored

Data Enrichment:
  --include-thread            # Full thread context and position
  --include-replies           # All replies to the post
  --include-parent            # Parent post if this is a reply
  --include-engagement        # Like/repost/reply counts
  --include-media             # Images, videos, external links

Thread Analysis:
  --max-thread-depth 5        # Follow thread up to 5 levels deep
  --max-replies 100           # Fetch up to 100 replies
`)

program.parse()

export default runPostInfoScraper 