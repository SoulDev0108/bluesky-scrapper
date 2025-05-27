/**
 * Checkpoint Manager
 * 
 * Handles saving and restoring scraper state for resume functionality.
 * Provides crash recovery and progress tracking capabilities.
 */

import fs from 'fs-extra'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import winston from 'winston'
import moment from 'moment'

import SETTINGS from '../config/settings.js'

class CheckpointManager {
  constructor(scraperType, options = {}) {
    this.scraperType = scraperType || 'unknown_scraper'
    this.sessionId = options.sessionId || uuidv4()
    
    // Ensure we have a valid base directory - handle all possible undefined cases
    let baseDir = './data' // Default fallback
    
    try {
      if (SETTINGS && typeof SETTINGS === 'object' && SETTINGS.OUTPUT && typeof SETTINGS.OUTPUT.DIR === 'string') {
        baseDir = SETTINGS.OUTPUT.DIR
      }
    } catch (error) {
      console.warn('Error accessing SETTINGS.OUTPUT.DIR, using default:', error.message)
    }
    
    this.checkpointDir = path.join(baseDir, 'checkpoints', scraperType)
    this.currentCheckpoint = null
    this.checkpointCounter = 0
    this.lastCheckpointTime = null
    
    // Ensure checkpoint directory exists
    fs.ensureDirSync(this.checkpointDir)

    // Setup logger with safe settings access
    let logLevel = 'info'
    let logFile = './data/logs/checkpoint_manager.log'
    let consoleLog = true
    
    try {
      if (SETTINGS && SETTINGS.LOGGING) {
        logLevel = SETTINGS.LOGGING.LEVEL || 'info'
        logFile = (SETTINGS.LOGGING.FILE || './data/logs/scraper.log').replace('scraper.log', 'checkpoint_manager.log')
        consoleLog = SETTINGS.LOGGING.CONSOLE_LOG !== false
      }
    } catch (error) {
      console.warn('Error accessing SETTINGS.LOGGING, using defaults:', error.message)
    }
    
    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: logFile })
      ]
    })

    if (consoleLog) {
      this.logger.add(new winston.transports.Console({
        format: winston.format.simple()
      }))
    }

    let autoCheckpoint = true
    try {
      if (SETTINGS && SETTINGS.CHECKPOINT) {
        autoCheckpoint = SETTINGS.CHECKPOINT.AUTO_CHECKPOINT !== false
      }
    } catch (error) {
      console.warn('Error accessing SETTINGS.CHECKPOINT, using default:', error.message)
    }
    
    this.logger.info('Checkpoint Manager initialized', {
      scraperType,
      sessionId: this.sessionId,
      checkpointDir: this.checkpointDir,
      autoCheckpoint
    })
  }

  /**
   * Create a new checkpoint with current state
   */
  async createCheckpoint(state, metadata = {}) {
    let autoCheckpoint = true
    try {
      if (SETTINGS && SETTINGS.CHECKPOINT) {
        autoCheckpoint = SETTINGS.CHECKPOINT.AUTO_CHECKPOINT !== false
      }
    } catch (error) {
      // Use default
    }
    
    if (!autoCheckpoint) {
      return null
    }

    try {
      this.checkpointCounter++
      const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss')
      const checkpointId = `${this.scraperType}_${this.sessionId}_${timestamp}_${this.checkpointCounter}`
      
      const checkpoint = {
        id: checkpointId,
        scraperType: this.scraperType,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        counter: this.checkpointCounter,
        state,
        metadata: {
          version: '1.0.0',
          nodeVersion: process.version,
          platform: process.platform,
          ...metadata
        }
      }

      const checkpointPath = path.join(this.checkpointDir, `${checkpointId}.json`)
      
      // Write checkpoint to file
      await fs.writeJson(checkpointPath, checkpoint, { spaces: 2 })
      
      // Update current checkpoint reference
      this.currentCheckpoint = checkpoint
      this.lastCheckpointTime = Date.now()

      // Create backup if enabled
      let backupCheckpoints = false
      try {
        if (SETTINGS && SETTINGS.CHECKPOINT) {
          backupCheckpoints = SETTINGS.CHECKPOINT.BACKUP_CHECKPOINTS === true
        }
      } catch (error) {
        // Use default
      }
      
      if (backupCheckpoints) {
        await this.createBackup(checkpointPath)
      }

      // Clean up old checkpoints
      await this.cleanupOldCheckpoints()

      this.logger.info('Checkpoint created', {
        checkpointId,
        counter: this.checkpointCounter,
        stateSize: JSON.stringify(state).length,
        filePath: checkpointPath
      })

      return checkpointId

    } catch (error) {
      this.logger.error('Failed to create checkpoint', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * Load the most recent checkpoint for this scraper type
   */
  async loadLatestCheckpoint() {
    try {
      const checkpoints = await this.listCheckpoints()
      
      if (checkpoints.length === 0) {
        this.logger.info('No checkpoints found')
        return null
      }

      // Sort by timestamp (most recent first)
      checkpoints.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      
      const latestCheckpoint = checkpoints[0]
      
      // Check if checkpoint is too old
      let maxCheckpointAge = 86400000 // 24 hours default
      try {
        if (SETTINGS && SETTINGS.CHECKPOINT && SETTINGS.CHECKPOINT.MAX_CHECKPOINT_AGE) {
          maxCheckpointAge = SETTINGS.CHECKPOINT.MAX_CHECKPOINT_AGE
        }
      } catch (error) {
        // Use default
      }
      
      const checkpointAge = Date.now() - new Date(latestCheckpoint.timestamp).getTime()
      if (checkpointAge > maxCheckpointAge) {
        this.logger.warn('Latest checkpoint is too old, ignoring', {
          checkpointId: latestCheckpoint.id,
          age: Math.round(checkpointAge / 1000 / 60) + ' minutes'
        })
        return null
      }

      this.currentCheckpoint = latestCheckpoint
      
      this.logger.info('Loaded latest checkpoint', {
        checkpointId: latestCheckpoint.id,
        timestamp: latestCheckpoint.timestamp,
        counter: latestCheckpoint.counter
      })

      return latestCheckpoint

    } catch (error) {
      this.logger.error('Failed to load latest checkpoint', {
        error: error.message,
        stack: error.stack
      })
      return null
    }
  }

  /**
   * Load a specific checkpoint by ID
   */
  async loadCheckpoint(checkpointId) {
    try {
      const checkpointPath = path.join(this.checkpointDir, `${checkpointId}.json`)
      
      if (!await fs.pathExists(checkpointPath)) {
        this.logger.warn('Checkpoint file not found', { checkpointId, checkpointPath })
        return null
      }

      const checkpoint = await fs.readJson(checkpointPath)
      this.currentCheckpoint = checkpoint

      this.logger.info('Loaded checkpoint', {
        checkpointId,
        timestamp: checkpoint.timestamp,
        counter: checkpoint.counter
      })

      return checkpoint

    } catch (error) {
      this.logger.error('Failed to load checkpoint', {
        checkpointId,
        error: error.message,
        stack: error.stack
      })
      return null
    }
  }

  /**
   * List all available checkpoints for this scraper type
   */
  async listCheckpoints() {
    try {
      const files = await fs.readdir(this.checkpointDir)
      const checkpointFiles = files.filter(file => 
        file.startsWith(this.scraperType) && file.endsWith('.json')
      )

      const checkpoints = []
      
      for (const file of checkpointFiles) {
        try {
          const filePath = path.join(this.checkpointDir, file)
          const checkpoint = await fs.readJson(filePath)
          checkpoints.push(checkpoint)
        } catch (error) {
          this.logger.warn('Failed to read checkpoint file', {
            file,
            error: error.message
          })
        }
      }

      return checkpoints

    } catch (error) {
      this.logger.error('Failed to list checkpoints', {
        error: error.message,
        stack: error.stack
      })
      return []
    }
  }

  /**
   * Delete a specific checkpoint
   */
  async deleteCheckpoint(checkpointId) {
    try {
      const checkpointPath = path.join(this.checkpointDir, `${checkpointId}.json`)
      
      if (await fs.pathExists(checkpointPath)) {
        await fs.remove(checkpointPath)
        
        // Also remove backup if it exists
        const backupPath = checkpointPath + '.backup'
        if (await fs.pathExists(backupPath)) {
          await fs.remove(backupPath)
        }

        this.logger.info('Checkpoint deleted', { checkpointId })
        return true
      }

      return false

    } catch (error) {
      this.logger.error('Failed to delete checkpoint', {
        checkpointId,
        error: error.message,
        stack: error.stack
      })
      return false
    }
  }

  /**
   * Create backup of checkpoint file
   */
  async createBackup(checkpointPath) {
    try {
      const backupPath = checkpointPath + '.backup'
      await fs.copy(checkpointPath, backupPath)
      
      this.logger.debug('Checkpoint backup created', {
        originalPath: checkpointPath,
        backupPath
      })

    } catch (error) {
      this.logger.warn('Failed to create checkpoint backup', {
        checkpointPath,
        error: error.message
      })
    }
  }

  /**
   * Clean up old checkpoints to save disk space
   */
  async cleanupOldCheckpoints() {
    try {
      const checkpoints = await this.listCheckpoints()
      
      // Keep only the most recent checkpoints based on frequency setting
      const maxCheckpoints = SETTINGS.CHECKPOINT.CHECKPOINT_FREQUENCY * 2
      
      if (checkpoints.length <= maxCheckpoints) {
        return
      }

      // Sort by timestamp (oldest first)
      checkpoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      
      // Delete oldest checkpoints
      const checkpointsToDelete = checkpoints.slice(0, checkpoints.length - maxCheckpoints)
      
      for (const checkpoint of checkpointsToDelete) {
        await this.deleteCheckpoint(checkpoint.id)
      }

      this.logger.info('Cleaned up old checkpoints', {
        deletedCount: checkpointsToDelete.length,
        remainingCount: maxCheckpoints
      })

    } catch (error) {
      this.logger.error('Failed to cleanup old checkpoints', {
        error: error.message,
        stack: error.stack
      })
    }
  }

  /**
   * Check if it's time to create a new checkpoint
   */
  shouldCreateCheckpoint(itemsProcessed = 0) {
    if (!SETTINGS.CHECKPOINT.AUTO_CHECKPOINT) {
      return false
    }

    // Check if enough items have been processed
    if (itemsProcessed > 0 && itemsProcessed % SETTINGS.OUTPUT.CHECKPOINT_INTERVAL === 0) {
      return true
    }

    // Check if enough time has passed
    if (this.lastCheckpointTime) {
      const timeSinceLastCheckpoint = Date.now() - this.lastCheckpointTime
      const checkpointInterval = SETTINGS.CHECKPOINT.CHECKPOINT_FREQUENCY * 60 * 1000 // Convert to milliseconds
      
      if (timeSinceLastCheckpoint >= checkpointInterval) {
        return true
      }
    } else {
      // No previous checkpoint, create one
      return true
    }

    return false
  }

  /**
   * Get checkpoint statistics
   */
  getStats() {
    return {
      scraperType: this.scraperType,
      sessionId: this.sessionId,
      currentCheckpoint: this.currentCheckpoint ? {
        id: this.currentCheckpoint.id,
        timestamp: this.currentCheckpoint.timestamp,
        counter: this.currentCheckpoint.counter
      } : null,
      checkpointCounter: this.checkpointCounter,
      lastCheckpointTime: this.lastCheckpointTime,
      timeSinceLastCheckpoint: this.lastCheckpointTime 
        ? Date.now() - this.lastCheckpointTime 
        : null
    }
  }

  /**
   * Export checkpoint data for external backup
   */
  async exportCheckpoints(outputPath) {
    try {
      const checkpoints = await this.listCheckpoints()
      
      const exportData = {
        scraperType: this.scraperType,
        exportTimestamp: new Date().toISOString(),
        checkpointCount: checkpoints.length,
        checkpoints
      }

      await fs.writeJson(outputPath, exportData, { spaces: 2 })
      
      this.logger.info('Checkpoints exported', {
        outputPath,
        checkpointCount: checkpoints.length
      })

      return true

    } catch (error) {
      this.logger.error('Failed to export checkpoints', {
        outputPath,
        error: error.message,
        stack: error.stack
      })
      return false
    }
  }

  /**
   * Import checkpoint data from external backup
   */
  async importCheckpoints(inputPath) {
    try {
      const importData = await fs.readJson(inputPath)
      
      if (importData.scraperType !== this.scraperType) {
        throw new Error(`Scraper type mismatch: expected ${this.scraperType}, got ${importData.scraperType}`)
      }

      let importedCount = 0
      
      for (const checkpoint of importData.checkpoints) {
        const checkpointPath = path.join(this.checkpointDir, `${checkpoint.id}.json`)
        
        // Don't overwrite existing checkpoints
        if (!await fs.pathExists(checkpointPath)) {
          await fs.writeJson(checkpointPath, checkpoint, { spaces: 2 })
          importedCount++
        }
      }

      this.logger.info('Checkpoints imported', {
        inputPath,
        totalCheckpoints: importData.checkpoints.length,
        importedCount
      })

      return importedCount

    } catch (error) {
      this.logger.error('Failed to import checkpoints', {
        inputPath,
        error: error.message,
        stack: error.stack
      })
      return 0
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.logger.info('Checkpoint Manager cleanup completed')
  }
}

export default CheckpointManager 