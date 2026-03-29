import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonationsController } from './donations.controller';
import { DonationVerificationController } from './donations-verification.controller';
import { DonationsService } from './providers/donations.service';
import { DonationRecordingService } from './services/donation-recording.service';
import { Donation } from './entities/donation.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { StellarBlockchainService } from '../common/services/stellar-blockchain.service';
import { ProjectsService } from '../projects/providers/projects.service';
import { ProjectHistory } from '../projects/entities/project-history.entity';
import { MailService } from '../mail/mail.service';
import { WebhookSignatureService } from '../common/services/webhook-signature.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Donation, Project, User, ProjectHistory]),
  ],
  controllers: [
    DonationsController,
    DonationVerificationController,
  ],
  providers: [
    DonationsService,
    DonationRecordingService,
    StellarBlockchainService,
    ProjectsService,
    MailService,
    WebhookSignatureService,
  ],
  exports: [DonationsService, DonationRecordingService, TypeOrmModule],
})
export class DonationsModule {}
