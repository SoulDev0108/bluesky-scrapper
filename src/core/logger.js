import winston from 'winston'
import path from 'path'
import fs from 'fs'
import 'winston-daily-rotate-file'

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'data', 'logs')
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
}

// Custom format for console output
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let metaStr = ''
        if (Object.keys(meta).length > 0) {
            metaStr = ' ' + JSON.stringify(meta)
        }
        return `${timestamp} [${level}]: ${message}${metaStr}`
    })
)

// Custom format for file output
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
)

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: fileFormat,
    defaultMeta: { service: 'bluesky-scraper' },
    transports: [
        // Error log file
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            tailable: true
        }),
        
        // Combined log file
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 10,
            tailable: true
        }),
        
        // Daily rotating file
        new winston.transports.DailyRotateFile({
            filename: path.join(logsDir, 'scraper-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
            zippedArchive: true
        })
    ]
})

// Add console transport for non-production environments
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat
    }))
}

// Add performance logging methods
logger.time = (label) => {
    logger.startTimes = logger.startTimes || {}
    logger.startTimes[label] = Date.now()
}

logger.timeEnd = (label) => {
    if (logger.startTimes && logger.startTimes[label]) {
        const duration = Date.now() - logger.startTimes[label]
        logger.info(`${label}: ${duration}ms`)
        delete logger.startTimes[label]
    }
}

export default logger 