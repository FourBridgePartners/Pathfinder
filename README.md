# LP Discovery System

A system to help venture capital teams find warm introductions to LPs based on relationship data and web intelligence.

## Features

- Multi-source data ingestion (LinkedIn, Airtable, CSV, Web)
- Entity normalization and deduplication
- Graph-based relationship mapping
- Intelligent path finding for warm introductions
- Modern web interface for search and visualization

## Tech Stack

- TypeScript monorepo
- Next.js frontend
- Fastify backend
- Drizzle ORM with PostgreSQL
- Neo4j for relationship graph
- BullMQ for job queue
- Modular package architecture

## Project Structure

```
lp-discovery-system/
├── ingestion/     # Data ingestion modules
├── enrichment/    # Data on leads
├── normalization/ # Entity normalization
├── graph/         # Neo4j graph operations
├── query/         # Path finding and scoring
├── ui/            # Next.js frontend
├── server/        # Fastify backend
└── types/         # Shared TypeScript types
```

## Getting Started

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   ```

3. Start development servers:
   ```bash
   pnpm dev
   ```

## Development

- `pnpm dev` - Start all services in development mode
- `pnpm build` - Build all packages
- `pnpm test` - Run tests
- `pnpm lint` - Run linting

## License

MIT
