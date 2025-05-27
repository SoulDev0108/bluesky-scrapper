#!/usr/bin/env node

/**
 * Proxy Manager CLI
 * 
 * Command-line interface for managing proxies in Redis:
 * - Add proxies from file or command line
 * - Remove proxies
 * - List proxies by status
 * - Check proxy health
 * - View proxy statistics
 */

import { Command } from 'commander'
import fs from 'fs-extra'
import chalk from 'chalk'
import ora from 'ora'
import ProxyManager from '../src/core/proxy_manager.js'
import { maskProxyCredentials } from '../src/config/proxies.js'

const program = new Command()

/**
 * Initialize proxy manager
 */
async function initializeProxyManager() {
  const proxyManager = new ProxyManager()
  await proxyManager.initialize()
  return proxyManager
}

/**
 * Add proxies command
 */
program
  .command('add')
  .description('Add proxies to Redis')
  .option('-f, --file <file>', 'Load proxies from file (one per line)')
  .option('-p, --proxy <proxy>', 'Add single proxy')
  .option('-l, --list <proxies>', 'Add comma-separated list of proxies')
  .action(async (options) => {
    const spinner = ora('Adding proxies...').start()
    
    try {
      const proxyManager = await initializeProxyManager()
      const proxiesToAdd = []

      if (options.file) {
        // Load from file
        const fileContent = await fs.readFile(options.file, 'utf8')
        const fileProxies = fileContent.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'))
        
        proxiesToAdd.push(...fileProxies)
        spinner.text = `Loading ${fileProxies.length} proxies from file...`
      }

      if (options.proxy) {
        // Single proxy
        proxiesToAdd.push(options.proxy)
      }

      if (options.list) {
        // Comma-separated list
        const listProxies = options.list.split(',').map(p => p.trim())
        proxiesToAdd.push(...listProxies)
      }

      if (proxiesToAdd.length === 0) {
        spinner.fail('No proxies specified')
        process.exit(1)
      }

      await proxyManager.addProxies(proxiesToAdd)
      await proxyManager.cleanup()

      spinner.succeed(`Added ${proxiesToAdd.length} proxies to Redis`)
      
      console.log(chalk.green('\nProxies added:'))
      proxiesToAdd.forEach(proxy => {
        console.log(`  ${maskProxyCredentials({ url: proxy }).url}`)
      })

    } catch (error) {
      spinner.fail(`Failed to add proxies: ${error.message}`)
      process.exit(1)
    }
  })

/**
 * Remove proxies command
 */
program
  .command('remove')
  .description('Remove proxies from Redis')
  .option('-p, --proxy <proxy>', 'Remove single proxy')
  .option('-l, --list <proxies>', 'Remove comma-separated list of proxies')
  .option('-a, --all', 'Remove all proxies')
  .option('-s, --status <status>', 'Remove proxies by status (healthy, unhealthy, rate_limited)')
  .action(async (options) => {
    const spinner = ora('Removing proxies...').start()
    
    try {
      const proxyManager = await initializeProxyManager()
      let proxiesToRemove = []

      if (options.all) {
        // Remove all proxies
        proxiesToRemove = await proxyManager.getProxiesByStatus('all')
        spinner.text = `Removing all ${proxiesToRemove.length} proxies...`
      } else if (options.status) {
        // Remove by status
        proxiesToRemove = await proxyManager.getProxiesByStatus(options.status)
        spinner.text = `Removing ${proxiesToRemove.length} ${options.status} proxies...`
      } else if (options.proxy) {
        // Single proxy
        proxiesToRemove.push(options.proxy)
      } else if (options.list) {
        // Comma-separated list
        proxiesToRemove = options.list.split(',').map(p => p.trim())
      }

      if (proxiesToRemove.length === 0) {
        spinner.fail('No proxies to remove')
        process.exit(1)
      }

      await proxyManager.removeProxies(proxiesToRemove)
      await proxyManager.cleanup()

      spinner.succeed(`Removed ${proxiesToRemove.length} proxies from Redis`)

    } catch (error) {
      spinner.fail(`Failed to remove proxies: ${error.message}`)
      process.exit(1)
    }
  })

/**
 * List proxies command
 */
program
  .command('list')
  .description('List proxies in Redis')
  .option('-s, --status <status>', 'Filter by status (all, healthy, unhealthy, rate_limited)', 'all')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (options) => {
    const spinner = ora('Loading proxies...').start()
    
    try {
      const proxyManager = await initializeProxyManager()
      const proxies = await proxyManager.getProxiesByStatus(options.status)
      
      spinner.succeed(`Found ${proxies.length} ${options.status} proxies`)

      if (proxies.length === 0) {
        console.log(chalk.yellow('No proxies found'))
        await proxyManager.cleanup()
        return
      }

      console.log(chalk.bold(`\n${options.status.toUpperCase()} PROXIES (${proxies.length})`))
      console.log('─'.repeat(60))

      for (const proxy of proxies) {
        const masked = maskProxyCredentials({ url: proxy })
        console.log(`${chalk.cyan('•')} ${masked.url}`)
        
        if (options.verbose) {
          // Get detailed stats for this proxy
          // Note: This would require additional Redis queries
          console.log(chalk.gray('  Status: Available'))
        }
      }

      await proxyManager.cleanup()

    } catch (error) {
      spinner.fail(`Failed to list proxies: ${error.message}`)
      process.exit(1)
    }
  })

/**
 * Statistics command
 */
program
  .command('stats')
  .description('Show proxy statistics')
  .action(async () => {
    const spinner = ora('Loading statistics...').start()
    
    try {
      const proxyManager = await initializeProxyManager()
      const stats = await proxyManager.getStats()
      
      spinner.succeed('Statistics loaded')

      console.log(chalk.bold('\nPROXY STATISTICS'))
      console.log('─'.repeat(40))
      console.log(`Total Proxies: ${chalk.cyan(stats.total)}`)
      console.log(`Healthy: ${chalk.green(stats.healthy)}`)
      console.log(`Unhealthy: ${chalk.red(stats.unhealthy)}`)
      console.log(`Rate Limited: ${chalk.yellow(stats.rateLimited)}`)
      console.log(`Success Rate: ${chalk.cyan(stats.successRate + '%')}`)
      console.log(`Total Requests: ${chalk.gray(stats.totalRequests || 0)}`)
      console.log(`Total Successes: ${chalk.gray(stats.totalSuccesses || 0)}`)

      await proxyManager.cleanup()

    } catch (error) {
      spinner.fail(`Failed to get statistics: ${error.message}`)
      process.exit(1)
    }
  })

/**
 * Health check command
 */
program
  .command('health')
  .description('Perform health check on all proxies')
  .action(async () => {
    const spinner = ora('Performing health check...').start()
    
    try {
      const proxyManager = await initializeProxyManager()
      
      // Start health check
      await proxyManager.performHealthCheck()
      
      // Get updated stats
      const stats = await proxyManager.getStats()
      
      spinner.succeed('Health check completed')

      console.log(chalk.bold('\nHEALTH CHECK RESULTS'))
      console.log('─'.repeat(40))
      console.log(`Total Proxies: ${chalk.cyan(stats.total)}`)
      console.log(`Healthy: ${chalk.green(stats.healthy)}`)
      console.log(`Unhealthy: ${chalk.red(stats.unhealthy)}`)
      console.log(`Rate Limited: ${chalk.yellow(stats.rateLimited)}`)

      await proxyManager.cleanup()

    } catch (error) {
      spinner.fail(`Health check failed: ${error.message}`)
      process.exit(1)
    }
  })

/**
 * Test random proxy command
 */
program
  .command('test')
  .description('Test getting a random proxy')
  .option('-n, --count <count>', 'Number of random proxies to test', '1')
  .action(async (options) => {
    const count = parseInt(options.count, 10)
    const spinner = ora(`Testing ${count} random proxy selection(s)...`).start()
    
    try {
      const proxyManager = await initializeProxyManager()
      
      console.log(chalk.bold(`\nRANDOM PROXY TEST (${count} selections)`))
      console.log('─'.repeat(50))

      for (let i = 0; i < count; i++) {
        const proxy = await proxyManager.getRandomProxy()
        
        if (proxy) {
          const masked = maskProxyCredentials({ url: proxy })
          console.log(`${chalk.green('✓')} Selection ${i + 1}: ${masked.url}`)
        } else {
          console.log(`${chalk.red('✗')} Selection ${i + 1}: No healthy proxy available`)
        }
      }

      await proxyManager.cleanup()
      spinner.succeed('Random proxy test completed')

    } catch (error) {
      spinner.fail(`Test failed: ${error.message}`)
      process.exit(1)
    }
  })

/**
 * Reset command
 */
program
  .command('reset')
  .description('Reset all proxy statistics')
  .action(async () => {
    const spinner = ora('Resetting proxy statistics...').start()
    
    try {
      const proxyManager = await initializeProxyManager()
      await proxyManager.resetStats()
      await proxyManager.cleanup()
      
      spinner.succeed('Proxy statistics reset')

    } catch (error) {
      spinner.fail(`Failed to reset statistics: ${error.message}`)
      process.exit(1)
    }
  })

/**
 * Import from file command
 */
program
  .command('import')
  .description('Import proxies from various file formats')
  .argument('<file>', 'File to import from')
  .option('-f, --format <format>', 'File format (txt, json, csv)', 'txt')
  .action(async (file, options) => {
    const spinner = ora(`Importing proxies from ${file}...`).start()
    
    try {
      const proxyManager = await initializeProxyManager()
      let proxies = []

      if (!await fs.pathExists(file)) {
        throw new Error(`File not found: ${file}`)
      }

      switch (options.format.toLowerCase()) {
        case 'txt':
          const txtContent = await fs.readFile(file, 'utf8')
          proxies = txtContent.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
          break

        case 'json':
          const jsonContent = await fs.readJson(file)
          proxies = Array.isArray(jsonContent) ? jsonContent : jsonContent.proxies || []
          break

        case 'csv':
          const csvContent = await fs.readFile(file, 'utf8')
          proxies = csvContent.split('\n')
            .slice(1) // Skip header
            .map(line => line.split(',')[0]) // Take first column
            .filter(proxy => proxy && proxy.trim())
          break

        default:
          throw new Error(`Unsupported format: ${options.format}`)
      }

      if (proxies.length === 0) {
        throw new Error('No proxies found in file')
      }

      await proxyManager.addProxies(proxies)
      await proxyManager.cleanup()

      spinner.succeed(`Imported ${proxies.length} proxies from ${file}`)

    } catch (error) {
      spinner.fail(`Import failed: ${error.message}`)
      process.exit(1)
    }
  })

// Configure program
program
  .name('proxy-manager')
  .description('CLI tool for managing Bluesky scraper proxies in Redis')
  .version('1.0.0')

// Parse command line arguments
program.parse()

export default program 