import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendPasswordChangeConfirmation(
    email: string,
    userId: string,
  ): Promise<void> {
    // TODO: Implement actual email sending with a mailer (e.g., SendGrid, AWS SES, SMTP)
    // For now, log the action
    this.logger.log(
      `Password change confirmation email would be sent to ${email} (user: ${userId})`,
    );
  }
}
