#!/usr/bin/env node

/**
 * Proxy Management Script
 * 
 * Utility script to manage proxies in the proxy manager
 * Usage: node scripts/manage_proxies.js <command> [options]
 * 
 * Commands:
 *   list                    - List all proxies
 *   test <proxy_url>        - Test a specific proxy
 *   test-all               - Test all proxies
 *   remove <proxy_url>     - Remove a specific proxy
 *   stats                  - Show proxy statistics
 *   health-check           - Run health check on all proxies
 */

import { Command } from 'commander'
import ProxyManager from '../src/core/proxy_manager.js'
import logger from '../src/core/logger.js'

const program = new Command()

program
  .name('manage_proxies')
  .description('Manage proxies for Bluesky scraper')
  .version('1.0.0')

// List all proxies
program
  .command('list')
  .description('List all proxies by status')
  .action(async () => {
    const proxyManager = new ProxyManager()
    
    try {
      await proxyManager.initialize()
      
      const allProxies = await proxyManager.getProxiesByStatus('all')
      const healthyProxies = await proxyManager.getProxiesByStatus('healthy')
      const unhealthyProxies = await proxyManager.getProxiesByStatus('unhealthy')
      const rateLimitedProxies = await proxyManager.getProxiesByStatus('rate_limited')
      
      console.log('\n📋 Proxy Status Report')
      console.log('='.repeat(50))
      console.log(`Total Proxies: ${allProxies.length}`)
      console.log(`✅ Healthy: ${healthyProxies.length}`)
      console.log(`❌ Unhealthy: ${unhealthyProxies.length}`)
      console.log(`⏳ Rate Limited: ${rateLimitedProxies.length}`)
      
      if (healthyProxies.length > 0) {
        console.log('\n✅ Healthy Proxies:')
        healthyProxies.forEach(proxy => console.log(`  - ${proxy}`))
      }
      
      if (unhealthyProxies.length > 0) {
        console.log('\n❌ Unhealthy Proxies:')
        unhealthyProxies.forEach(proxy => console.log(`  - ${proxy}`))
      }
      
      if (rateLimitedProxies.length > 0) {
        console.log('\n⏳ Rate Limited Proxies:')
        rateLimitedProxies.forEach(proxy => console.log(`  - ${proxy}`))
      }
      
    } catch (error) {
      console.error('❌ Error listing proxies:', error.message)
    } finally {
      await proxyManager.cleanup()
    }
  })

// Test a specific proxy
program
  .command('test')
  .description('Test a specific proxy')
  .argument('<proxy_url>', 'Proxy URL to test')
  .action(async (proxyUrl) => {
    const proxyManager = new ProxyManager()
    
    try {
      await proxyManager.initialize()
      
      console.log(`🔍 Testing proxy: ${proxyUrl}`)
      const isHealthy = await proxyManager.testProxyHealth(proxyUrl)
      
      if (isHealthy) {
        console.log('✅ Proxy is healthy and working')
      } else {
        console.log('❌ Proxy failed health check')
      }
      
    } catch (error) {
      console.error('❌ Error testing proxy:', error.message)
    } finally {
      await proxyManager.cleanup()
    }
  })

// Test all proxies
program
  .command('test-all')
  .description('Test all proxies')
  .action(async () => {
    const proxyManager = new ProxyManager()
    
    try {
      await proxyManager.initialize()
      
      console.log('🔍 Testing all proxies...')
      await proxyManager.performHealthCheck()
      
      const stats = await proxyManager.getStats()
      console.log('\n📊 Health Check Results:')
      console.log(`✅ Healthy: ${stats.healthyCount}`)
      console.log(`❌ Unhealthy: ${stats.unhealthyCount}`)
      console.log(`⏳ Rate Limited: ${stats.rateLimitedCount}`)
      
    } catch (error) {
      console.error('❌ Error testing proxies:', error.message)
    } finally {
      await proxyManager.cleanup()
    }
  })

// Remove a proxy
program
  .command('remove')
  .description('Remove a specific proxy')
  .argument('<proxy_url>', 'Proxy URL to remove')
  .action(async (proxyUrl) => {
    const proxyManager = new ProxyManager()
    
    try {
      await proxyManager.initialize()
      
      console.log(`🗑️ Removing proxy: ${proxyUrl}`)
      await proxyManager.removeProxies([proxyUrl])
      console.log('✅ Proxy removed successfully')
      
    } catch (error) {
      console.error('❌ Error removing proxy:', error.message)
    } finally {
      await proxyManager.cleanup()
    }
  })

// Show statistics
program
  .command('stats')
  .description('Show proxy statistics')
  .action(async () => {
    const proxyManager = new ProxyManager()
    
    try {
      await proxyManager.initialize()
      
      const stats = await proxyManager.getStats()
      
      console.log('\n📊 Proxy Statistics')
      console.log('='.repeat(50))
      console.log(`Total Proxies: ${stats.totalCount}`)
      console.log(`✅ Healthy: ${stats.healthyCount}`)
      console.log(`❌ Unhealthy: ${stats.unhealthyCount}`)
      console.log(`⏳ Rate Limited: ${stats.rateLimitedCount}`)
      console.log(`📈 Success Rate: ${stats.successRate}%`)
      console.log(`⚡ Average Response Time: ${stats.averageResponseTime}ms`)
      
      if (stats.topPerformingProxies && stats.topPerformingProxies.length > 0) {
        console.log('\n🏆 Top Performing Proxies:')
        stats.topPerformingProxies.forEach((proxy, index) => {
          console.log(`  ${index + 1}. ${proxy.url} (${proxy.successRate}% success)`)
        })
      }
      
    } catch (error) {
      console.error('❌ Error getting stats:', error.message)
    } finally {
      await proxyManager.cleanup()
    }
  })

// Run health check
program
  .command('health-check')
  .description('Run health check on all proxies')
  .action(async () => {
    const proxyManager = new ProxyManager()
    
    try {
      await proxyManager.initialize()
      
      console.log('🏥 Running health check on all proxies...')
      await proxyManager.performHealthCheck()
      console.log('✅ Health check completed')
      
      // Show updated stats
      const stats = await proxyManager.getStats()
      console.log('\n📊 Updated Status:')
      console.log(`✅ Healthy: ${stats.healthyCount}`)
      console.log(`❌ Unhealthy: ${stats.unhealthyCount}`)
      console.log(`⏳ Rate Limited: ${stats.rateLimitedCount}`)
      
    } catch (error) {
      console.error('❌ Error running health check:', error.message)
    } finally {
      await proxyManager.cleanup()
    }
  })

program.parse() 