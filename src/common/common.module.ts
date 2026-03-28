import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StellarBlockchainService } from './services/stellar-blockchain.service';
import { StellarSyncProcessorService } from './services/stellar-sync-processor.service';
import { Donation } from '../donations/entities/donation.entity';
import { Project } from '../projects/entities/project.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Donation, Project]),
  ],
  providers: [
    StellarBlockchainService,
    StellarSyncProcessorService,
  ],
  exports: [
    StellarBlockchainService,
    StellarSyncProcessorService,
  ],
})
export class CommonModule {}
