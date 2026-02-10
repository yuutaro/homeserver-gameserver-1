import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  const logger = new Logger('Bootstrap');
  logger.log('Bot started');

  const keepAlive = setInterval(() => {
    // keep the process alive even when Discord login is disabled
  }, 1 << 30);

  const shutdown = async () => {
    logger.log('Shutting down...');
    clearInterval(keepAlive);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
