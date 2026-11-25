import { describe, expect, it } from 'vitest';
import { isShareToken, shareLink, shareUrl } from './share';

const TOKEN = '0123456789abcdef'.repeat(3);

describe('isShareToken', () => {
  it('accepts 48 lowercase hex characters only', () => {
    expect(isShareToken(TOKEN)).toBe(true);
    for (const bad of [null, undefined, '', TOKEN.slice(1), `${TOKEN}0`, TOKEN.toUpperCase(), '00000000-0000-0000-0000-000000000000']) {
      expect(isShareToken(bad)).toBe(false);
    }
  });
});

describe('shareUrl', () => {
  it('builds the absolute public URL with the basePath and never the Pedido id', () => {
    expect(shareUrl('https://angelocg97.github.io', '/conkora-admin-system', TOKEN)).toBe(
      `https://angelocg97.github.io/conkora-admin-system/pedido/?t=${TOKEN}`,
    );
    expect(shareUrl('http://localhost:3000', '', TOKEN)).toBe(`http://localhost:3000/pedido/?t=${TOKEN}`);
  });
});

describe('shareLink', () => {
  const data = { title: 'Pedido', text: 'Hola', url: 'https://x/pedido/?t=1' };
  const abort = () => Object.assign(new Error('closed'), { name: 'AbortError' });

  it('uses the Web Share API when available', async () => {
    const shared: ShareData[] = [];
    expect(await shareLink({ share: async (d) => void shared.push(d) }, data)).toBe('shared');
    expect(shared).toEqual([data]);
  });

  it('treats closing the share sheet as cancelled, without copying', async () => {
    const copied: string[] = [];
    const nav = { share: async () => Promise.reject(abort()), clipboard: { writeText: async (t: string) => void copied.push(t) } };
    expect(await shareLink(nav, data)).toBe('cancelled');
    expect(copied).toEqual([]);
  });

  it('copies the URL without Web Share or when sharing is not allowed', async () => {
    const copied: string[] = [];
    const clipboard = { writeText: async (t: string) => void copied.push(t) };
    expect(await shareLink({ clipboard }, data)).toBe('copied');
    const notAllowed = Object.assign(new Error('no'), { name: 'NotAllowedError' });
    expect(await shareLink({ share: async () => Promise.reject(notAllowed), clipboard }, data)).toBe('copied');
    expect(copied).toEqual([data.url, data.url]);
  });

  it('fails when nothing works', async () => {
    expect(await shareLink({}, data)).toBe('failed');
    expect(await shareLink({ clipboard: { writeText: async () => Promise.reject(new Error('denied')) } }, data)).toBe('failed');
  });
});
