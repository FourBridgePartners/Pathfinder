import { describe, it, expect } from 'vitest';
import { preprocessRecord } from '../preprocessRecord';

describe('preprocessRecord', () => {
  it('should handle split AUM values', () => {
    const record = {
      'AUM': '$500',
      'AUM2': '000',
      'AUM3': '000.00',
      'Other Field': 'value'
    };

    const result = preprocessRecord(record, { debug: true });
    expect(result.aum).toBe('$500000000.00');
  });

  it('should handle multiline text fields', () => {
    const record = {
      'Description': 'Line 1\nLine 2\nLine 3',
      'Notes': 'Note 1\nNote 2'
    };

    const result = preprocessRecord(record, { debug: true });
    expect(result.notes).toBe('Line 1\nLine 2\nLine 3\nNote 1\nNote 2');
  });

  it('should handle undefined or unnamed headers', () => {
    const record = {
      '': 'value1',
      ' ': 'value2',
      '  ': 'value3',
      'Valid Field': 'value4'
    };

    const result = preprocessRecord(record, { debug: true });
    expect(result['']).toBeUndefined();
    expect(result[' ']).toBeUndefined();
    expect(result['  ']).toBeUndefined();
    expect(result['valid field']).toBe('value4');
  });

  it('should extract and clean URLs', () => {
    const record = {
      'Profile': 'https://www.linkedin.com/in/johndoe/',
      'Website': 'http://example.com',
      'Other URL': 'https://other.com'
    };

    const result = preprocessRecord(record, { debug: true });
    expect(result.linkedin).toBe('https://www.linkedin.com/in/johndoe/');
    expect(result.website).toBe('http://example.com');
    expect(result['other url']).toBe('https://other.com');
  });

  it('should clean up location data', () => {
    const record = {
      'Location': 'New York City, NY, United States',
      'HQ': 'San Francisco Bay Area',
      'Office': 'London, UK'
    };

    const result = preprocessRecord(record, { debug: true });
    expect(result.location).toBe('New York City');
  });

  it('should clean up firm names', () => {
    const record = {
      'Firm': 'Acme Capital Partners LLC. A leading investment firm focused on technology.',
      'Company': 'XYZ Ventures. Specializing in early-stage investments.'
    };

    const result = preprocessRecord(record, { debug: true });
    expect(result.firm).toBe('Acme Capital Partners LLC');
  });

  it('should handle missing required fields with fallbacks', () => {
    const record = {
      'Firm': 'Acme Capital',
      'Description': 'Some description'
    };

    const result = preprocessRecord(record, { debug: true });
    expect(result.name).toBe('Acme Capital');
    expect(result.firm).toBe('Acme Capital');
  });

  it('should handle source information', () => {
    const record = {
      'Name': 'John Doe',
      'Firm': 'Acme Capital'
    };

    const source = {
      type: 'test',
      filename: 'test.csv'
    };

    const result = preprocessRecord(record, { debug: true, source });
    expect(result.source).toBe(JSON.stringify(source));
  });
}); 