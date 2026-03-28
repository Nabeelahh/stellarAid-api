import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CommonModule } from './common/common.module';
import configuration from './database/config';
import { LoggerModule } from './logger/logger.module';
import { ProjectsModule } from './projects/projects.module';
import { MailModule } from './mail/mail.module';
import { DonationsModule } from './donations/donations.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
    }),
    DatabaseModule,
    LoggerModule,
    CommonModule,
    AuthModule,
    MailModule,
    // Users module provides user-facing endpoints such as change-password
    UsersModule,
    ProjectsModule,
    DonationsModule,
    WithdrawalsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
