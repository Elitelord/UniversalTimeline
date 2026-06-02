import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventsModule } from './events/events.module';
import { TimelineModule } from './timeline/timeline.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot(), EventsModule, TimelineModule, TypeOrmModule.forRoot({
    type: 'postgres',
    host: process.env.DB_HOST ,
    port: 5432,
    username: process.env.POSTGRES_USER ,
    password: process.env.POSTGRES_PASSWORD ,
    database: process.env.POSTGRES_DB ,
    autoLoadEntities: true,
    synchronize: true,
  })],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
