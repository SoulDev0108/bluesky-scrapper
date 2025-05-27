import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

import ApiClient from '../src/core/api_client.js'
import DataValidator from '../src/utils/data_validator.js'
import Deduplicator from '../src/utils/deduplicator.js'
import FileManager from '../src/utils/file_manager.js'
import UserInfoScraper from '../src/scrapers/user_info_scraper.js'
import PostInfoScraper from '../src/scrapers/post_info_scraper.js'

/**
 * Integration tests for Bluesky scraper components
 * Tests the core functionality without requiring actual API calls
 */

describe('Bluesky Scraper Integration Tests', () => {
    let testDataDir;

    beforeAll(async () => {
        // Create test data directory
        testDataDir = path.join(__dirname, 'test_data');
        await fs.mkdir(testDataDir, { recursive: true });
        
        // Set test environment
        process.env.NODE_ENV = 'test';
        process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
    });

    afterAll(async () => {
        // Cleanup test data
        try {
            await fs.rmdir(testDataDir, { recursive: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('Data Validator', () => {
        let validator;

        beforeEach(() => {
            validator = new DataValidator();
        });

        test('should validate user data correctly', () => {
            const validUser = {
                did: 'did:plc:test123',
                handle: 'test.bsky.social',
                displayName: 'Test User',
                description: 'Test description',
                followersCount: 100,
                followsCount: 50,
                postsCount: 25
            };

            const result = validator.validateUser(validUser);
            expect(result.did).toBe(validUser.did);
            expect(result.handle).toBe(validUser.handle);
            expect(result.followersCount).toBe(validUser.followersCount);
        });

        test('should reject invalid user data', () => {
            const invalidUser = {
                // Missing required fields
                displayName: 'Test User'
            };

            expect(() => validator.validateUser(invalidUser)).toThrow();
        });

        test('should validate post data correctly', () => {
            const validPost = {
                uri: 'at://test.bsky.social/app.bsky.feed.post/test123',
                cid: 'test_cid',
                author: {
                    did: 'did:plc:test123',
                    handle: 'test.bsky.social'
                },
                record: {
                    text: 'Test post content',
                    createdAt: new Date().toISOString()
                },
                likeCount: 5,
                repostCount: 2,
                replyCount: 1
            };

            const result = validator.validatePost(validPost);
            expect(result.uri).toBe(validPost.uri);
            expect(result.record.text).toBe(validPost.record.text);
            expect(result.likeCount).toBe(validPost.likeCount);
        });

        test('should validate batch data', () => {
            const users = [
                {
                    did: 'did:plc:test1',
                    handle: 'test1.bsky.social'
                },
                {
                    did: 'did:plc:test2',
                    handle: 'test2.bsky.social'
                },
                {
                    // Invalid user - missing handle
                    did: 'did:plc:test3'
                }
            ];

            const result = validator.validateBatch(users, 'user');
            expect(result.validItems).toHaveLength(2);
            expect(result.errors).toHaveLength(1);
            expect(result.stats.successRate).toBe('66.67%');
        });
    });

    describe('File Manager', () => {
        let fileManager;

        beforeEach(async () => {
            fileManager = new FileManager();
            fileManager.baseDir = testDataDir;
            await fileManager.initialize();
        });

        test('should save and load user data', async () => {
            const testUsers = [
                {
                    did: 'did:plc:test1',
                    handle: 'test1.bsky.social',
                    displayName: 'Test User 1'
                },
                {
                    did: 'did:plc:test2',
                    handle: 'test2.bsky.social',
                    displayName: 'Test User 2'
                }
            ];

            const metadata = {
                scraper: 'test',
                timestamp: new Date().toISOString()
            };

            // Save users
            const filePath = await fileManager.saveUsers(testUsers, metadata);
            expect(filePath).toBeTruthy();

            // Load users
            const loadedData = await fileManager.loadData(filePath);
            expect(loadedData.data).toHaveLength(2);
            expect(loadedData.metadata.scraper).toBe('test');
            expect(loadedData.data[0].handle).toBe('test1.bsky.social');
        });

        test('should save and load post data', async () => {
            const testPosts = [
                {
                    uri: 'at://test1.bsky.social/app.bsky.feed.post/test1',
                    cid: 'test_cid_1',
                    author: { did: 'did:plc:test1', handle: 'test1.bsky.social' },
                    record: { text: 'Test post 1', createdAt: new Date().toISOString() }
                }
            ];

            const filePath = await fileManager.savePosts(testPosts, { scraper: 'test' });
            const loadedData = await fileManager.loadData(filePath);
            
            expect(loadedData.data).toHaveLength(1);
            expect(loadedData.data[0].record.text).toBe('Test post 1');
        });

        test('should list files correctly', async () => {
            // Save some test data
            await fileManager.saveUsers([{ did: 'test1', handle: 'test1.bsky.social' }], {});
            await fileManager.saveUsers([{ did: 'test2', handle: 'test2.bsky.social' }], {});

            const files = await fileManager.listFiles('users');
            expect(files.length).toBeGreaterThanOrEqual(2);
        });

        test('should get storage statistics', async () => {
            // Save some test data
            await fileManager.saveUsers([{ did: 'test', handle: 'test.bsky.social' }], {});
            
            const stats = await fileManager.getStats();
            expect(stats.filesCreated).toBeGreaterThan(0);
            expect(stats.users).toBeDefined();
            expect(stats.users.fileCount).toBeGreaterThan(0);
        });
    });

    describe('User Info Scraper', () => {
        let scraper;

        beforeEach(async () => {
            scraper = new UserInfoScraper({
                saveToFile: false // Don't save during tests
            });
        });

        test('should extract handle from URL correctly', () => {
            const testCases = [
                {
                    url: 'https://bsky.app/profile/test.bsky.social',
                    expected: 'test.bsky.social'
                },
                {
                    url: 'bsky.app/profile/user.example.com',
                    expected: 'user.example.com'
                },
                {
                    url: 'https://bsky.app/profile/did:plc:test123',
                    expected: 'did:plc:test123'
                }
            ];

            testCases.forEach(({ url, expected }) => {
                const result = scraper.extractHandleFromUrl(url);
                expect(result).toBe(expected);
            });
        });

        test('should validate Bluesky URLs', () => {
            const validUrls = [
                'https://bsky.app/profile/test.bsky.social',
                'bsky.app/profile/user.example.com'
            ];

            const invalidUrls = [
                'https://twitter.com/user',
                'https://bsky.app/invalid/path',
                'not-a-url'
            ];

            validUrls.forEach(url => {
                expect(scraper.isValidBlueskyUrl(url)).toBe(true);
            });

            invalidUrls.forEach(url => {
                expect(scraper.isValidBlueskyUrl(url)).toBe(false);
            });
        });

        test('should compute user metrics correctly', () => {
            const testUser = {
                followersCount: 1000,
                followsCount: 500,
                recentPosts: [
                    {
                        record: { text: 'Short post', createdAt: '2024-01-01T00:00:00Z' },
                        likeCount: 10,
                        repostCount: 2,
                        replyCount: 1
                    },
                    {
                        record: { text: 'This is a longer post with more content', createdAt: '2024-01-02T00:00:00Z' },
                        likeCount: 20,
                        repostCount: 5,
                        replyCount: 3
                    }
                ]
            };

            const metrics = scraper.computeUserMetrics(testUser);
            
            expect(metrics.followerToFollowingRatio).toBe('2.00');
            expect(metrics.averagePostLength).toBeGreaterThan(0);
            expect(metrics.engagementRate).toBeGreaterThan(0);
        });
    });

    describe('Post Info Scraper', () => {
        let scraper;

        beforeEach(() => {
            scraper = new PostInfoScraper({
                saveToFile: false // Don't save during tests
            });
        });

        test('should extract AT URI from URL correctly', () => {
            const testCases = [
                {
                    url: 'https://bsky.app/profile/test.bsky.social/post/3k2l4m5n6o7p',
                    expected: 'at://test.bsky.social/app.bsky.feed.post/3k2l4m5n6o7p'
                },
                {
                    url: 'bsky.app/profile/user.example.com/post/abc123',
                    expected: 'at://user.example.com/app.bsky.feed.post/abc123'
                }
            ];

            testCases.forEach(({ url, expected }) => {
                const result = scraper.extractAtUriFromUrl(url);
                expect(result).toBe(expected);
            });
        });

        test('should validate Bluesky post URLs', () => {
            const validUrls = [
                'https://bsky.app/profile/test.bsky.social/post/abc123',
                'bsky.app/profile/user.example.com/post/xyz789'
            ];

            const invalidUrls = [
                'https://bsky.app/profile/test.bsky.social', // Missing post part
                'https://twitter.com/user/status/123',
                'not-a-url'
            ];

            validUrls.forEach(url => {
                expect(scraper.isValidBlueskyPostUrl(url)).toBe(true);
            });

            invalidUrls.forEach(url => {
                expect(scraper.isValidBlueskyPostUrl(url)).toBe(false);
            });
        });

        test('should compute post metrics correctly', () => {
            const testPost = {
                likeCount: 100,
                repostCount: 20,
                replyCount: 10,
                author: {
                    followersCount: 1000
                }
            };

            const metrics = scraper.computePostMetrics(testPost);
            
            expect(metrics.totalEngagement).toBe(130);
            expect(metrics.engagementRate).toBe('13.00');
            expect(metrics.likeToRepostRatio).toBe('5.00');
            expect(metrics.replyToLikeRatio).toBe('0.10');
            expect(parseInt(metrics.viralityScore)).toBeGreaterThan(0);
        });

        test('should analyze post content correctly', () => {
            const testPost = {
                record: {
                    text: 'This is a #test post with @mention and https://example.com link! 😀',
                    langs: ['en'],
                    embed: { type: 'image' }
                }
            };

            const analysis = scraper.analyzePostContent(testPost);
            
            expect(analysis.wordCount).toBeGreaterThan(0);
            expect(analysis.hasLinks).toBe(true);
            expect(analysis.hasHashtags).toBe(true);
            expect(analysis.hasMentions).toBe(true);
            expect(analysis.hasEmojis).toBe(true);
            expect(analysis.hasMedia).toBe(true);
            expect(analysis.language).toBe('en');
            expect(analysis.topics).toContain('#test');
        });
    });

    describe('API Client Configuration', () => {
        test('should create API client with default settings', () => {
            const client = new ApiClient();
            expect(client).toBeDefined();
            expect(client.baseURL).toBe('https://public.api.bsky.app');
        });

        test('should have all required endpoint methods', () => {
            const client = new ApiClient();
            
            const requiredMethods = [
                'searchActors',
                'getProfile',
                'getFollowers',
                'getFollows',
                'getAuthorFeed',
                'getPostThread',
                'getTimeline',
                'getLikes',
                'getRepostedBy'
            ];

            requiredMethods.forEach(method => {
                expect(typeof client[method]).toBe('function');
            });
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid data gracefully', () => {
            const validator = new DataValidator();
            
            expect(() => validator.validateUser(null)).toThrow();
            expect(() => validator.validateUser({})).toThrow();
            expect(() => validator.validatePost(null)).toThrow();
        });

        test('should handle file system errors gracefully', async () => {
            const fileManager = new FileManager();
            fileManager.baseDir = '/invalid/path/that/does/not/exist';
            
            // Should not throw during initialization
            await expect(fileManager.initialize()).rejects.toThrow();
        });
    });

    describe('Performance and Scalability', () => {
        test('should handle large batch validation efficiently', () => {
            const validator = new DataValidator();
            
            // Create a large batch of users
            const users = Array.from({ length: 1000 }, (_, i) => ({
                did: `did:plc:test${i}`,
                handle: `test${i}.bsky.social`,
                displayName: `Test User ${i}`
            }));

            const startTime = Date.now();
            const result = validator.validateBatch(users, 'user');
            const endTime = Date.now();
            
            expect(result.validItems).toHaveLength(1000);
            expect(result.errors).toHaveLength(0);
            expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
        });

        test('should format durations correctly', () => {
            const scraper = new UserInfoScraper();
            
            expect(scraper.formatDuration(1000)).toBe('1s');
            expect(scraper.formatDuration(61000)).toBe('1m 1s');
            expect(scraper.formatDuration(3661000)).toBe('1h 1m 1s');
        });
    });
});

// Mock console methods to reduce test output noise
const originalConsole = { ...console };
beforeAll(() => {
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
});

afterAll(() => {
    Object.assign(console, originalConsole);
}); 