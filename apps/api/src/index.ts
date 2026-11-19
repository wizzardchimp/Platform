import { readFileSync } from 'node:fs';
import { loadTimetableFile, startKafkaIngest, type KafkaConfig } from './darwin/ingest';
import { Reference } from './darwin/reference';
import { DarwinStore } from './darwin/store';
import { pushSynthetic, syntheticReference } from './dev/synthetic';
import { buildServer } from './server';

const source = process.env.DATA_SOURCE ?? 'synthetic';
const port = Number(process.env.PORT ?? 3000);
const store = new DarwinStore();
let ref = new Reference();

const log = {
  info: (m: string) => console.log(m),
  error: (m: string) => console.error(m),
};

async function main() {
  if (source === 'synthetic') {
    ref = syntheticReference();
    pushSynthetic(store);
    setInterval(() => pushSynthetic(store), 20_000).unref();
    log.info('Using SYNTHETIC data (Paddington <-> Reading). Set DATA_SOURCE=kafka for live Darwin.');
  } else if (source === 'kafka') {
    const need = (k: string) => {
      const v = process.env[k];
      if (!v) throw new Error(`Missing env ${k}`);
      return v;
    };
    if (process.env.DARWIN_REF_FILE) {
      const n = ref.loadRefXml(readFileSync(process.env.DARWIN_REF_FILE, 'utf8'));
      log.info(`Loaded ${n} location refs`);
    }
    if (process.env.DARWIN_TIMETABLE_FILE) {
      const n = await loadTimetableFile(store, process.env.DARWIN_TIMETABLE_FILE);
      log.info(`Loaded ${n} timetable journeys`);
    }
    const cfg: KafkaConfig = {
      brokers: need('KAFKA_BROKERS').split(','),
      topic: need('KAFKA_TOPIC'),
      groupId: need('KAFKA_GROUP_ID'),
      username: need('KAFKA_USERNAME'),
      password: need('KAFKA_PASSWORD'),
      mechanism: (process.env.KAFKA_SASL_MECHANISM as KafkaConfig['mechanism']) ?? 'scram-sha-512',
    };
    await startKafkaIngest(store, cfg, log);
    setInterval(() => store.prune(), 60_000).unref();
  } else {
    throw new Error(`Unknown DATA_SOURCE ${source}`);
  }

  const app = buildServer({ store, ref }, { source });
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
