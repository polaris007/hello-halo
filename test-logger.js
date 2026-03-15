// Test script for logger functionality
import { logger, overrideConsole } from './src/server/utils/logger.js'

// Override console
overrideConsole()

console.log('Test log message')
console.info('Test info message')
console.warn('Test warning message')
console.error('Test error message')
console.debug('Test debug message')

// Test with different log levels
process.env.HALO_LOG_LEVEL = 'ERROR'
console.log('This should not appear (level too low)')
console.error('This should appear (ERROR level)')

// Test console output control
process.env.HALO_LOG_CONSOLE = 'false'
console.log('This should not appear in console')

// Test log directory
console.log('Log directory:', logger.getLogDirectory())
console.log('Log file:', logger.getLogFilePath())

// Test custom log directory
process.env.HALO_LOG_DIR = './test-logs'
console.log('Custom log directory test')

// Clean up env vars for next tests
delete process.env.HALO_LOG_LEVEL
delete process.env.HALO_LOG_CONSOLE
delete process.env.HALO_LOG_DIR