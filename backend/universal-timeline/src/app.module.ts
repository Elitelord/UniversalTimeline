import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventsModule } from './events/events.module';
import { TimelineModule } from './timeline/timeline.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SummaryModule } from './summary/summary.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventsModule,
    TimelineModule,
    SummaryModule,
    // TypeOrmModule.forRootAsync uses ConfigService to read env vars.
    // This guarantees .env is loaded before we try to read DB_HOST, etc.
    // (Previously we used process.env directly, which can be a race condition.)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('POSTGRES_USER', 'postgres'),
        password: config.get<string>('POSTGRES_PASSWORD'),
        database: config.get<string>('POSTGRES_DB', 'universal_timeline'),
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  // configure() is called by NestJS during startup. It's how you register
  // middleware. forRoutes('*') means "apply to every single route."
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
