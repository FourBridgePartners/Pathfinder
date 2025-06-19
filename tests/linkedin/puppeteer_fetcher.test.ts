import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PuppeteerConnectionFetcher, MutualConnection } from '../../server/lib/linkedin/PuppeteerConnectionFetcher';
import { type FourBridgeMember } from '../../server/lib/linkedin/memberHelper';

// Mock puppeteer-extra
vi.mock('puppeteer-extra', () => ({
  default: {
    use: vi.fn(),
    launch: vi.fn()
  }
}));

// Mock puppeteer-extra-plugin-stealth
vi.mock('puppeteer-extra-plugin-stealth', () => ({
  default: vi.fn()
}));

describe('PuppeteerConnectionFetcher', () => {
  let fetcher: PuppeteerConnectionFetcher;
  let mockBrowser: any;
  let mockPage: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock browser and page
    mockPage = {
      goto: vi.fn(),
      setUserAgent: vi.fn(),
      setViewport: vi.fn(),
      waitForSelector: vi.fn(),
      type: vi.fn(),
      click: vi.fn(),
      waitForNavigation: vi.fn(),
      url: 'https://www.linkedin.com/feed',
      $$: vi.fn(),
      $: vi.fn(),
      evaluate: vi.fn(),
      close: vi.fn()
    };

    mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn()
    };

    // Mock puppeteer launch
    const puppeteer = require('puppeteer-extra');
    puppeteer.launch.mockResolvedValue(mockBrowser);

    fetcher = new PuppeteerConnectionFetcher({
      headless: true,
      timeout: 30000
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultFetcher = new PuppeteerConnectionFetcher();
      expect(defaultFetcher).toBeInstanceOf(PuppeteerConnectionFetcher);
    });

    it('should initialize with custom config', () => {
      const customFetcher = new PuppeteerConnectionFetcher({
        headless: false,
        timeout: 60000,
        userAgent: 'Custom User Agent',
        viewport: { width: 1366, height: 768 }
      });
      expect(customFetcher).toBeInstanceOf(PuppeteerConnectionFetcher);
    });
  });

  describe('fetchMutualConnections', () => {
    const mockMember: FourBridgeMember = {
      name: 'TestUser',
      username: 'test@example.com',
      password: 'password123'
    };

    const targetProfileUrl = 'https://www.linkedin.com/in/test-profile';

    it('should successfully fetch mutual connections', async () => {
      // Mock successful login
      mockPage.url = 'https://www.linkedin.com/feed';
      
      // Mock mutual connection elements
      const mockElements = [
        {
          $: vi.fn().mockImplementation((selector) => {
            if (selector.includes('name')) {
              return { evaluate: vi.fn().mockResolvedValue('John Doe') };
            }
            if (selector.includes('occupation')) {
              return { evaluate: vi.fn().mockResolvedValue('Software Engineer at Tech Corp') };
            }
            return null;
          }),
          evaluate: vi.fn().mockResolvedValue('/in/john-doe')
        },
        {
          $: vi.fn().mockImplementation((selector) => {
            if (selector.includes('name')) {
              return { evaluate: vi.fn().mockResolvedValue('Jane Smith') };
            }
            if (selector.includes('occupation')) {
              return { evaluate: vi.fn().mockResolvedValue('Product Manager at Startup') };
            }
            return null;
          }),
          evaluate: vi.fn().mockResolvedValue('/in/jane-smith')
        }
      ];

      mockPage.$$.mockResolvedValue(mockElements);

      const result = await fetcher.fetchMutualConnections(targetProfileUrl, mockMember);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'John Doe',
        profileUrl: 'https://www.linkedin.com/in/john-doe',
        title: 'Software Engineer at Tech Corp',
        discoveredBy: 'TestUser',
        via: 'puppeteer'
      });
      expect(result[1]).toEqual({
        name: 'Jane Smith',
        profileUrl: 'https://www.linkedin.com/in/jane-smith',
        title: 'Product Manager at Startup',
        discoveredBy: 'TestUser',
        via: 'puppeteer'
      });
    });

    it('should handle login failure', async () => {
      // Mock failed login
      mockPage.url = 'https://www.linkedin.com/login';

      await expect(fetcher.fetchMutualConnections(targetProfileUrl, mockMember))
        .rejects.toThrow('Failed to login as TestUser');
    });

    it('should handle invalid profile URL', async () => {
      // Mock successful login
      mockPage.url = 'https://www.linkedin.com/feed';
      
      // Mock navigation to invalid URL
      mockPage.url = 'https://www.linkedin.com/404';

      await expect(fetcher.fetchMutualConnections(targetProfileUrl, mockMember))
        .rejects.toThrow('Invalid LinkedIn profile URL');
    });

    it('should handle no mutual connections found', async () => {
      // Mock successful login
      mockPage.url = 'https://www.linkedin.com/feed';
      
      // Mock no mutual connection elements
      mockPage.$$.mockResolvedValue([]);

      const result = await fetcher.fetchMutualConnections(targetProfileUrl, mockMember);

      expect(result).toHaveLength(0);
    });

    it('should handle missing name or profile URL', async () => {
      // Mock successful login
      mockPage.url = 'https://www.linkedin.com/feed';
      
      // Mock elements with missing data
      const mockElements = [
        {
          $: vi.fn().mockReturnValue(null),
          evaluate: vi.fn().mockResolvedValue('') // Empty profile URL
        }
      ];

      mockPage.$$.mockResolvedValue(mockElements);

      const result = await fetcher.fetchMutualConnections(targetProfileUrl, mockMember);

      expect(result).toHaveLength(0);
    });

    it('should respect rate limiting', async () => {
      // Mock successful login
      mockPage.url = 'https://www.linkedin.com/feed';
      
      // Mock multiple elements
      const mockElements = Array(5).fill(null).map(() => ({
        $: vi.fn().mockImplementation((selector) => {
          if (selector.includes('name')) {
            return { evaluate: vi.fn().mockResolvedValue('Test User') };
          }
          return null;
        }),
        evaluate: vi.fn().mockResolvedValue('/in/test-user')
      }));

      mockPage.$$.mockResolvedValue(mockElements);

      const startTime = Date.now();
      await fetcher.fetchMutualConnections(targetProfileUrl, mockMember);
      const endTime = Date.now();

      // Should have some delay due to rate limiting (100ms per connection)
      expect(endTime - startTime).toBeGreaterThan(400);
    });
  });

  describe('close', () => {
    it('should close browser instance', async () => {
      await fetcher.close();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should handle multiple close calls gracefully', async () => {
      await fetcher.close();
      await fetcher.close();
      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle browser launch failure', async () => {
      const puppeteer = require('puppeteer-extra');
      puppeteer.launch.mockRejectedValue(new Error('Browser launch failed'));

      const newFetcher = new PuppeteerConnectionFetcher();
      const mockMember: FourBridgeMember = {
        name: 'TestUser',
        username: 'test@example.com',
        password: 'password123'
      };

      await expect(newFetcher.fetchMutualConnections('https://linkedin.com/in/test', mockMember))
        .rejects.toThrow('Failed to initialize browser');
    });

    it('should handle page navigation errors', async () => {
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));

      const mockMember: FourBridgeMember = {
        name: 'TestUser',
        username: 'test@example.com',
        password: 'password123'
      };

      await expect(fetcher.fetchMutualConnections('https://linkedin.com/in/test', mockMember))
        .rejects.toThrow('Navigation failed');
    });
  });
});

describe('MutualConnection interface', () => {
  it('should have correct structure', () => {
    const mutual: MutualConnection = {
      name: 'John Doe',
      profileUrl: 'https://linkedin.com/in/john-doe',
      title: 'Software Engineer',
      discoveredBy: 'TestUser',
      via: 'puppeteer'
    };

    expect(mutual.name).toBe('John Doe');
    expect(mutual.profileUrl).toBe('https://linkedin.com/in/john-doe');
    expect(mutual.title).toBe('Software Engineer');
    expect(mutual.discoveredBy).toBe('TestUser');
    expect(mutual.via).toBe('puppeteer');
  });
});

describe('FourBridgeMember interface', () => {
  it('should have correct structure', () => {
    const member: FourBridgeMember = {
      name: 'Jon',
      username: 'jon@fourbridge.com',
      password: 'password123'
    };

    expect(member.name).toBe('Jon');
    expect(member.username).toBe('jon@fourbridge.com');
    expect(member.password).toBe('password123');
  });
}); 