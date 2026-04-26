import { BadRequestException } from '@nestjs/common';
import { ProjectStatus } from '../../../../generated/prisma';

interface StatusTransition {
  from: ProjectStatus;
  to: ProjectStatus;
  allowed: boolean;
  description: string;
}

// Define valid status transitions
const VALID_TRANSITIONS: StatusTransition[] = [
  { from: 'PENDING' as ProjectStatus, to: 'APPROVED' as ProjectStatus, allowed: true, description: 'Approve pending project' },
  { from: 'PENDING' as ProjectStatus, to: 'REJECTED' as ProjectStatus, allowed: true, description: 'Reject pending project' },
  { from: 'APPROVED' as ProjectStatus, to: 'ACTIVE' as ProjectStatus, allowed: true, description: 'Activate approved project' },
  { from: 'ACTIVE' as ProjectStatus, to: 'PAUSED' as ProjectStatus, allowed: true, description: 'Pause active project' },
  { from: 'PAUSED' as ProjectStatus, to: 'ACTIVE' as ProjectStatus, allowed: true, description: 'Resume paused project' },
  { from: 'ACTIVE' as ProjectStatus, to: 'COMPLETED' as ProjectStatus, allowed: true, description: 'Complete active project' },
  { from: 'PAUSED' as ProjectStatus, to: 'COMPLETED' as ProjectStatus, allowed: true, description: 'Complete paused project' },
];

export function validateStatusTransition(currentStatus: ProjectStatus, newStatus: ProjectStatus): void {
  if (currentStatus === newStatus) {
    throw new BadRequestException(`Project is already in ${newStatus} status`);
  }

  const transition = VALID_TRANSITIONS.find(
    (t) => t.from === currentStatus && t.to === newStatus && t.allowed,
  );

  if (!transition) {
    throw new BadRequestException(
      `Cannot transition from ${currentStatus} to ${newStatus}. Invalid status transition`,
    );
  }
}

export function canTransitionTo(currentStatus: ProjectStatus, newStatus: ProjectStatus): boolean {
  const transition = VALID_TRANSITIONS.find(
    (t) => t.from === currentStatus && t.to === newStatus && t.allowed,
  );
  return !!transition;
}

export function isProjectAcceptingDonations(status: ProjectStatus): boolean {
  // Only ACTIVE projects can accept donations
  return status === ('ACTIVE' as ProjectStatus);
}

export function isProjectCompleted(status: ProjectStatus): boolean {
  return status === ('COMPLETED' as ProjectStatus) || status === ('REJECTED' as ProjectStatus);
}
