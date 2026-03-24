import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { Donation } from './entities/donation.entity';
import { User } from '../users/entities/user.entity';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './providers/projects.service';
import { SearchService } from './services/search.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project, Donation, User])],
  controllers: [ProjectsController],
  providers: [ProjectsService, SearchService],
  exports: [ProjectsService, SearchService],
})
export class ProjectsModule {}
