import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphConstructor } from '../construct_graph';
import { LPContact, JobHistoryResponse } from '../../types';

describe('GraphConstructor', () => {
  const mockContacts: LPContact[] = [
    {
      id: '1',
      name: 'John Smith',
      firm: 'Sequoia Capital',
      firmSlug: 'sequoia-capital',
      role: 'Partner',
      email: 'john@sequoia.com',
      linkedin: 'https://linkedin.com/in/johnsmith',
      twitter: null,
      location: 'San Francisco',
      website: 'https://sequoia.com',
      notes: 'Early stage investor',
      personalConnections: '500+',
      jobHistoryRaw: null,
      educationRaw: null,
      interests: null,
      source: {
        type: 'csv',
        filename: 'test.csv',
        importedAt: new Date().toISOString()
      },
      confidence: {
        overall: 0.9,
        name: 1.0,
        firm: 0.9
      }
    },
    {
      id: '2',
      name: 'Jane Doe',
      firm: 'Andreessen Horowitz',
      firmSlug: 'andreessen-horowitz',
      role: 'General Partner',
      email: 'jane@a16z.com',
      linkedin: 'https://linkedin.com/in/janedoe',
      twitter: null,
      location: 'Menlo Park',
      website: 'https://a16z.com',
      notes: 'Fintech focus',
      personalConnections: '1000+',
      jobHistoryRaw: null,
      educationRaw: null,
      interests: null,
      source: {
        type: 'csv',
        filename: 'test.csv',
        importedAt: new Date().toISOString()
      },
      confidence: {
        overall: 0.95,
        name: 1.0,
        firm: 0.95
      }
    }
  ];

  const mockJobHistories: JobHistoryResponse[] = [
    {
      person: 'John Smith',
      jobs: [
        {
          company: 'Sequoia Capital',
          title: 'Partner',
          startYear: 2015,
          endYear: 2023
        },
        {
          company: 'Google',
          title: 'Product Manager',
          startYear: 2010,
          endYear: 2015
        }
      ]
    },
    {
      person: 'Jane Doe',
      jobs: [
        {
          company: 'Andreessen Horowitz',
          title: 'General Partner',
          startYear: 2018
        },
        {
          company: 'Stripe',
          title: 'Head of Product',
          startYear: 2015,
          endYear: 2018
        }
      ]
    }
  ];

  let graphConstructor: GraphConstructor;

  beforeEach(() => {
    graphConstructor = new GraphConstructor();
  });

  afterEach(async () => {
    await graphConstructor.close();
  });

  it('should construct graph from contacts and job histories', async () => {
    const result = await graphConstructor.constructGraph(mockContacts, mockJobHistories, { debug: true });
    expect(result.graph).toBeDefined();
    expect(result.connections).toBeDefined();
    expect(result.connections?.length).toBeGreaterThan(0);
  });

  it('should handle empty job histories', async () => {
    const result = await graphConstructor.constructGraph(mockContacts, [], { debug: true });
    expect(result.graph).toBeDefined();
    expect(result.connections).toBeDefined();
  });

  it('should handle empty contacts', async () => {
    const result = await graphConstructor.constructGraph([], mockJobHistories, { debug: true });
    expect(result.graph).toBeDefined();
    expect(result.connections).toBeDefined();
  });
}); 