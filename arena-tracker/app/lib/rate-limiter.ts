/**
 * Rate limiter for Riot API requests
 * Updated for new rate limits: 2000 requests per 10 seconds for match IDs endpoint
 * Falls back to 20 requests per second and 100 requests per minute for other endpoints
 */

interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPer10Seconds: number; // New limit for match IDs endpoint
}

class RateLimiter {
  private requestTimestamps: number[] = [];
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig = { 
    requestsPerSecond: 20, 
    requestsPerMinute: 100,
    requestsPer10Seconds: 2000 // New generous limit for match IDs
  }) {
    this.config = config;
  }

  /**
   * Wait for rate limit compliance before making a request
   * @param endpoint - Optional endpoint type to apply specific rate limits
   */
  async waitForRateLimit(endpoint?: string): Promise<void> {
    const now = Date.now();
    
    // Clean up old timestamps (older than 1 minute)
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => now - timestamp < 60000
    );

    // For match IDs endpoint, use the more generous 10-second limit
    if (endpoint === 'matchIds') {
      // Check 10-second limit (last 10000ms)
      const requests10Sec = this.requestTimestamps.filter(
        timestamp => now - timestamp < 10000
      );
      
      if (requests10Sec.length >= this.config.requestsPer10Seconds) {
        const oldestRequest = requests10Sec[0];
        const waitTime = 10000 - (now - oldestRequest);
        if (waitTime > 0) {
          console.log(`⏳ Rate limit: waiting ${waitTime}ms for 10-second limit (match IDs)`);
          await this.sleep(waitTime);
          return this.waitForRateLimit(endpoint); // Recursive call to recheck
        }
      }
    } else {
      // Use traditional limits for other endpoints
      
      // Check minute limit
      if (this.requestTimestamps.length >= this.config.requestsPerMinute) {
        const oldestRequest = this.requestTimestamps[0];
        const waitTime = 60000 - (now - oldestRequest);
        if (waitTime > 0) {
          console.log(`⏳ Rate limit: waiting ${waitTime}ms for minute limit`);
          await this.sleep(waitTime);
          return this.waitForRateLimit(endpoint); // Recursive call to recheck
        }
      }

      // Check second limit (last 1000ms)
      const recentRequests = this.requestTimestamps.filter(
        timestamp => now - timestamp < 1000
      );
      
      if (recentRequests.length >= this.config.requestsPerSecond) {
        const oldestRecentRequest = recentRequests[0];
        const waitTime = 1000 - (now - oldestRecentRequest);
        if (waitTime > 0) {
          console.log(`⏳ Rate limit: waiting ${waitTime}ms for second limit`);
          await this.sleep(waitTime);
          return this.waitForRateLimit(endpoint); // Recursive call to recheck
        }
      }
    }

    // Record this request
    this.requestTimestamps.push(now);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limit status
   */
  getStatus() {
    const now = Date.now();
    const recentRequests = this.requestTimestamps.filter(
      timestamp => now - timestamp < 1000
    );
    const minuteRequests = this.requestTimestamps.filter(
      timestamp => now - timestamp < 60000
    );
    const requests10Sec = this.requestTimestamps.filter(
      timestamp => now - timestamp < 10000
    );

    return {
      requestsInLastSecond: recentRequests.length,
      requestsInLastMinute: minuteRequests.length,
      requestsInLast10Seconds: requests10Sec.length,
      secondLimitRemaining: this.config.requestsPerSecond - recentRequests.length,
      minuteLimitRemaining: this.config.requestsPerMinute - minuteRequests.length,
      tenSecondLimitRemaining: this.config.requestsPer10Seconds - requests10Sec.length,
    };
  }
}

// Export a singleton instance
export const riotRateLimiter = new RateLimiter();