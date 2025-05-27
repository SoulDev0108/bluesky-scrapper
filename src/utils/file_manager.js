import fs from 'fs/promises'
import path from 'path'
import zlib from 'zlib'
import { promisify } from 'util'
import logger from '../core/logger.js'
import settings from '../config/settings.js'

const gzip = promisify(zlib.gzip)
const gunzip = promisify(zlib.gunzip)

/**
 * File manager for organized data storage
 * Handles JSON files with metadata, compression, and rotation
 */
class FileManager {
    constructor() {
        this.baseDir = settings.OUTPUT?.DIR || './data'
        this.compression = settings.OUTPUT?.COMPRESS_OUTPUT || false
        this.maxFileSize = (settings.OUTPUT?.MAX_FILE_SIZE_MB || 50) * 1024 * 1024 // Convert MB to bytes
        this.maxFilesPerDir = 1000 // Default value
        
        this.stats = {
            filesCreated: 0,
            bytesWritten: 0,
            compressionRatio: 0
        }
    }

    /**
     * Initialize file manager and create directory structure
     */
    async initialize() {
        try {
            await this.ensureDirectories()
            logger.info('File manager initialized successfully')
        } catch (error) {
            logger.error('Failed to initialize file manager:', error)
            throw error
        }
    }

    /**
     * Ensure all required directories exist
     */
    async ensureDirectories() {
        const dirs = [
            'users',
            'posts', 
            'relationships',
            'checkpoints',
            'logs',
            'metadata'
        ]

        for (const dir of dirs) {
            const fullPath = path.join(this.baseDir, dir)
            await fs.mkdir(fullPath, { recursive: true })
        }
    }

    /**
     * Save users data to file
     * @param {Array} users - Array of user objects
     * @param {Object} metadata - Metadata about the scraping session
     * @returns {string} File path where data was saved
     */
    async saveUsers(users, metadata = {}) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `users_${timestamp}.json`
        const filePath = await this.getFilePath('users', filename)
        
        const data = {
            metadata: {
                type: 'users',
                count: users.length,
                timestamp: new Date().toISOString(),
                scraper: metadata.scraper || 'unknown',
                version: metadata.version || '1.0.0',
                ...metadata
            },
            data: users
        }

        await this.writeJsonFile(filePath, data)
        logger.info(`Saved ${users.length} users to ${filePath}`)
        
        return filePath
    }

    /**
     * Save posts data to file
     * @param {Array} posts - Array of post objects
     * @param {Object} metadata - Metadata about the scraping session
     * @returns {string} File path where data was saved
     */
    async savePosts(posts, metadata = {}) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `posts_${timestamp}.json`
        const filePath = await this.getFilePath('posts', filename)
        
        const data = {
            metadata: {
                type: 'posts',
                count: posts.length,
                timestamp: new Date().toISOString(),
                scraper: metadata.scraper || 'unknown',
                version: metadata.version || '1.0.0',
                ...metadata
            },
            data: posts
        }

        await this.writeJsonFile(filePath, data)
        logger.info(`Saved ${posts.length} posts to ${filePath}`)
        
        return filePath
    }

    /**
     * Save relationships data to file
     * @param {Array} relationships - Array of relationship objects
     * @param {Object} metadata - Metadata about the scraping session
     * @returns {string} File path where data was saved
     */
    async saveRelationships(relationships, metadata = {}) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `relationships_${timestamp}.json`
        const filePath = await this.getFilePath('relationships', filename)
        
        const data = {
            metadata: {
                type: 'relationships',
                count: relationships.length,
                timestamp: new Date().toISOString(),
                scraper: metadata.scraper || 'unknown',
                version: metadata.version || '1.0.0',
                ...metadata
            },
            data: relationships
        }

        await this.writeJsonFile(filePath, data)
        logger.info(`Saved ${relationships.length} relationships to ${filePath}`)
        
        return filePath
    }

    /**
     * Append data to existing file or create new one
     * @param {string} type - Data type ('users', 'posts', 'relationships')
     * @param {Array} data - Data to append
     * @param {Object} metadata - Metadata
     * @returns {string} File path
     */
    async appendData(type, data, metadata = {}) {
        const latestFile = await this.getLatestFile(type)
        
        if (latestFile && await this.canAppendToFile(latestFile, data)) {
            return await this.appendToFile(latestFile, data, metadata)
        } else {
            // Create new file
            switch (type) {
                case 'users':
                    return await this.saveUsers(data, metadata)
                case 'posts':
                    return await this.savePosts(data, metadata)
                case 'relationships':
                    return await this.saveRelationships(data, metadata)
                default:
                    throw new Error(`Unknown data type: ${type}`)
            }
        }
    }

    /**
     * Load data from file
     * @param {string} filePath - Path to file
     * @returns {Object} Loaded data with metadata
     */
    async loadData(filePath) {
        try {
            const data = await this.readJsonFile(filePath)
            logger.debug(`Loaded data from ${filePath}`)
            return data
        } catch (error) {
            logger.error(`Failed to load data from ${filePath}:`, error)
            throw error
        }
    }

    /**
     * List all files of a specific type
     * @param {string} type - Data type
     * @returns {Array} Array of file paths
     */
    async listFiles(type) {
        const dirPath = path.join(this.baseDir, type)
        
        try {
            const files = await fs.readdir(dirPath)
            return files
                .filter(file => file.endsWith('.json') || file.endsWith('.json.gz'))
                .map(file => path.join(dirPath, file))
                .sort()
        } catch (error) {
            logger.error(`Failed to list files for type ${type}:`, error)
            return []
        }
    }

    /**
     * Get latest file for a data type
     * @param {string} type - Data type
     * @returns {string|null} Latest file path or null
     */
    async getLatestFile(type) {
        const files = await this.listFiles(type)
        return files.length > 0 ? files[files.length - 1] : null
    }

    /**
     * Check if data can be appended to existing file
     * @param {string} filePath - File path
     * @param {Array} newData - Data to append
     * @returns {boolean} True if can append
     */
    async canAppendToFile(filePath, newData) {
        try {
            const stats = await fs.stat(filePath)
            const estimatedNewSize = JSON.stringify(newData).length
            
            return (stats.size + estimatedNewSize) < this.maxFileSize
        } catch (error) {
            return false
        }
    }

    /**
     * Append data to existing file
     * @param {string} filePath - File path
     * @param {Array} newData - Data to append
     * @param {Object} metadata - Metadata
     * @returns {string} File path
     */
    async appendToFile(filePath, newData, metadata) {
        const existingData = await this.loadData(filePath)
        
        // Merge data
        existingData.data = existingData.data.concat(newData)
        existingData.metadata.count = existingData.data.length
        existingData.metadata.lastUpdated = new Date().toISOString()
        existingData.metadata.appendedAt = existingData.metadata.appendedAt || []
        existingData.metadata.appendedAt.push({
            timestamp: new Date().toISOString(),
            itemsAdded: newData.length,
            ...metadata
        })

        await this.writeJsonFile(filePath, existingData)
        logger.info(`Appended ${newData.length} items to ${filePath}`)
        
        return filePath
    }

    /**
     * Get appropriate file path with rotation if needed
     * @param {string} type - Data type
     * @param {string} filename - Filename
     * @returns {string} Full file path
     */
    async getFilePath(type, filename) {
        const dirPath = path.join(this.baseDir, type)
        
        // Check if directory has too many files
        const files = await this.listFiles(type)
        if (files.length >= this.maxFilesPerDir) {
            // Create subdirectory with timestamp
            const subDir = new Date().toISOString().split('T')[0] // YYYY-MM-DD
            const subDirPath = path.join(dirPath, subDir)
            await fs.mkdir(subDirPath, { recursive: true })
            return path.join(subDirPath, filename)
        }
        
        return path.join(dirPath, filename)
    }

    /**
     * Write JSON data to file with optional compression
     * @param {string} filePath - File path
     * @param {Object} data - Data to write
     */
    async writeJsonFile(filePath, data) {
        const jsonString = JSON.stringify(data, null, 2)
        const originalSize = Buffer.byteLength(jsonString, 'utf8')
        
        if (this.compression) {
            const compressed = await gzip(jsonString)
            await fs.writeFile(filePath + '.gz', compressed)
            
            this.stats.compressionRatio = compressed.length / originalSize
            this.stats.bytesWritten += compressed.length
            
            logger.debug(`Compressed ${filePath}: ${originalSize} -> ${compressed.length} bytes (${(this.stats.compressionRatio * 100).toFixed(1)}%)`)
        } else {
            await fs.writeFile(filePath, jsonString, 'utf8')
            this.stats.bytesWritten += originalSize
        }
        
        this.stats.filesCreated++
    }

    /**
     * Read JSON data from file with decompression support
     * @param {string} filePath - File path
     * @returns {Object} Parsed JSON data
     */
    async readJsonFile(filePath) {
        const isCompressed = filePath.endsWith('.gz')
        
        if (isCompressed) {
            const compressed = await fs.readFile(filePath)
            const decompressed = await gunzip(compressed)
            return JSON.parse(decompressed.toString('utf8'))
        } else {
            const content = await fs.readFile(filePath, 'utf8')
            return JSON.parse(content)
        }
    }

    /**
     * Create backup of important files
     * @param {string} type - Data type to backup
     * @returns {string} Backup directory path
     */
    async createBackup(type) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const backupDir = path.join(this.baseDir, 'backups', `${type}_${timestamp}`)
        
        await fs.mkdir(backupDir, { recursive: true })
        
        const files = await this.listFiles(type)
        const recentFiles = files.slice(-10) // Backup last 10 files
        
        for (const file of recentFiles) {
            const filename = path.basename(file)
            const backupPath = path.join(backupDir, filename)
            await fs.copyFile(file, backupPath)
        }
        
        logger.info(`Created backup of ${recentFiles.length} ${type} files in ${backupDir}`)
        return backupDir
    }

    /**
     * Clean up old files based on retention policy
     * @param {string} type - Data type
     * @param {number} retentionDays - Days to retain files
     */
    async cleanupOldFiles(type, retentionDays = 30) {
        const files = await this.listFiles(type)
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
        
        let deletedCount = 0
        
        for (const file of files) {
            try {
                const stats = await fs.stat(file)
                if (stats.mtime < cutoffDate) {
                    await fs.unlink(file)
                    deletedCount++
                    logger.debug(`Deleted old file: ${file}`)
                }
            } catch (error) {
                logger.warn(`Failed to delete file ${file}:`, error.message)
            }
        }
        
        if (deletedCount > 0) {
            logger.info(`Cleaned up ${deletedCount} old ${type} files`)
        }
    }

    /**
     * Get storage statistics
     * @returns {Object} Storage statistics
     */
    async getStats() {
        const types = ['users', 'posts', 'relationships']
        const stats = { ...this.stats }
        
        for (const type of types) {
            const files = await this.listFiles(type)
            let totalSize = 0
            
            for (const file of files) {
                try {
                    const stat = await fs.stat(file)
                    totalSize += stat.size
                } catch (error) {
                    // Ignore errors for individual files
                }
            }
            
            stats[type] = {
                fileCount: files.length,
                totalSize: totalSize,
                totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
            }
        }
        
        return stats
    }

    /**
     * Export data in different formats
     * @param {string} type - Data type
     * @param {string} format - Export format ('json', 'csv', 'ndjson')
     * @param {Object} options - Export options
     * @returns {string} Export file path
     */
    async exportData(type, format = 'json', options = {}) {
        const files = await this.listFiles(type)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const exportPath = path.join(this.baseDir, 'exports', `${type}_export_${timestamp}.${format}`)
        
        await fs.mkdir(path.dirname(exportPath), { recursive: true })
        
        let allData = []
        
        // Load all data
        for (const file of files) {
            const fileData = await this.loadData(file)
            allData = allData.concat(fileData.data)
        }
        
        // Export in requested format
        switch (format) {
            case 'json':
                await fs.writeFile(exportPath, JSON.stringify(allData, null, 2))
                break
            case 'ndjson':
                const ndjsonContent = allData.map(item => JSON.stringify(item)).join('\n')
                await fs.writeFile(exportPath, ndjsonContent)
                break
            case 'csv':
                // Basic CSV export (would need proper CSV library for complex data)
                if (allData.length > 0) {
                    const headers = Object.keys(allData[0])
                    const csvContent = [
                        headers.join(','),
                        ...allData.map(item => headers.map(h => JSON.stringify(item[h] || '')).join(','))
                    ].join('\n')
                    await fs.writeFile(exportPath, csvContent)
                }
                break
            default:
                throw new Error(`Unsupported export format: ${format}`)
        }
        
        logger.info(`Exported ${allData.length} ${type} items to ${exportPath}`)
        return exportPath
    }
}

export default FileManager 