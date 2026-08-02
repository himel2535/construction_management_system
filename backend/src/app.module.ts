import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ApiModule } from './api/api.module';

@Module({
  imports: [PrismaModule, ApiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
