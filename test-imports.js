#!/usr/bin/env node

/**
 * Test script to verify all ES module imports are working
 */

console.log('Testing ES module imports...')

async function testImports() {
  try {
    console.log('✓ Testing bloom-filters import...')
    const bloomPkg = await import('bloom-filters')
    const { BloomFilter } = bloomPkg.default
    console.log('✅ bloom-filters OK')

    console.log('✓ Testing uuid import...')
    const { v4 as uuidv4 } = await import('uuid')
    console.log('✅ uuid OK')

    console.log('✓ Testing winston import...')
    const winston = await import('winston')
    console.log('✅ winston OK')

    console.log('✓ Testing winston-daily-rotate-file import...')
    await import('winston-daily-rotate-file')
    console.log('✅ winston-daily-rotate-file OK')

    console.log('✓ Testing core components...')
    await import('./src/core/logger.js')
    console.log('✅ logger OK')

    await import('./src/utils/deduplicator.js')
    console.log('✅ deduplicator OK')

    await import('./src/core/checkpoint_manager.js')
    console.log('✅ checkpoint_manager OK')

    console.log('✓ Testing main entry point...')
    await import('./src/index.js')
    console.log('✅ main index OK')

    console.log('🎉 All imports working correctly!')
    console.log('✅ ES modules conversion successful!')
    
  } catch (error) {
    console.error('❌ Import error:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

testImports() 