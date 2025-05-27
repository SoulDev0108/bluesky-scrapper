#!/usr/bin/env node

/**
 * Setup Script for Bluesky Scraper
 * 
 * Initializes the project environment:
 * - Creates necessary directories
 * - Validates configuration
 * - Sets up Redis connection
 * - Checks dependencies
 */

import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import chalk from 'chalk'
import ora from 'ora'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.join(__dirname, '..')

/**
 * Required directories for the project
 */
const REQUIRED_DIRECTORIES = [
  'data',
  'data/users',
  'data/posts',
  'data/relationships',
  'data/checkpoints',
  'data/logs',
  'data/metadata',
  'data/exports',
  'data/backups'
]

/**
 * Required configuration files
 */
const REQUIRED_CONFIG_FILES = [
  '.env'
]

/**
 * Create required directories
 */
async function createDirectories() {
  const spinner = ora('Creating required directories...').start()
  
  try {
    for (const dir of REQUIRED_DIRECTORIES) {
      const dirPath = path.join(projectRoot, dir)
      await fs.ensureDir(dirPath)
      
      // Create .gitkeep file to ensure directory is tracked
      const gitkeepPath = path.join(dirPath, '.gitkeep')
      if (!await fs.pathExists(gitkeepPath)) {
        await fs.writeFile(gitkeepPath, '')
      }
    }
    
    spinner.succeed('Directories created successfully')
  } catch (error) {
    spinner.fail(`Failed to create directories: ${error.message}`)
    throw error
  }
}

/**
 * Check and create configuration files
 */
async function setupConfiguration() {
  const spinner = ora('Setting up configuration...').start()
  
  try {
    // Check if .env exists, if not copy from .env.example
    const envPath = path.join(projectRoot, '.env')
    const envExamplePath = path.join(projectRoot, 'env.example')
    
    if (!await fs.pathExists(envPath)) {
      if (await fs.pathExists(envExamplePath)) {
        await fs.copy(envExamplePath, envPath)
        spinner.succeed('Configuration file created from template')
        console.log(chalk.yellow('⚠️  Please edit .env file with your specific configuration'))
      } else {
        spinner.warn('No .env.example found, please create .env manually')
      }
    } else {
      spinner.succeed('Configuration file already exists')
    }
  } catch (error) {
    spinner.fail(`Failed to setup configuration: ${error.message}`)
    throw error
  }
}

/**
 * Validate environment configuration
 */
async function validateConfiguration() {
  const spinner = ora('Validating configuration...').start()
  
  try {
    // Import settings to trigger validation
    const { validateSettings } = await import('../src/config/settings.js')
    
    validateSettings()
    spinner.succeed('Configuration validation passed')
  } catch (error) {
    spinner.fail(`Configuration validation failed: ${error.message}`)
    console.log(chalk.red('Please check your .env file and fix the configuration errors'))
    throw error
  }
}

/**
 * Test Redis connection
 */
async function testRedisConnection() {
  const spinner = ora('Testing Redis connection...').start()
  
  try {
    const redis = await import('redis')
    const SETTINGS = (await import('../src/config/settings.js')).default
    
    const client = redis.createClient({
      url: SETTINGS.REDIS.URL,
      password: SETTINGS.REDIS.PASSWORD
    })
    
    await client.connect()
    await client.ping()
    await client.quit()
    
    spinner.succeed('Redis connection successful')
  } catch (error) {
    spinner.warn(`Redis connection failed: ${error.message}`)
    console.log(chalk.yellow('Redis is optional but recommended for deduplication'))
    console.log(chalk.yellow('You can start Redis using: docker-compose up -d redis'))
  }
}

/**
 * Check if all required dependencies are installed
 */
async function checkDependencies() {
  const spinner = ora('Checking dependencies...').start()
  
  try {
    const packageJsonPath = path.join(projectRoot, 'package.json')
    const packageJson = await fs.readJson(packageJsonPath)
    
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    }
    
    const missingDeps = []
    
    for (const dep of Object.keys(dependencies)) {
      try {
        await import(dep)
      } catch (error) {
        missingDeps.push(dep)
      }
    }
    
    if (missingDeps.length > 0) {
      spinner.fail(`Missing dependencies: ${missingDeps.join(', ')}`)
      console.log(chalk.red('Please run: npm install'))
      throw new Error('Missing dependencies')
    }
    
    spinner.succeed('All dependencies are installed')
  } catch (error) {
    if (error.message !== 'Missing dependencies') {
      spinner.fail(`Failed to check dependencies: ${error.message}`)
    }
    throw error
  }
}

/**
 * Create sample configuration files
 */
async function createSampleConfigs() {
  const spinner = ora('Creating sample configuration files...').start()
  
  try {
    // Create Redis configuration
    const redisConfigPath = path.join(projectRoot, 'config', 'redis.conf')
    await fs.ensureDir(path.dirname(redisConfigPath))
    
    if (!await fs.pathExists(redisConfigPath)) {
      const redisConfig = `# Redis configuration for Bluesky Scraper
save 900 1
save 300 10
save 60 10000
maxmemory 256mb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
`
      await fs.writeFile(redisConfigPath, redisConfig)
    }
    
    // Create Prometheus configuration
    const prometheusConfigPath = path.join(projectRoot, 'config', 'prometheus.yml')
    if (!await fs.pathExists(prometheusConfigPath)) {
      const prometheusConfig = `global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'bluesky-scraper'
    static_configs:
      - targets: ['scraper-metrics:3001']
`
      await fs.writeFile(prometheusConfigPath, prometheusConfig)
    }
    
    spinner.succeed('Sample configuration files created')
  } catch (error) {
    spinner.fail(`Failed to create sample configs: ${error.message}`)
    throw error
  }
}

/**
 * Display setup completion message
 */
function displayCompletionMessage() {
  console.log('\n' + chalk.green('✅ Setup completed successfully!'))
  console.log('\n' + chalk.bold('Next steps:'))
  console.log('1. Edit .env file with your configuration')
  console.log('2. Start Redis: ' + chalk.cyan('docker-compose up -d redis'))
  console.log('3. Run tests: ' + chalk.cyan('npm test'))
  console.log('4. Start scraping: ' + chalk.cyan('npm run scrape:users'))
  console.log('\n' + chalk.bold('Available commands:'))
  console.log('- ' + chalk.cyan('npm run scrape:users') + ' - Scrape users')
  console.log('- ' + chalk.cyan('npm run scrape:posts') + ' - Scrape posts')
  console.log('- ' + chalk.cyan('npm run scrape:followers') + ' - Scrape relationships')
  console.log('- ' + chalk.cyan('npm run scrape:user-info -- --url "https://bsky.app/profile/username"') + ' - Scrape single user')
  console.log('- ' + chalk.cyan('npm run scrape:post-info -- --url "https://bsky.app/profile/username/post/abc123"') + ' - Scrape single post')
  console.log('\n' + chalk.bold('Documentation:'))
  console.log('- README.md - Project overview and usage')
  console.log('- .env.example - Configuration options')
  console.log('- docker-compose.yml - Infrastructure setup')
}

/**
 * Main setup function
 */
async function main() {
  console.log(chalk.bold.blue('🚀 Bluesky Scraper Setup'))
  console.log('Initializing project environment...\n')
  
  try {
    await createDirectories()
    await setupConfiguration()
    await validateConfiguration()
    await createSampleConfigs()
    await checkDependencies()
    await testRedisConnection()
    
    displayCompletionMessage()
    
  } catch (error) {
    console.error('\n' + chalk.red('❌ Setup failed:'), error.message)
    console.log('\n' + chalk.yellow('Please fix the errors above and run setup again'))
    process.exit(1)
  }
}

// Run setup if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export default main 