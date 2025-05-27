#!/usr/bin/env node

/**
 * Add Proxy Script
 * 
 * Utility script to add proxies to the proxy manager
 * Usage: node scripts/add_proxy.js <proxy_url>
 * 
 * Examples:
 * node scripts/add_proxy.js http://proxy.example.com:8080
 * node scripts/add_proxy.js http://user:pass@proxy.example.com:8080
 * node scripts/add_proxy.js socks5://proxy.example.com:1080
 */

import ProxyManager from '../src/core/proxy_manager.js'
import logger from '../src/core/logger.js'

async function addProxy(proxyUrl) {
  const proxyManager = new ProxyManager()
  
  try {
    // Initialize proxy manager
    await proxyManager.initialize()
    
    // Add the proxy
    await proxyManager.addProxies([proxyUrl])
    
    // Test the proxy
    logger.info('Testing proxy health...')
    const isHealthy = await proxyManager.testProxyHealth(proxyUrl)
    
    if (isHealthy) {
      logger.info('✅ Proxy added successfully and is healthy', { proxy: proxyUrl })
    } else {
      logger.warn('⚠️ Proxy added but health check failed', { proxy: proxyUrl })
    }
    
    // Show current proxy stats
    const stats = await proxyManager.getStats()
    logger.info('Current proxy stats:', stats)
    
  } catch (error) {
    logger.error('❌ Failed to add proxy:', error)
  } finally {
    await proxyManager.cleanup()
  }
}

// Get proxy URL from command line arguments
const proxyUrl = process.argv[2]

if (!proxyUrl) {
  console.log('Usage: node scripts/add_proxy.js <proxy_url>')
  console.log('')
  console.log('Examples:')
  console.log('  node scripts/add_proxy.js http://proxy.example.com:8080')
  console.log('  node scripts/add_proxy.js http://user:pass@proxy.example.com:8080')
  console.log('  node scripts/add_proxy.js socks5://proxy.example.com:1080')
  process.exit(1)
}

// Add the proxy
addProxy(proxyUrl)
  .then(() => {
    console.log('Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Error:', error.message)
    process.exit(1)
  }) 