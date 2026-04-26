import { Module } from '@nestjs/common';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';

@Module({
  controllers: [DonationsController],
  providers: [DonationsService],
})
export class DonationsModule {}
import { ConfigModule } from '@nestjs/config';
import { DonationsController } from './controller/donations.controller';
import { StellarService } from './services/stellar.service';

@Module({
  imports: [ConfigModule],
  controllers: [DonationsController],
  providers: [StellarService],
  exports: [StellarService],
})
export class DonationsModule {}
