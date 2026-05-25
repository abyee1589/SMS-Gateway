import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // 1. Configure Helmet to be less restrictive with cross-origin requests
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 2. Dynamically allow your production frontend and local environment
  const allowedOrigins = [
    'https://sms-gateway-frontend.onrender.com', // Your live frontend
    'http://localhost:3000',                     // Next.js local port
    // 'http://localhost:5173',                     // Vite local port (just in case)
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like Postman or mobile apps)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS', // Added OPTIONS for preflight requests
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  const port = Number(process.env.PORT) || 5000;
  await app.listen(port);

  console.log(`API running on port ${port}`);
}
bootstrap();
