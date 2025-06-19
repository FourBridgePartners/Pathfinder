import { JobHistory, JobHistoryResponse } from '../types';

// Mock database of job histories
const MOCK_JOB_HISTORIES: Record<string, JobHistory[]> = {
  'Sarah Al Amiri': [
    {
      company: 'Mubadala',
      title: 'Managing Director',
      startYear: 2021,
      isCurrent: true,
      source: {
        type: 'linkedin',
        confidence: 0.95,
        url: 'https://linkedin.com/in/sarah-al-amiri'
      }
    },
    {
      company: 'UAE Space Agency',
      title: 'Chairperson',
      startYear: 2016,
      endYear: 2020,
      source: {
        type: 'press',
        confidence: 0.9,
        url: 'https://uaespaceagency.ae/news'
      }
    }
  ],
  'Paddy Cosgrave': [
    {
      company: 'Web Summit',
      title: 'CEO & Founder',
      startYear: 2009,
      endYear: 2023,
      source: {
        type: 'linkedin',
        confidence: 0.98,
        url: 'https://linkedin.com/in/paddycosgrave'
      }
    },
    {
      company: 'F.ounders',
      title: 'Co-Founder',
      startYear: 2008,
      endYear: 2012,
      source: {
        type: 'press',
        confidence: 0.85
      }
    }
  ]
};

export class JobHistoryFetcher {
  async fetchJobHistory(personName: string): Promise<JobHistoryResponse> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const jobs = MOCK_JOB_HISTORIES[personName] || [];
    
    return {
      person: personName,
      jobs: jobs.map(job => ({
        ...job,
        // Ensure all jobs have required fields
        source: {
          type: job.source.type,
          confidence: job.source.confidence,
          url: job.source.url
        }
      }))
    };
  }

  async fetchMultipleJobHistories(personNames: string[]): Promise<JobHistoryResponse[]> {
    const results = await Promise.all(
      personNames.map(name => this.fetchJobHistory(name))
    );
    return results;
  }
} 