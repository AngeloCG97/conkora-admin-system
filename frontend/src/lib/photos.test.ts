import { describe, expect, it } from 'vitest';
import { thumbnailUrl } from './photos';

describe('thumbnailUrl', () => {
  it('inserts a square transformation after /image/upload/', () => {
    expect(thumbnailUrl('https://res.cloudinary.com/demo/image/upload/v1/conkora/a.jpg', 100)).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_fill,w_100,h_100,q_auto,f_auto/v1/conkora/a.jpg',
    );
  });
  it('leaves non-Cloudinary URLs unchanged', () => {
    expect(thumbnailUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
  });
});
