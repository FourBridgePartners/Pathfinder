import { describe, it, expect } from 'vitest';
import { preprocessRecord } from '../../normalization/utils/preprocessRecord';

describe('preprocessRecord', () => {
  it('should clean and normalize basic fields', () => {
    const input = {
      'Full Name': 'John Smith',
      'Company Name': 'Acme Capital',
      'Email Address': 'john@acme.com',
      'Job Title': 'Managing Director',
    };

    const result = preprocessRecord(input, { debug: true });

    expect(result).toEqual({
      name: 'John Smith',
      firm: 'Acme Capital',
      email: 'john@acme.com',
      role: 'Managing Director',
    });
  });

  it('should handle split AUM values', () => {
    const input = {
      'AUM Part 1': '$500',
      'AUM Part 2': '000',
      'AUM Part 3': '000.00',
    };

    const result = preprocessRecord(input, { debug: true });

    expect(result).toEqual({
      aum: '$500000000.00',
    });
  });

  it('should merge notes and descriptions', () => {
    const input = {
      'Notes': 'First note',
      'Description': 'Second note',
      'Summary': 'Third note',
    };

    const result = preprocessRecord(input, { debug: true });

    expect(result).toEqual({
      notes: 'First note\nSecond note\nThird note',
    });
  });

  it('should handle missing required fields with fallbacks', () => {
    const input = {
      'Company Name': 'Acme Capital',
      // Missing name field
    };

    const result = preprocessRecord(input, { debug: true });

    expect(result).toEqual({
      name: 'Acme Capital',
      firm: 'Acme Capital',
    });
  });

  it('should clean special characters and whitespace', () => {
    const input = {
      'Name': 'John\u00A0Smith', // Non-breaking space
      'Notes': 'Smart\u2018quotes\u2019', // Smart quotes
      'Location': 'New\u200BYork', // Zero-width space
    };

    const result = preprocessRecord(input, { debug: true });

    expect(result).toEqual({
      name: 'John Smith',
      firm: 'John Smith', // Fallback behavior is expected
      notes: "Smart'quotes'",
      location: 'New York',
    });
  });

  it('should add source information when provided', () => {
    const input = {
      'Name': 'John Smith',
    };

    const result = preprocessRecord(input, {
      debug: true,
      source: {
        type: 'csv',
        filename: 'test.csv',
      },
    });

    expect(result).toEqual({
      name: 'John Smith',
      firm: 'John Smith',  // Fallback behavior
      source: '{"type":"csv","filename":"test.csv"}',
    });
  });

  it('should handle URL-like fields', () => {
    const input = {
      'LinkedIn Profile': 'https://linkedin.com/in/johnsmith',
      'Company Website': 'https://acme.com',
    };

    const result = preprocessRecord(input, { debug: true });

    expect(result).toEqual({
      linkedin: 'https://linkedin.com/in/johnsmith',
      website: 'https://acme.com',
    });
  });

  it('should handle location-like fields', () => {
    const input = {
      'HQ': 'New York City',
      'Office Location': 'San Francisco',
    };

    const result = preprocessRecord(input, { debug: true });

    expect(result).toEqual({
      location: 'New York City',
    });
  });
}); 