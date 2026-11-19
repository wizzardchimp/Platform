import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { gunzipSync } from 'node:zlib';
import { Kafka, logLevel, type SASLOptions } from 'kafkajs';
import { parseJourneys, parsePport } from './parse';
import type { DarwinStore } from './store';

export interface KafkaConfig {
  brokers: string[];
  topic: string;
  groupId: string;
  username: string;
  password: string;
  mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
}

/** Messages may arrive gzip-compressed; plain XML otherwise. */
export function decodeMessage(buf: Buffer): string {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf).toString('utf8');
  return buf.toString('utf8');
}

export async function startKafkaIngest(
  store: DarwinStore,
  cfg: KafkaConfig,
  log: { info: (m: string) => void; error: (m: string) => void },
): Promise<() => Promise<void>> {
  const kafka = new Kafka({
    clientId: 'platform-api',
    brokers: cfg.brokers,
    ssl: true,
    sasl: { mechanism: cfg.mechanism, username: cfg.username, password: cfg.password } as SASLOptions,
    logLevel: logLevel.WARN,
  });
  const consumer = kafka.consumer({ groupId: cfg.groupId });
  await consumer.connect();
  await consumer.subscribe({ topic: cfg.topic, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        for (const ev of parsePport(decodeMessage(message.value))) store.apply(ev);
      } catch (e) {
        log.error(`bad Darwin message: ${(e as Error).message}`);
      }
    },
  });
  log.info(`Darwin Kafka ingest running on topic ${cfg.topic}`);
  return () => consumer.disconnect();
}

/**
 * Streams a (optionally gzipped) Darwin timetable file into the store.
 * Splits on </Journey> so the multi-hundred-MB file is never fully in memory.
 * Load this once at startup, *then* start the live feed, to have base schedules.
 */
export async function loadTimetableFile(store: DarwinStore, path: string): Promise<number> {
  const src = createReadStream(path);
  const stream = path.endsWith('.gz') ? src.pipe(createGunzip()) : src;
  let buf = '';
  let n = 0;
  const flush = (chunk: string) => {
    for (const ev of parseJourneys(chunk)) {
      store.apply(ev);
      n++;
    }
  };
  for await (const part of stream) {
    buf += part.toString('utf8');
    const end = buf.lastIndexOf('</Journey>');
    if (end >= 0) {
      const cut = end + '</Journey>'.length;
      flush(buf.slice(0, cut).replace(/^[\s\S]*?(?=<Journey[\s>])/, ''));
      buf = buf.slice(cut);
    }
  }
  return n;
}
