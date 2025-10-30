import { z } from 'zod';
import { createHmac } from 'crypto';

const WebhookValidationSchema = z.object({
  provider: z.string(),
  signature: z.string(),
  body: z.string(),
  secret: z.string(),
});

const CashAppWebhookSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({
    id: z.string(),
    amount: z.object({
      amount: z.string(),
      currency: z.string(),
    }),
    status: z.string(),
    external_id: z.string().optional(),
  }),
});

export type WebhookValidation = z.infer<typeof WebhookValidationSchema>;
export type CashAppWebhook = z.infer<typeof CashAppWebhookSchema>;

export class WebhookService {
  /**
   * Validate webhook signature for security
   */
  static validateWebhook(input: WebhookValidation): boolean {
    const validatedInput = WebhookValidationSchema.parse(input);

    switch (validatedInput.provider) {
      case 'cashapp':
        return this.validateCashAppWebhook(validatedInput.signature, validatedInput.body, validatedInput.secret);
      default:
        throw new Error(`Unsupported webhook provider: ${validatedInput.provider}`);
    }
  }

  /**
   * Validate CashApp webhook signature
   */
  private static validateCashAppWebhook(signature: string, body: string, secret: string): boolean {
    try {
      const hmac = createHmac('sha256', secret);
      hmac.update(body, 'utf8');
      const expectedSignature = hmac.digest('hex');

      // CashApp uses 'v1=' prefix
      const providedSignature = signature.replace('v1=', '');
      return providedSignature === expectedSignature;
    } catch (error) {
      console.error('Webhook validation error:', error);
      return false;
    }
  }

  /**
   * Parse and validate CashApp webhook payload
   */
  static parseCashAppWebhook(rawBody: string): CashAppWebhook {
    try {
      const parsed = JSON.parse(rawBody);
      return CashAppWebhookSchema.parse(parsed);
    } catch (error) {
      throw new Error('Invalid CashApp webhook payload');
    }
  }

  /**
   * Extract transaction details from webhook
   */
  static extractTransactionData(provider: string, webhookData: any): {
    transactionId: string;
    amount: number;
    externalId: string;
    isSuccess: boolean;
  } {
    switch (provider) {
      case 'cashapp':
        const cashappData = webhookData as CashAppWebhook;
        return {
          transactionId: cashappData.data.id,
          amount: parseFloat(cashappData.data.amount.amount),
          externalId: cashappData.data.external_id || cashappData.data.id,
          isSuccess: cashappData.data.status === 'SUCCESS' || cashappData.data.status === 'COMPLETED',
        };
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Get webhook secret for provider (from environment or config)
   */
  static getWebhookSecret(provider: string): string {
    const secret = process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`];
    if (!secret) {
      throw new Error(`Webhook secret not configured for provider: ${provider}`);
    }
    return secret;
  }
}