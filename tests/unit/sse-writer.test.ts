import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSseWriter, setSSEHeaders, toSSEEventName } from '../../src/server/utils/sse-writer'

describe('SSE Writer', () => {
  let mockResponse: any
  let writeSpy: any
  let endSpy: any
  let flushSpy: any
  let flushHeadersSpy: any
  let setHeaderSpy: any

  beforeEach(() => {
    writeSpy = vi.fn()
    endSpy = vi.fn()
    flushSpy = vi.fn()
    flushHeadersSpy = vi.fn()
    setHeaderSpy = vi.fn()

    mockResponse = {
      write: writeSpy,
      end: endSpy,
      flush: flushSpy,
      flushHeaders: flushHeadersSpy,
      setHeader: setHeaderSpy,
      headersSent: false,
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('createSseWriter', () => {
    it('should write SSE events with correct format', () => {
      const sseWriter = createSseWriter(mockResponse)
      const testData = { type: 'test', message: 'Hello World' }

      sseWriter.writeEvent('test-event', testData)

      expect(writeSpy).toHaveBeenCalledTimes(1)
      const expectedOutput = `event: test-event\ndata: ${JSON.stringify(testData)}\n\n`
      expect(writeSpy).toHaveBeenCalledWith(expectedOutput)
    })

    it('should flush after writing when flush is true', () => {
      const sseWriter = createSseWriter(mockResponse, { flush: true })
      sseWriter.writeEvent('test', {})

      expect(writeSpy).toHaveBeenCalledTimes(1)
      expect(flushSpy).toHaveBeenCalledTimes(1)
    })

    it('should not flush after writing when flush is false', () => {
      const sseWriter = createSseWriter(mockResponse, { flush: false })
      sseWriter.writeEvent('test', {})

      expect(writeSpy).toHaveBeenCalledTimes(1)
      expect(flushSpy).not.toHaveBeenCalled()
    })

    it('should handle write errors gracefully', () => {
      writeSpy.mockImplementation(() => {
        throw new Error('Write failed')
      })

      const sseWriter = createSseWriter(mockResponse)
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // First write should fail and close the writer
      sseWriter.writeEvent('test', {})

      expect(writeSpy).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith('[SSE] Write error:', expect.any(Error))
      expect(sseWriter.isClosed()).toBe(true)

      // Second write should be ignored
      sseWriter.writeEvent('test2', {})
      expect(writeSpy).toHaveBeenCalledTimes(1) // Still only called once

      consoleWarnSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it('should send heartbeat events when heartbeatInterval is set', () => {
      vi.useFakeTimers()
      const sseWriter = createSseWriter(mockResponse, { heartbeatInterval: 1000 })

      // Advance timer by 2 seconds
      vi.advanceTimersByTime(2000)

      expect(writeSpy).toHaveBeenCalledTimes(2)
      expect(writeSpy.mock.calls[0][0]).toContain('event: heartbeat\n')
      expect(writeSpy.mock.calls[1][0]).toContain('event: heartbeat\n')

      vi.useRealTimers()
    })

    it('should stop heartbeat when writer is closed', () => {
      vi.useFakeTimers()
      const sseWriter = createSseWriter(mockResponse, { heartbeatInterval: 1000 })

      // Advance timer by 1 second
      vi.advanceTimersByTime(1000)
      expect(writeSpy).toHaveBeenCalledTimes(1)

      // Close the writer
      sseWriter.end()

      // Advance timer by another second - should not write
      vi.advanceTimersByTime(1000)
      expect(writeSpy).toHaveBeenCalledTimes(1) // Still only called once

      vi.useRealTimers()
    })

    it('should end the response when end is called', () => {
      const sseWriter = createSseWriter(mockResponse)
      sseWriter.end()

      expect(writeSpy).toHaveBeenCalledWith('event: done\ndata: {}\n\n')
      expect(endSpy).toHaveBeenCalledTimes(1)
      expect(sseWriter.isClosed()).toBe(true)
    })

    it('should not write to closed connection', () => {
      const sseWriter = createSseWriter(mockResponse)
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      sseWriter.end()
      sseWriter.writeEvent('test', {})

      expect(consoleWarnSpy).toHaveBeenCalledWith('[SSE] Attempted to write to closed connection')
      expect(writeSpy).toHaveBeenCalledTimes(1) // Only the 'done' event

      consoleWarnSpy.mockRestore()
    })

    it('should ignore errors when ending already closed connection', () => {
      const sseWriter = createSseWriter(mockResponse)
      endSpy.mockImplementation(() => {
        throw new Error('Already ended')
      })

      sseWriter.end()
      sseWriter.end() // Second call should be ignored

      expect(endSpy).toHaveBeenCalledTimes(1)
      expect(sseWriter.isClosed()).toBe(true)
    })
  })

  describe('setSSEHeaders', () => {
    it('should set correct SSE headers', () => {
      setSSEHeaders(mockResponse)

      expect(setHeaderSpy).toHaveBeenCalledTimes(4)
      expect(setHeaderSpy).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
      expect(setHeaderSpy).toHaveBeenCalledWith('Cache-Control', 'no-cache')
      expect(setHeaderSpy).toHaveBeenCalledWith('Connection', 'keep-alive')
      expect(setHeaderSpy).toHaveBeenCalledWith('X-Accel-Buffering', 'no')
      expect(flushHeadersSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('toSSEEventName', () => {
    it('should remove agent: prefix from event names', () => {
      expect(toSSEEventName('agent:message')).toBe('message')
      expect(toSSEEventName('agent:thought')).toBe('thought')
      expect(toSSEEventName('agent:tool-call')).toBe('tool-call')
      expect(toSSEEventName('agent:thought-delta')).toBe('thought-delta')
    })

    it('should return original name if no agent: prefix', () => {
      expect(toSSEEventName('message')).toBe('message')
      expect(toSSEEventName('heartbeat')).toBe('heartbeat')
      expect(toSSEEventName('')).toBe('')
    })

    it('should handle edge cases', () => {
      expect(toSSEEventName('agent:')).toBe('')
      expect(toSSEEventName('agent:agent:message')).toBe('agent:message')
    })
  })
})