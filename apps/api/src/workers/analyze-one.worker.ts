import { Worker } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379');

export const analyzeWorker = new Worker('analyze', async job => {
  // TODO: parse -> embed -> score -> LLM -> validate -> persist
  console.log('Processing job', job.id, job.data);
}, { connection });
