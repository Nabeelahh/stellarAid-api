import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProjectsJobProcessor } from './processors/projects.processor';
import { TransactionsJobProcessor } from './processors/transactions.processor';
import { JobsService } from './services/jobs.service';
import { StellarTransactionService } from './services/stellar-transaction.service';
import { ProjectsModule } from '../projects/projects.module';
import { DonationsModule } from '../donations/donations.module';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST') || 'localhost',
          port: configService.get('REDIS_PORT') || 6379,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'projects',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
      },
    }),
    BullModule.registerQueue({
      name: 'transactions',
      defaultJobOptions: {
        attempts: 5,                  // retry up to 5 times for pending/transient errors
        backoff: {
          type: 'exponential',
          delay: 2000,                // start at 2s, doubles each attempt
        },
        removeOnComplete: true,
        removeOnFail: false,          // keep failed jobs for inspection
      },
    }),
    ProjectsModule,
    DonationsModule,
  ],
  providers: [
    ProjectsJobProcessor,
    TransactionsJobProcessor,
    JobsService,
    StellarTransactionService,
  ],
  exports: [BullModule, JobsService],
})
export class JobsModule {}