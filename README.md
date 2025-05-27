# Bluesky AT Protocol Scraper

A scalable, high-performance web scraper for extracting large-scale data from the Bluesky social media platform using the AT Protocol API endpoints.

## 🎯 Project Overview

This project implements a comprehensive scraping solution for Bluesky that can:
- Scrape 500,000+ users daily
- Extract 1M+ posts daily
- Handle follower/following relationships with deep crawling
- Support individual user and post scraping by URL
- Implement proxy rotation and rate limiting
- Provide checkpointing and resume capabilities

## 🛠 Technical Architecture

### Core Strategy

Our approach leverages Bluesky's AT Protocol API endpoints rather than browser automation for maximum scalability:

1. **Network Requests Over Browser Automation**: Direct API calls to AT Protocol endpoints
2. **Public API Endpoints**: Using `https://public.api.bsky.app` for unauthenticated requests
3. **Efficient Pagination**: Handling cursor-based pagination for large datasets
4. **Proxy Rotation**: Built-in proxy support with failure handling
5. **Rate Limiting**: Intelligent rate limiting to avoid bans
6. **Data Deduplication**: Bloom filters and Redis sets for duplicate prevention

### Key Endpoints Used

- `app.bsky.actor.searchActors` - User discovery
- `app.bsky.actor.getProfile` - Individual user profiles
- `app.bsky.feed.getAuthorFeed` - User posts
- `app.bsky.feed.getPostThread` - Individual post details
- `app.bsky.graph.getFollowers` - Follower relationships
- `app.bsky.graph.getFollows` - Following relationships
- `app.bsky.actor.getSuggestions` - User discovery

## 📦 Project Structure

```
bluesky-scraper/
├── src/
│   ├── core/
│   │   ├── api_client.js          # AT Protocol API client
│   │   ├── proxy_manager.js       # Proxy rotation logic
│   │   ├── rate_limiter.js        # Rate limiting implementation
│   │   └── checkpoint_manager.js  # Resume/checkpoint system
│   ├── scrapers/
│   │   ├── users_scraper.js       # Bulk user discovery & scraping
│   │   ├── posts_scraper.js       # User posts scraping
│   │   ├── followers_scraper.js   # Follower/following graph
│   │   ├── user_info_scraper.js   # Individual user by URL
│   │   └── post_info_scraper.js   # Individual post by URL
│   ├── utils/
│   │   ├── data_validator.js      # Data validation & cleaning
│   │   ├── deduplicator.js        # Bloom filter & Redis dedup
│   │   ├── file_manager.js        # JSON output management
│   │   └── url_parser.js          # Bluesky URL parsing
│   └── config/
│       ├── endpoints.js           # API endpoint configurations
│       ├── settings.js            # Global settings
│       └── proxies.js             # Proxy configurations
├── data/
│   ├── users/                     # User data output
│   ├── posts/                     # Posts data output
│   ├── relationships/             # Follower/following data
│   ├── checkpoints/               # Resume checkpoints
│   └── logs/                      # Scraping logs
├── scripts/
│   ├── run_users_scraper.js       # Users scraper runner
│   ├── run_posts_scraper.js       # Posts scraper runner
│   ├── run_followers_scraper.js   # Followers scraper runner
│   ├── run_user_info.js           # Single user scraper
│   ├── run_post_info.js           # Single post scraper
│   ├── run_scraper.js             # Main orchestrator script
│   ├── proxy_manager_cli.js       # Proxy management CLI
│   ├── setup.js                   # Project setup script
│   └── benchmark.js               # Performance benchmarking
├── tests/
│   └── integration/               # Integration tests
├── package.json
├── docker-compose.yml             # Redis & monitoring setup
└── .env.example                   # Environment variables template
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Redis (for deduplication)
- Docker (optional, for Redis)

### Installation

1. **Clone and setup:**
```bash
git clone <repository-url>
cd bluesky-scraper
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your proxy settings and configurations
```

3. **Start Redis (using Docker):**
```bash
docker-compose up -d redis
```

4. **Run scrapers:**
```bash
# Basic Usage - Scrape users (500K+ daily)
npm run scrape:users

# Basic Usage - Scrape posts from discovered users (1M+ daily)
npm run scrape:posts

# Basic Usage - Scrape follower/following relationships
npm run scrape:followers

# Individual Scrapers
npm run scrape:user-info -- --url "https://bsky.app/profile/username.bsky.social"
npm run scrape:post-info -- --url "https://bsky.app/profile/username.bsky.social/post/abc123"

# Advanced Examples
# Posts with media from last week, English only
npm run scrape:posts -- --max-posts 500000 --include-media --min-age 1 --max-age 7 --languages en

# Deep relationship mapping with bidirectional analysis
npm run scrape:followers -- --max-depth 3 --bidirectional --seed-users "user1.bsky.social,user2.bsky.social"

# Detailed user analysis with metrics and recent posts
npm run scrape:user-info -- --handle "username.bsky.social" --include-metrics --include-posts --include-followers

# Complete post analysis with thread context and replies
npm run scrape:post-info -- --url "https://bsky.app/profile/user/post/abc123" --include-thread --include-replies --include-engagement

# Dry run for testing (no data saved)
npm run scrape:posts -- --dry-run --max-posts 1000

# Resume from checkpoint
npm run scrape:users -- --resume
```

## 📋 Scraper Modules

### 1. Users Scraper (`users_scraper.js`)
- **Target**: 500,000+ users daily
- **Strategy**: Multiple discovery patterns
  - Search by popular hashtags
  - Suggested users API
  - Profile chains from known users
  - Random handle generation patterns
- **Output**: `data/users/users_YYYY-MM-DD.json`
- **Fields**: DID, handle, displayName, avatar, description, createdAt, followersCount, followsCount, postsCount
- **CLI Options**: `--max-users`, `--discovery-methods`, `--output-dir`, `--dry-run`, `--resume`

### 2. Posts Scraper (`posts_scraper.js`)
- **Target**: 1M+ posts daily
- **Strategy**: Iterate through discovered users
- **Features**: 
  - Age filtering (min/max days)
  - Media detection (images/videos)
  - Language filtering
  - Content type filtering (replies, reposts)
  - Engagement metrics collection
- **Output**: `data/posts/posts_YYYY-MM-DD.json`
- **Fields**: uri, cid, author, text, createdAt, images, videos, likeCount, repostCount, replyCount, embed
- **CLI Options**: `--max-posts`, `--max-posts-per-user`, `--min-age`, `--max-age`, `--include-media`, `--include-replies`, `--include-reposts`, `--languages`

### 3. Relationships Scraper (`relationships_scraper.js`)
- **Strategy**: Deep crawl (configurable 1-5 levels)
- **Features**: 
  - Bidirectional relationship mapping
  - Network analysis and metrics
  - Influencer detection
  - Configurable crawl depth
  - Seed user specification
- **Output**: `data/relationships/relationships_YYYY-MM-DD.json`
- **Fields**: follower_did, following_did, relationship_type, discovered_at, depth_level
- **CLI Options**: `--max-relationships`, `--max-depth`, `--bidirectional`, `--seed-users`, `--max-followers-per-user`, `--max-following-per-user`

### 4. User Info Scraper (`user_info_scraper.js`)
- **Input**: Bluesky profile URL, handle, or file with multiple targets
- **Features**:
  - Detailed metrics and analytics
  - Recent posts analysis
  - Top followers by influence
  - Following list analysis
  - Multiple output formats (JSON, CSV)
  - Stdout output option
- **Output**: Individual user profile data with enrichment
- **CLI Options**: `--url`, `--handle`, `--file`, `--include-metrics`, `--include-posts`, `--include-followers`, `--include-following`, `--stdout`
- **Usage Examples**:
  ```bash
  npm run scrape:user-info -- --url "https://bsky.app/profile/username.bsky.social"
  npm run scrape:user-info -- --handle "username.bsky.social" --include-metrics --include-posts
  npm run scrape:user-info -- --file users.txt --include-followers --max-followers 50
  ```

### 5. Post Info Scraper (`post_info_scraper.js`)
- **Input**: Bluesky post URL, AT URI, or file with multiple targets
- **Features**:
  - Full thread context analysis
  - Reply collection and analysis
  - Parent post detection
  - Engagement metrics
  - Media attachment analysis
  - Thread position tracking
- **Output**: Complete post data with thread context
- **CLI Options**: `--url`, `--uri`, `--file`, `--include-thread`, `--include-replies`, `--include-parent`, `--include-engagement`, `--include-media`, `--stdout`
- **Usage Examples**:
  ```bash
  npm run scrape:post-info -- --url "https://bsky.app/profile/user/post/abc123"
  npm run scrape:post-info -- --uri "at://did:plc:abc123/app.bsky.feed.post/abc123"
  npm run scrape:post-info -- --file posts.txt --include-thread --include-replies
  ```

## ⚙️ Core Features

### Proxy Rotation
- Automatic proxy rotation on failures
- Health checking and failover
- Support for HTTP/HTTPS/SOCKS proxies
- Configurable retry strategies

### Rate Limiting
- Intelligent rate limiting per endpoint
- Exponential backoff on errors
- Request queuing and throttling
- Per-proxy rate limit tracking

### Checkpointing & Resume
- Automatic checkpoint creation
- Resume from last successful state
- Crash recovery
- Progress tracking and reporting

### Data Validation & Deduplication
- Schema validation for all data
- Bloom filter for memory-efficient dedup
- Redis-based persistent deduplication
- Data cleaning and normalization

## 🔧 Configuration

### Environment Variables (.env)
```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379

# Proxy Settings
PROXY_LIST=proxy1:port:user:pass,proxy2:port:user:pass
PROXY_ROTATION_ENABLED=true

# Rate Limiting
REQUESTS_PER_MINUTE=60
BURST_LIMIT=10

# Output Settings
OUTPUT_DIR=./data
CHECKPOINT_INTERVAL=1000

# Logging
LOG_LEVEL=info
LOG_FILE=./data/logs/scraper.log
```

### Proxy Configuration
The scraper now uses **Redis-based proxy management** with random selection for better distribution and performance.

#### Adding Proxies
```bash
# Add single proxy
npm run proxy:add -- --proxy "http://user:pass@proxy.com:8080"

# Add from file (one proxy per line)
npm run proxy:add -- --file proxies.txt

# Add comma-separated list
npm run proxy:add -- --list "proxy1:8080:user:pass,proxy2:8080:user:pass"

# Import from various formats
npm run proxy import proxies.txt --format txt
npm run proxy import proxies.json --format json
npm run proxy import proxies.csv --format csv
```

#### Managing Proxies
```bash
# List all proxies
npm run proxy:list

# List by status
npm run proxy list --status healthy
npm run proxy list --status unhealthy
npm run proxy list --status rate_limited

# View proxy statistics
npm run proxy:stats

# Perform health check
npm run proxy:health

# Test random proxy selection
npm run proxy:test --count 5

# Remove proxies
npm run proxy remove --proxy "http://proxy.com:8080"
npm run proxy remove --status unhealthy
npm run proxy remove --all

# Reset statistics
npm run proxy reset
```

#### Proxy File Format
Create a `proxies.txt` file with one proxy per line:
```
# HTTP proxies
http://user:pass@proxy1.com:8080
https://user:pass@proxy2.com:8080

# SOCKS proxies  
socks5://user:pass@proxy3.com:1080

# Simple format (defaults to HTTP)
proxy4.com:8080:user:pass
proxy5.com:8080
```

#### How It Works
1. **Redis Storage**: All proxies are stored in Redis sets by status (healthy, unhealthy, rate_limited)
2. **Random Selection**: Each request randomly selects from healthy proxies for better distribution
3. **Health Monitoring**: Automatic health checks mark proxies as healthy/unhealthy
4. **Rate Limit Handling**: Rate-limited proxies are temporarily removed from rotation
5. **Statistics Tracking**: Detailed stats per proxy (requests, successes, failures, response times)

#### Benefits of Redis-Based Proxy Management
- **Dynamic Management**: Add/remove proxies without restarting
- **Better Distribution**: Random selection prevents proxy overuse
- **Persistent State**: Proxy health survives application restarts
- **Real-time Monitoring**: Live proxy status and statistics
- **Automatic Recovery**: Failed proxies automatically retry after cooldown

## 🖥️ CLI Commands Reference

### Main Scraper Commands

#### Users Scraper
```bash
npm run scrape:users [options]

Options:
  -m, --max-users <number>        Maximum number of users to scrape (default: 500000)
  -d, --discovery-methods <list>  Comma-separated discovery methods
  -o, --output-dir <dir>          Output directory (default: ./data)
  --dry-run                       Run without saving data
  -r, --resume                    Resume from last checkpoint
  -c, --checkpoint-interval <n>   Checkpoint interval (default: 1000)

Examples:
  npm run scrape:users -- --max-users 100000 --dry-run
  npm run scrape:users -- --resume --output-dir ./custom-data
```

#### Posts Scraper
```bash
npm run scrape:posts [options]

Options:
  -m, --max-posts <number>        Maximum posts to scrape (default: 1000000)
  -u, --max-posts-per-user <n>    Max posts per user (default: 100)
  --min-age <days>                Minimum post age in days (default: 0)
  --max-age <days>                Maximum post age in days (default: 30)
  --include-media                 Include posts with media
  --include-replies               Include reply posts
  --include-reposts               Include repost/quote posts
  -l, --languages <langs>         Language codes (e.g., en,es,fr)
  -o, --output-dir <dir>          Output directory (default: ./data)
  --dry-run                       Run without saving data
  -r, --resume                    Resume from checkpoint

Examples:
  npm run scrape:posts -- --max-posts 500000 --include-media
  npm run scrape:posts -- --min-age 1 --max-age 7 --languages en,es
  npm run scrape:posts -- --dry-run --max-posts 1000
```

#### Relationships Scraper
```bash
npm run scrape:followers [options]

Options:
  -m, --max-relationships <n>     Max relationships to map (default: 1000000)
  -d, --max-depth <levels>        Crawl depth 1-5 (default: 3)
  --max-followers-per-user <n>    Max followers per user (default: 1000)
  --max-following-per-user <n>    Max following per user (default: 1000)
  --include-followers             Include follower relationships (default: true)
  --include-following             Include following relationships (default: true)
  --no-followers                  Exclude follower relationships
  --no-following                  Exclude following relationships
  --bidirectional                 Analyze bidirectional relationships
  -s, --seed-users <users>        Seed users (comma-separated)
  -o, --output-dir <dir>          Output directory (default: ./data)
  --dry-run                       Run without saving data
  -r, --resume                    Resume from checkpoint

Examples:
  npm run scrape:followers -- --max-depth 2 --bidirectional
  npm run scrape:followers -- --seed-users "user1.bsky.social,user2.bsky.social"
  npm run scrape:followers -- --no-following --max-followers-per-user 500
```

#### Individual User Scraper
```bash
npm run scrape:user-info [options]

Options:
  -u, --url <url>                 Bluesky profile URL
  -h, --handle <handle>           User handle
  -f, --file <file>               File with URLs/handles (one per line)
  --include-metrics               Include detailed metrics
  --include-posts                 Include recent posts
  --include-followers             Include top followers
  --include-following             Include following list
  --max-posts <number>            Max recent posts (default: 20)
  --max-followers <number>        Max followers (default: 100)
  --max-following <number>        Max following (default: 100)
  -o, --output-dir <dir>          Output directory (default: ./data)
  --output-format <format>        Output format: json, csv (default: json)
  --stdout                        Output to stdout instead of file

Examples:
  npm run scrape:user-info -- --url "https://bsky.app/profile/username.bsky.social"
  npm run scrape:user-info -- --handle "username.bsky.social" --include-metrics --include-posts
  npm run scrape:user-info -- --file users.txt --stdout
```

#### Individual Post Scraper
```bash
npm run scrape:post-info [options]

Options:
  -u, --url <url>                 Bluesky post URL
  --uri <uri>                     AT Protocol URI
  -f, --file <file>               File with URLs/URIs (one per line)
  --include-thread                Include full thread context
  --include-replies               Include post replies
  --include-parent                Include parent post (if reply)
  --include-engagement            Include engagement metrics
  --include-media                 Include media attachments
  --max-thread-depth <number>     Max thread depth (default: 10)
  --max-replies <number>          Max replies (default: 50)
  -o, --output-dir <dir>          Output directory (default: ./data)
  --output-format <format>        Output format: json, csv (default: json)
  --stdout                        Output to stdout instead of file

Examples:
  npm run scrape:post-info -- --url "https://bsky.app/profile/user/post/abc123"
  npm run scrape:post-info -- --uri "at://did:plc:abc123/app.bsky.feed.post/abc123"
  npm run scrape:post-info -- --file posts.txt --include-thread --include-replies
```

### Proxy Management Commands

```bash
# Add proxies
npm run proxy:add -- --proxy "http://user:pass@proxy.com:8080"
npm run proxy:add -- --file proxies.txt
npm run proxy:add -- --list "proxy1:8080:user:pass,proxy2:8080:user:pass"

# List proxies
npm run proxy:list
npm run proxy:list -- --status healthy
npm run proxy:list -- --verbose

# Proxy statistics and health
npm run proxy:stats
npm run proxy:health
npm run proxy:test -- --count 5

# Remove proxies
npm run proxy remove -- --proxy "http://proxy.com:8080"
npm run proxy remove -- --status unhealthy
npm run proxy remove -- --all

# Import from files
npm run proxy import proxies.txt --format txt
npm run proxy import proxies.json --format json
npm run proxy import proxies.csv --format csv

# Reset statistics
npm run proxy reset
```

### Utility Commands

```bash
# Project setup and initialization
npm run setup

# Performance benchmarking
npm run benchmark

# Run all tests
npm test

# Run specific tests
npm run test:users
npm run test:posts
npm run test:followers

# Linting
npm run lint
npm run lint:fix

# Development mode with auto-reload
npm run dev
```

## 📊 Performance Benchmarks

Expected performance with proper proxy setup and Redis configuration:

### Throughput Rates
- **Users Scraper**: 500-1,000 users/minute (up to 500K+ daily)
- **Posts Scraper**: 1,000-2,000 posts/minute (up to 1M+ daily)
- **Relationships Scraper**: 500-1,000 relationships/minute
- **Individual User Info**: 10-20 users/minute (with full enrichment)
- **Individual Post Info**: 15-30 posts/minute (with thread analysis)

### Resource Usage
- **Memory Usage**: ~200MB base + bloom filter overhead (~50MB per 1M items)
- **Storage Requirements**: 
  - ~1GB per 100K users with full profile data
  - ~2GB per 1M posts with media metadata
  - ~500MB per 1M relationships
- **Redis Memory**: ~100MB for 1M deduplicated items + proxy management
- **Network Bandwidth**: 10-50 Mbps depending on proxy count and concurrency

### Scalability Factors
- **Proxy Count**: 10+ proxies recommended for optimal performance
- **Redis Performance**: SSD storage recommended for checkpoint/resume speed
- **Concurrent Workers**: 5-20 concurrent requests per proxy (configurable)
- **Rate Limiting**: Respects AT Protocol limits (60 requests/minute per endpoint)

### Performance Tuning Tips
```bash
# High-performance configuration
npm run scrape:posts -- --max-posts 1000000 --checkpoint-interval 500 --max-posts-per-user 200

# Memory-optimized configuration  
npm run scrape:users -- --max-users 100000 --checkpoint-interval 1000

# Network-optimized with multiple proxies
npm run proxy:add -- --file high-speed-proxies.txt
npm run scrape:followers -- --max-depth 2 --max-followers-per-user 500
```

## 🔍 Monitoring & Logging

- Real-time progress tracking
- Error rate monitoring
- Proxy health status
- Rate limit compliance
- Data quality metrics

## 🛡️ Anti-Detection Features

- Randomized request intervals
- User-agent rotation
- Request header variation
- Proxy IP rotation
- Respectful rate limiting
- Error handling and backoff

## 📈 Scalability

### Horizontal Scaling
- Multiple worker processes
- Distributed queue support
- Shared Redis state
- Load balancing across proxies

### Vertical Scaling
- Configurable concurrency limits
- Memory-efficient data structures
- Streaming JSON output
- Garbage collection optimization

## 🔄 Data Flow

1. **Discovery Phase**: Find new users through various methods
2. **Extraction Phase**: Scrape detailed data for discovered entities
3. **Validation Phase**: Clean and validate extracted data
4. **Deduplication Phase**: Remove duplicates using Bloom filters
5. **Storage Phase**: Save to organized JSON files
6. **Checkpoint Phase**: Save progress for resume capability

## 🚨 Error Handling

- Automatic retry with exponential backoff
- Proxy failover on connection issues
- Rate limit detection and waiting
- Data corruption recovery
- Network timeout handling
- Graceful shutdown on interruption

## 📝 Output Format

All data is stored in organized JSON files with consistent schemas:

### Users Output
```json
{
  "metadata": {
    "scrape_date": "2025-01-25",
    "total_users": 50000,
    "scraper_version": "1.0.0"
  },
  "users": [
    {
      "did": "did:plc:abc123...",
      "handle": "username.bsky.social",
      "displayName": "User Display Name",
      "avatar": "https://cdn.bsky.app/img/...",
      "description": "User bio text",
      "createdAt": "2023-04-01T12:00:00.000Z",
      "followersCount": 1234,
      "followsCount": 567,
      "postsCount": 890
    }
  ]
}
```

## 🧪 Testing

```bash
# Run integration tests
npm test

# Test individual scrapers
npm run test:users
npm run test:posts
npm run test:followers

# Test with sample data
npm run test:sample
```

## 🔒 Security & Compliance

- Respects robots.txt and rate limits
- No authentication bypass attempts
- Public data only
- GDPR compliance considerations
- Data retention policies
- Secure proxy handling

## 📚 Development

### Adding New Scrapers
1. Create scraper in `src/scrapers/`
2. Implement base scraper interface
3. Add configuration to `src/config/`
4. Create runner script in `scripts/`
5. Add tests in `tests/`

### Contributing
1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Submit pull request

## 🐛 Troubleshooting

### Common Issues
- **Rate Limited**: Reduce concurrency or add more proxies
- **Proxy Failures**: Check proxy credentials and connectivity
- **Memory Issues**: Reduce batch sizes or enable streaming
- **Data Corruption**: Check disk space and permissions

### Debug Mode
```bash
DEBUG=bluesky-scraper:* npm run scrape:users
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Support

For issues and questions:
1. Check the troubleshooting section
2. Review existing GitHub issues
3. Create a new issue with detailed information

---

**Note**: This scraper is designed for research and educational purposes. Please respect Bluesky's terms of service and rate limits. 