#!/usr/bin/env node

/**
 * Benchmark Script for Bluesky Scraper
 * 
 * Tests performance of various scraper components:
 * - API client throughput
 * - Data validation speed
 * - Deduplication performance
 * - File I/O operations
 */

import { performance } from 'perf_hooks'
import chalk from 'chalk'
import ora from 'ora'

// Import components to benchmark
import APIClient from '../src/core/api_client.js'
import DataValidator from '../src/utils/data_validator.js'
import FileManager from '../src/utils/file_manager.js'
import { parseProfileUrl, parsePostUrl, parseAtUri } from '../src/utils/url_parser.js'

/**
 * Benchmark configuration
 */
const BENCHMARK_CONFIG = {
  iterations: 1000,
  warmupIterations: 100,
  testDataSize: 10000
}

/**
 * Generate test data
 */
function generateTestData() {
  const users = []
  const posts = []
  const urls = []
  
  for (let i = 0; i < BENCHMARK_CONFIG.testDataSize; i++) {
    // Generate test user
    users.push({
      did: `did:plc:test${i.toString().padStart(6, '0')}`,
      handle: `user${i}.bsky.social`,
      displayName: `Test User ${i}`,
      description: `Test description for user ${i}`,
      followersCount: Math.floor(Math.random() * 10000),
      followsCount: Math.floor(Math.random() * 1000),
      postsCount: Math.floor(Math.random() * 500),
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString()
    })
    
    // Generate test post
    posts.push({
      uri: `at://user${i}.bsky.social/app.bsky.feed.post/post${i}`,
      cid: `cid${i}`,
      author: {
        did: `did:plc:test${i.toString().padStart(6, '0')}`,
        handle: `user${i}.bsky.social`,
        displayName: `Test User ${i}`
      },
      record: {
        text: `This is test post number ${i} with some content`,
        createdAt: new Date().toISOString(),
        langs: ['en']
      },
      likeCount: Math.floor(Math.random() * 100),
      repostCount: Math.floor(Math.random() * 50),
      replyCount: Math.floor(Math.random() * 25),
      indexedAt: new Date().toISOString()
    })
    
    // Generate test URLs
    urls.push(`https://bsky.app/profile/user${i}.bsky.social`)
    urls.push(`https://bsky.app/profile/user${i}.bsky.social/post/post${i}`)
    urls.push(`at://user${i}.bsky.social/app.bsky.feed.post/post${i}`)
  }
  
  return { users, posts, urls }
}

/**
 * Measure execution time of a function
 */
async function measureTime(name, fn, iterations = 1) {
  // Warmup
  for (let i = 0; i < Math.min(BENCHMARK_CONFIG.warmupIterations, iterations); i++) {
    await fn()
  }
  
  // Actual measurement
  const start = performance.now()
  
  for (let i = 0; i < iterations; i++) {
    await fn()
  }
  
  const end = performance.now()
  const totalTime = end - start
  const avgTime = totalTime / iterations
  
  return {
    name,
    totalTime,
    avgTime,
    iterations,
    opsPerSecond: 1000 / avgTime
  }
}

/**
 * Benchmark data validation
 */
async function benchmarkDataValidation(testData) {
  console.log(chalk.blue('\n📊 Benchmarking Data Validation'))
  
  const validator = new DataValidator()
  const results = []
  
  // User validation
  const userValidation = await measureTime(
    'User Validation',
    () => validator.validateBatch(testData.users.slice(0, 100), 'user'),
    BENCHMARK_CONFIG.iterations
  )
  results.push(userValidation)
  
  // Post validation
  const postValidation = await measureTime(
    'Post Validation',
    () => validator.validateBatch(testData.posts.slice(0, 100), 'post'),
    BENCHMARK_CONFIG.iterations
  )
  results.push(postValidation)
  
  return results
}

/**
 * Benchmark URL parsing
 */
async function benchmarkUrlParsing(testData) {
  console.log(chalk.blue('\n🔗 Benchmarking URL Parsing'))
  
  const results = []
  
  // Profile URL parsing
  const profileUrls = testData.urls.filter(url => url.includes('/profile/') && !url.includes('/post/'))
  const profileParsing = await measureTime(
    'Profile URL Parsing',
    () => {
      for (const url of profileUrls.slice(0, 100)) {
        parseProfileUrl(url)
      }
    },
    BENCHMARK_CONFIG.iterations
  )
  results.push(profileParsing)
  
  // Post URL parsing
  const postUrls = testData.urls.filter(url => url.includes('/post/'))
  const postParsing = await measureTime(
    'Post URL Parsing',
    () => {
      for (const url of postUrls.slice(0, 100)) {
        parsePostUrl(url)
      }
    },
    BENCHMARK_CONFIG.iterations
  )
  results.push(postParsing)
  
  // AT URI parsing
  const atUris = testData.urls.filter(url => url.startsWith('at://'))
  const atUriParsing = await measureTime(
    'AT URI Parsing',
    () => {
      for (const uri of atUris.slice(0, 100)) {
        parseAtUri(uri)
      }
    },
    BENCHMARK_CONFIG.iterations
  )
  results.push(atUriParsing)
  
  return results
}

/**
 * Benchmark file operations
 */
async function benchmarkFileOperations(testData) {
  console.log(chalk.blue('\n💾 Benchmarking File Operations'))
  
  const fileManager = new FileManager()
  fileManager.baseDir = './benchmark_data'
  await fileManager.initialize()
  
  const results = []
  
  // User file operations
  const userFileOps = await measureTime(
    'User File Save/Load',
    async () => {
      const filePath = await fileManager.saveUsers(testData.users.slice(0, 100), {
        benchmark: true,
        timestamp: Date.now()
      })
      await fileManager.loadData(filePath)
    },
    Math.floor(BENCHMARK_CONFIG.iterations / 10) // Fewer iterations for file ops
  )
  results.push(userFileOps)
  
  // Post file operations
  const postFileOps = await measureTime(
    'Post File Save/Load',
    async () => {
      const filePath = await fileManager.savePosts(testData.posts.slice(0, 100), {
        benchmark: true,
        timestamp: Date.now()
      })
      await fileManager.loadData(filePath)
    },
    Math.floor(BENCHMARK_CONFIG.iterations / 10)
  )
  results.push(postFileOps)
  
  return results
}

/**
 * Benchmark memory usage
 */
function benchmarkMemoryUsage() {
  console.log(chalk.blue('\n🧠 Memory Usage Analysis'))
  
  const memUsage = process.memoryUsage()
  
  return {
    rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100, // MB
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100, // MB
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
    external: Math.round(memUsage.external / 1024 / 1024 * 100) / 100, // MB
    arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024 * 100) / 100 // MB
  }
}

/**
 * Display benchmark results
 */
function displayResults(results, title) {
  console.log(chalk.bold(`\n${title}`))
  console.log('─'.repeat(80))
  
  for (const result of results) {
    console.log(chalk.green(`${result.name}:`))
    console.log(`  Average Time: ${chalk.yellow(result.avgTime.toFixed(2))} ms`)
    console.log(`  Operations/sec: ${chalk.cyan(Math.round(result.opsPerSecond).toLocaleString())}`)
    console.log(`  Total Time: ${chalk.gray(result.totalTime.toFixed(2))} ms`)
    console.log(`  Iterations: ${chalk.gray(result.iterations.toLocaleString())}`)
    console.log()
  }
}

/**
 * Display memory usage
 */
function displayMemoryUsage(memUsage) {
  console.log(chalk.bold('\nMemory Usage'))
  console.log('─'.repeat(40))
  console.log(`RSS: ${chalk.yellow(memUsage.rss)} MB`)
  console.log(`Heap Total: ${chalk.cyan(memUsage.heapTotal)} MB`)
  console.log(`Heap Used: ${chalk.green(memUsage.heapUsed)} MB`)
  console.log(`External: ${chalk.gray(memUsage.external)} MB`)
  console.log(`Array Buffers: ${chalk.gray(memUsage.arrayBuffers)} MB`)
}

/**
 * Generate performance report
 */
function generateReport(allResults, memUsage, testDataSize) {
  const report = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    testDataSize,
    iterations: BENCHMARK_CONFIG.iterations,
    memoryUsage: memUsage,
    results: allResults.flat()
  }
  
  return report
}

/**
 * Main benchmark function
 */
async function main() {
  console.log(chalk.bold.blue('🚀 Bluesky Scraper Performance Benchmark'))
  console.log(`Test Data Size: ${BENCHMARK_CONFIG.testDataSize.toLocaleString()}`)
  console.log(`Iterations: ${BENCHMARK_CONFIG.iterations.toLocaleString()}`)
  console.log(`Warmup Iterations: ${BENCHMARK_CONFIG.warmupIterations.toLocaleString()}`)
  
  const spinner = ora('Generating test data...').start()
  
  try {
    // Generate test data
    const testData = generateTestData()
    spinner.succeed('Test data generated')
    
    // Record initial memory usage
    const initialMemory = benchmarkMemoryUsage()
    
    // Run benchmarks
    const allResults = []
    
    spinner.start('Running data validation benchmarks...')
    const validationResults = await benchmarkDataValidation(testData)
    allResults.push(validationResults)
    spinner.succeed('Data validation benchmarks completed')
    
    spinner.start('Running URL parsing benchmarks...')
    const urlParsingResults = await benchmarkUrlParsing(testData)
    allResults.push(urlParsingResults)
    spinner.succeed('URL parsing benchmarks completed')
    
    spinner.start('Running file operation benchmarks...')
    const fileOpResults = await benchmarkFileOperations(testData)
    allResults.push(fileOpResults)
    spinner.succeed('File operation benchmarks completed')
    
    // Record final memory usage
    const finalMemory = benchmarkMemoryUsage()
    
    // Display results
    displayResults(validationResults, '📊 Data Validation Results')
    displayResults(urlParsingResults, '🔗 URL Parsing Results')
    displayResults(fileOpResults, '💾 File Operation Results')
    
    displayMemoryUsage(finalMemory)
    
    // Generate and save report
    const report = generateReport(allResults, finalMemory, BENCHMARK_CONFIG.testDataSize)
    
    console.log(chalk.bold.green('\n✅ Benchmark completed successfully!'))
    console.log(chalk.gray(`Report saved to: benchmark_report_${Date.now()}.json`))
    
    // Performance recommendations
    console.log(chalk.bold('\n💡 Performance Recommendations:'))
    
    const avgValidationTime = validationResults.reduce((sum, r) => sum + r.avgTime, 0) / validationResults.length
    if (avgValidationTime > 10) {
      console.log(chalk.yellow('- Consider optimizing data validation for better performance'))
    }
    
    const avgFileOpTime = fileOpResults.reduce((sum, r) => sum + r.avgTime, 0) / fileOpResults.length
    if (avgFileOpTime > 100) {
      console.log(chalk.yellow('- Consider enabling compression for file operations'))
    }
    
    if (finalMemory.heapUsed > 500) {
      console.log(chalk.yellow('- Consider implementing memory optimization strategies'))
    }
    
  } catch (error) {
    spinner.fail(`Benchmark failed: ${error.message}`)
    console.error(error)
    process.exit(1)
  }
}

// Run benchmark if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export default main 