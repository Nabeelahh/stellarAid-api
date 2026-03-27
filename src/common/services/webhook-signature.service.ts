import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class WebhookSignatureService {
  private readonly logger = new Logger(WebhookSignatureService.name);
  private readonly webhookSecret: string;
  private readonly signatureHeader = 'x-webhook-signature';
  private readonly timestampHeader = 'x-webhook-timestamp';

  constructor(private configService: ConfigService) {
    this.webhookSecret = this.configService.get<string>('WEBHOOK_SECRET', '');
    
    if (!this.webhookSecret) {
      this.logger.warn('WEBHOOK_SECRET is not configured. Webhook signature validation will be skipped.');
    }
  }

  /**
   * Validate webhook signature
   * Uses HMAC-SHA256 signature with timestamp to prevent replay attacks
   */
  validateSignature(
    payload: string,
    signature: string | undefined,
    timestamp: string | undefined,
  ): boolean {
    // If no webhook secret configured, skip validation (development mode)
    if (!this.webhookSecret) {
      this.logger.debug('Webhook signature validation skipped - no secret configured');
      return true;
    }

    // Check required headers
    if (!signature || !timestamp) {
      this.logger.warn('Missing webhook signature or timestamp headers');
      return false;
    }

    // Validate timestamp to prevent replay attacks (within 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    const webhookTimestamp = parseInt(timestamp, 10);
    const timeDiff = Math.abs(now - webhookTimestamp);
    
    if (timeDiff > 300) { // 5 minutes
      this.logger.warn(`Webhook timestamp too old: ${timeDiff} seconds ago`);
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );

    if (!isValid) {
      this.logger.warn('Invalid webhook signature');
    }

    return isValid;
  }

  /**
   * Extract signature and timestamp from request headers
   */
  extractHeaders(headers: Record<string, string | string[]>): {
    signature: string | undefined;
    timestamp: string | undefined;
  } {
    const getHeader = (name: string): string | undefined => {
      const value = headers[name];
      return Array.isArray(value) ? value[0] : value;
    };

    return {
      signature: getHeader(this.signatureHeader),
      timestamp: getHeader(this.timestampHeader),
    };
  }

  /**
   * Generate a signature for testing purposes
   */
  generateSignature(payload: string, timestamp?: number): string {
    const ts = timestamp || Math.floor(Date.now() / 1000);
    const signedPayload = `${ts}.${payload}`;
    
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex');
  }
}
