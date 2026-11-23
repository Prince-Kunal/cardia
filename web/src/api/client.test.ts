import { describe, expect, it, vi } from 'vitest';
import { EngineClient, EngineError } from './client';

const connection = { url: 'http://127.0.0.1:8765', token: 'secret' };

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function clientWith(...responses: (Response | Error)[]) {
  const fetchImpl = vi.fn<typeof fetch>();
  for (const r of responses) {
    if (r instanceof Error) fetchImpl.mockRejectedValueOnce(r);
    else fetchImpl.mockResolvedValueOnce(r);
  }
  return { client: new EngineClient(connection, fetchImpl), fetchImpl };
}

describe('EngineClient', () => {
  it('sends the token on every call but the health check', async () => {
    const { client, fetchImpl } = clientWith(reply(200, { status: 'ok' }), reply(200, {}));
    await client.health();
    await client.engine();
    const [healthUrl, healthInit] = fetchImpl.mock.calls[0];
    const [, engineInit] = fetchImpl.mock.calls[1];
    expect(healthUrl).toBe('http://127.0.0.1:8765/api/v1/health');
    const header = (init: RequestInit | undefined) => (init?.headers as Record<string, string> | undefined)?.Authorization;
    expect(header(healthInit)).toBeUndefined();
    expect(header(engineInit)).toBe('Bearer secret');
  });

  it('builds the library query from the filters that are set', async () => {
    const { client, fetchImpl } = clientWith(reply(200, []));
    await client.listHearts({ q: 'pilot', group: '', favourite: true, tag: undefined });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:8765/api/v1/hearts?q=pilot&favourite=true');
  });

  it('uploads files with what the user typed', async () => {
    const { client, fetchImpl } = clientWith(reply(202, { job_id: 'j' }));
    await client.createJob([new File(['x'], 'a.tif')], [{ heart_id: '206', weight_mg: 80 }]);
    const body = fetchImpl.mock.calls[0][1]?.body as FormData;
    expect((body.getAll('files')[0] as File).name).toBe('a.tif');
    expect(JSON.parse(body.get('meta') as string)).toEqual([{ heart_id: '206', weight_mg: 80 }]);
  });

  it('sends JSON for changes', async () => {
    const { client, fetchImpl } = clientWith(reply(200, {}));
    await client.updateHeart('k 1', { favourite: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8765/api/v1/hearts/k%201');
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe('{"favourite":true}');
  });

  it('turns engine errors into EngineError with the detail', async () => {
    const { client } = clientWith(
      reply(401, { detail: 'Missing or wrong token' }),
      reply(422, { detail: [{ msg: 'must be an absolute path' }] }),
      new TypeError('Failed to fetch'),
    );
    const e1 = await client.engine().catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(EngineError);
    expect((e1 as EngineError).unauthorised).toBe(true);
    expect((e1 as EngineError).message).toBe('Missing or wrong token');
    const e2 = (await client.getSettings().catch((e: unknown) => e)) as EngineError;
    expect(e2.message).toBe('must be an absolute path');
    const e3 = (await client.health().catch((e: unknown) => e)) as EngineError;
    expect(e3.offline).toBe(true);
  });
});
