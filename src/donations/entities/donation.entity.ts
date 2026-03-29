import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Project } from '../../projects/entities/project.entity';

@Entity('donations')
@Index('IDX_donations_project_id', ['projectId'])
@Index('IDX_donations_transaction_hash', ['transactionHash'])
@Unique('UQ_donations_transaction_hash', ['transactionHash'])
export class Donation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, (project) => project.donations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ nullable: true, type: 'uuid' })
  donorId: string | null;

  @ManyToOne(() => User, { nullable: true, eager: false, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'donorId' })
  donor: User | null;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  amount: number;

  @Column({ default: 'XLM' })
  assetType: string;

  @Column({ nullable: true, unique: true, type: 'varchar' })
  transactionHash: string | null;

  @Column({ default: false })
  isAnonymous: boolean;

  @Column({ default: true })
  verified: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
