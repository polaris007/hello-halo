/**
 * ETag middleware for HTTP caching
 */

import { createHash } from 'crypto'
import { Request, Response, NextFunction } from 'express'

/**
 * Generate ETag for response body
 */
function generateETag(body: any): string {
  const hash = createHash('md5').update(JSON.stringify(body)).digest('hex')
  return `"${hash}"`
}

/**
 * ETag middleware
 */
export function etagMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only apply to GET requests
    if (req.method !== 'GET') {
      return next()
    }
    
    // Get original send method
    const originalSend = res.send.bind(res)
    
    // Override send method to add ETag and Cache-Control headers
    res.send = function(body: any) {
      // Set Cache-Control header
      res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate')
      
      // Generate ETag
      const etag = generateETag(body)
      res.setHeader('ETag', etag)
      
      // Check If-None-Match header
      const ifNoneMatch = req.headers['if-none-match']
      if (ifNoneMatch === etag) {
        // Resource not modified, return 304
        res.status(304).end()
        return res
      }
      
      // Call original send method
      return originalSend(body)
    }
    
    next()
  }
}

/**
 * Middleware to set Cache-Control headers for static resources
 */
export function cacheControlMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set default Cache-Control for all requests
    res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate')
    next()
  }
}
