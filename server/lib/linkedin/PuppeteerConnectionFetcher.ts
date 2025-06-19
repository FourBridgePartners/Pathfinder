import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Page, Browser } from 'puppeteer';
import { type FourBridgeMember } from './memberHelper';

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

export interface MutualConnection {
  name: string;
  profileUrl: string;
  title?: string;
  discoveredBy: string;
  via: 'puppeteer';
}

export interface PuppeteerConfig {
  headless?: boolean;
  timeout?: number;
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
  };
}

export class PuppeteerConnectionFetcher {
  private browser: Browser | null = null;
  private config: PuppeteerConfig;
  private isLoggedIn = false;

  constructor(config: PuppeteerConfig = {}) {
    this.config = {
      headless: true,
      timeout: 30000,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      ...config
    };
  }

  /**
   * Initialize browser instance
   */
  private async initBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    try {
      console.log('[PuppeteerFetcher] Launching browser...');
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      });

      return this.browser;
    } catch (error) {
      console.error('[PuppeteerFetcher] Failed to launch browser:', error);
      throw new Error('Failed to initialize browser');
    }
  }

  /**
   * Login to LinkedIn with provided credentials
   */
  private async loginToLinkedIn(page: Page, member: FourBridgeMember): Promise<boolean> {
    try {
      console.log(`[PuppeteerFetcher] Logging in as ${member.name}...`);
      
      await page.goto('https://www.linkedin.com/login', {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout
      });

      // Set user agent
      await page.setUserAgent(this.config.userAgent!);
      await page.setViewport(this.config.viewport!);

      // Wait for login form
      await page.waitForSelector('#username', { timeout: 10000 });
      await page.waitForSelector('#password', { timeout: 10000 });

      // Fill login form
      await page.type('#username', member.username);
      await page.type('#password', member.password);

      // Submit form
      await page.click('button[type="submit"]');

      // Wait for redirect to home page or dashboard
      await page.waitForNavigation({ 
        waitUntil: 'networkidle2',
        timeout: 15000 
      });

      // Check if login was successful
      const currentUrl = page.url();
      if (currentUrl.includes('linkedin.com/feed') || currentUrl.includes('linkedin.com/dashboard')) {
        console.log(`[PuppeteerFetcher] Successfully logged in as ${member.name}`);
        this.isLoggedIn = true;
        return true;
      } else {
        console.error(`[PuppeteerFetcher] Login failed for ${member.name}, current URL: ${currentUrl}`);
        return false;
      }

    } catch (error) {
      console.error(`[PuppeteerFetcher] Login error for ${member.name}:`, error);
      return false;
    }
  }

  /**
   * Extract mutual connections from a LinkedIn profile page
   */
  private async extractMutualConnections(page: Page, memberName: string): Promise<MutualConnection[]> {
    const mutuals: MutualConnection[] = [];

    try {
      console.log(`[PuppeteerFetcher] Extracting mutual connections for ${memberName}...`);

      // Look for mutual connections section
      const mutualSelectors = [
        'a[href*="/in/"][data-control-name="connection_profile"]',
        '.pv-browsemap-section__member',
        '.mn-connection-card__link',
        'a[data-control-name="browsemap_profile"]'
      ];

      let mutualElements = null;
      for (const selector of mutualSelectors) {
        mutualElements = await page.$$(selector);
        if (mutualElements.length > 0) {
          console.log(`[PuppeteerFetcher] Found ${mutualElements.length} mutual connections using selector: ${selector}`);
          break;
        }
      }

      if (!mutualElements || mutualElements.length === 0) {
        console.log(`[PuppeteerFetcher] No mutual connections found for ${memberName}`);
        return mutuals;
      }

      // Scroll to load more connections
      await this.scrollToLoadMore(page);

      // Re-fetch elements after scrolling
      for (const selector of mutualSelectors) {
        mutualElements = await page.$$(selector);
        if (mutualElements.length > 0) break;
      }

      // Extract data from each mutual connection
      for (let i = 0; i < Math.min(mutualElements.length, 50); i++) { // Limit to 50 connections
        try {
          const element = mutualElements[i];
          
          // Extract name and profile URL
          const nameElement = await element.$('.mn-connection-card__name, .pv-browsemap-section__name, span[aria-hidden="true"]');
          const name = nameElement ? await nameElement.evaluate(el => el.textContent?.trim()) : '';
          
          const profileUrl = await element.evaluate(el => el.getAttribute('href'));
          
          // Extract title
          const titleElement = await element.$('.mn-connection-card__occupation, .pv-browsemap-section__occupation, .pv-browsemap-section__company');
          const title = titleElement ? await titleElement.evaluate(el => el.textContent?.trim()) : '';

          if (name && profileUrl) {
            mutuals.push({
              name,
              profileUrl: profileUrl.startsWith('http') ? profileUrl : `https://www.linkedin.com${profileUrl}`,
              title: title || undefined,
              discoveredBy: memberName,
              via: 'puppeteer'
            });
          }

          // Rate limiting
          await this.delay(100);

        } catch (error) {
          console.error(`[PuppeteerFetcher] Error extracting mutual connection ${i}:`, error);
          continue;
        }
      }

      console.log(`[PuppeteerFetcher] Successfully extracted ${mutuals.length} mutual connections for ${memberName}`);

    } catch (error) {
      console.error(`[PuppeteerFetcher] Error extracting mutual connections for ${memberName}:`, error);
    }

    return mutuals;
  }

  /**
   * Scroll to load more mutual connections
   */
  private async scrollToLoadMore(page: Page): Promise<void> {
    try {
      console.log('[PuppeteerFetcher] Scrolling to load more connections...');
      
      // Scroll down multiple times to trigger lazy loading
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight);
        });
        await this.delay(1000);
      }

      // Wait for any new content to load
      await this.delay(2000);

    } catch (error) {
      console.error('[PuppeteerFetcher] Error scrolling:', error);
    }
  }

  /**
   * Fetch mutual connections for a target profile using a specific FourBridge member
   */
  async fetchMutualConnections(
    targetProfileUrl: string, 
    member: FourBridgeMember
  ): Promise<MutualConnection[]> {
    let page: Page | null = null;

    try {
      console.log(`[PuppeteerFetcher] Starting mutual connection fetch for ${targetProfileUrl} using ${member.name}`);

      const browser = await this.initBrowser();
      page = await browser.newPage();

      // Set up page
      await page.setUserAgent(this.config.userAgent!);
      await page.setViewport(this.config.viewport!);

      // Login if not already logged in
      if (!this.isLoggedIn) {
        const loginSuccess = await this.loginToLinkedIn(page, member);
        if (!loginSuccess) {
          throw new Error(`Failed to login as ${member.name}`);
        }
      }

      // Navigate to target profile
      console.log(`[PuppeteerFetcher] Navigating to ${targetProfileUrl}`);
      await page.goto(targetProfileUrl, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout
      });

      // Wait for page to load
      await this.delay(3000);

      // Check if we're on a valid profile page
      const currentUrl = page.url();
      if (!currentUrl.includes('linkedin.com/in/')) {
        throw new Error('Invalid LinkedIn profile URL');
      }

      // Extract mutual connections
      const mutuals = await this.extractMutualConnections(page, member.name);

      return mutuals;

    } catch (error) {
      console.error(`[PuppeteerFetcher] Error fetching mutual connections for ${targetProfileUrl}:`, error);
      throw error;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Close browser instance
   */
  async close(): Promise<void> {
    if (this.browser) {
      console.log('[PuppeteerFetcher] Closing browser...');
      await this.browser.close();
      this.browser = null;
      this.isLoggedIn = false;
    }
  }

  /**
   * Delay function for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 