import { vi } from 'vitest';

// Mock transaction
const mockTransaction = {
  run: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  close: vi.fn()
};

// Mock Neo4j driver and session
const mockSession = {
  run: vi.fn(),
  close: vi.fn(),
  beginTransaction: vi.fn().mockReturnValue(mockTransaction)
};

const mockDriver = {
  session: vi.fn().mockReturnValue(mockSession)
};

// Mock Neo4j service
vi.mock('../../services/neo4j', () => ({
  Neo4jService: vi.fn().mockImplementation(() => ({
    driver: mockDriver
  }))
}));

// Global test setup
beforeAll(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();
});

afterAll(() => {
  // Clean up
  vi.resetAllMocks();
});

// Export mock objects for use in tests
export { mockSession, mockDriver, mockTransaction }; 