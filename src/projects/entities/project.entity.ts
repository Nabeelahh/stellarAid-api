import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Donation } from './donation.entity';
import { ProjectImage } from './project-image.entity';
import { ProjectHistory } from './project-history.entity';
import { ProjectCategory } from 'src/common/enums/project-category.enum';
import { ProjectStatus } from 'src/common/enums/project-status.enum';

@Entity('projects')
@Index('IDX_projects_creator_id', ['creatorId'])
@Index('IDX_projects_status', ['status'])
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ nullable: true })
  imageUrl: string | null;

  @Column({
    type: 'enum',
    enum: ProjectCategory,
    default: ProjectCategory.OTHER,
  })
  category: ProjectCategory;

  @Column({
    type: 'enum',
    enum: ProjectStatus,
    default: ProjectStatus.DRAFT,
  })
  status: ProjectStatus;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  goalAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 7, default: 0 })
  fundsRaised: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  progress: number;

  @Column({ type: 'int', default: 0 })
  donationCount: number;

  @Column({ nullable: true, type: 'timestamp' })
  deadline: Date | null;

  @Column({ nullable: true, type: 'text' })
  rejectionReason: string | null;

  @Index('IDX_projects_creator_id_col')
  @Column()
  creatorId: string;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creatorId' })
  creator: User;

  @OneToMany(() => ProjectImage, (image) => image.project, { cascade: true })
  images: ProjectImage[];

  @OneToMany(() => Donation, (donation) => donation.project, { cascade: true })
  donations: Donation[];

  @OneToMany(() => ProjectHistory, (history) => history.project, { cascade: true })
  history: ProjectHistory[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
