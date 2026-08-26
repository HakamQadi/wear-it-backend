import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({
    origin: (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map((v) => v.trim()),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  const server = await app.listen(Number(process.env.PORT || 4000), '0.0.0.0');

  // Image generation holds a request open for roughly half a minute. Node closes idle
  // keep-alive sockets after 5s by default, which makes a reverse proxy in front of this
  // service reuse a socket the server is closing and see ECONNRESET. Keep sockets alive
  // for longer than any proxy in front would, and allow the long request to finish.
  server.keepAliveTimeout = 120_000;
  server.headersTimeout = 125_000;
  server.requestTimeout = 300_000;
}
bootstrap();
