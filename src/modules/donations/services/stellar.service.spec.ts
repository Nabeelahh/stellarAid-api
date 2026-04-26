import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StellarService } from './stellar.service';
import { StellarAsset } from '../interfaces/stellar-verification.interface';

describe('StellarService', () => {
  let service: StellarService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
    configService = module.get<ConfigService>(ConfigService);

    mockConfigService.get.mockReturnValue('https://horizon-testnet.stellar.org');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyTransaction', () => {
    it('should throw error when SDK is not installed', async () => {
      const transactionHash = 'test-hash';
      
      await expect(service.verifyTransaction(transactionHash)).rejects.toThrow(
        'Stellar SDK not installed yet'
      );
    });
  });

  describe('getAssetInfo', () => {
    it('should throw error when SDK is not installed for non-native assets', async () => {
      await expect(service.getAssetInfo('USDC', 'test-issuer')).rejects.toThrow(
        'Stellar SDK not installed yet'
      );
    });

    it('should throw error when SDK is not installed for asset verification', async () => {
      await expect(service.getAssetInfo('USDC')).rejects.toThrow(
        'Issuer is required for non-native assets'
      );
    });
  });

  describe('accountExists', () => {
    it('should throw error when SDK is not installed', async () => {
      const accountId = 'test-account';
      
      await expect(service.accountExists(accountId)).rejects.toThrow(
        'Stellar SDK not installed yet'
      );
    });
  });

  describe('validateTransaction', () => {
    it('should validate transaction with matching recipient', () => {
      const details = {
        transactionHash: 'test-hash',
        amount: '100',
        asset: { type: 'native' as const, code: 'XLM' },
        recipient: 'test-recipient',
        ledgerSequence: 12345,
      };

      const options = {
        expectedRecipient: 'test-recipient',
      };

      // We need to access private method for testing
      const result = (service as any).validateTransaction(details, options);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject transaction with mismatched recipient', () => {
      const details = {
        transactionHash: 'test-hash',
        amount: '100',
        asset: { type: 'native' as const, code: 'XLM' },
        recipient: 'wrong-recipient',
        ledgerSequence: 12345,
      };

      const options = {
        expectedRecipient: 'test-recipient',
      };

      const result = (service as any).validateTransaction(details, options);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Recipient mismatch. Expected: test-recipient, Got: wrong-recipient');
    });

    it('should validate amount within tolerance', () => {
      const details = {
        transactionHash: 'test-hash',
        amount: '105',
        asset: { type: 'native' as const, code: 'XLM' },
        recipient: 'test-recipient',
        ledgerSequence: 12345,
      };

      const options = {
        expectedAmount: '100',
        tolerancePercentage: 10,
      };

      const result = (service as any).validateTransaction(details, options);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject amount outside tolerance', () => {
      const details = {
        transactionHash: 'test-hash',
        amount: '120',
        asset: { type: 'native' as const, code: 'XLM' },
        recipient: 'test-recipient',
        ledgerSequence: 12345,
      };

      const options = {
        expectedAmount: '100',
        tolerancePercentage: 10,
      };

      const result = (service as any).validateTransaction(details, options);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Amount outside tolerance. Expected: 100 ±10%, Got: 120');
    });

    it('should allow overpayment when enabled', () => {
      const details = {
        transactionHash: 'test-hash',
        amount: '150',
        asset: { type: 'native' as const, code: 'XLM' },
        recipient: 'test-recipient',
        ledgerSequence: 12345,
      };

      const options = {
        expectedAmount: '100',
        allowOverpayment: true,
      };

      const result = (service as any).validateTransaction(details, options);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toContain('Overpayment detected. Expected: 100, Got: 150');
    });

    it('should reject insufficient amount when overpayment allowed', () => {
      const details = {
        transactionHash: 'test-hash',
        amount: '50',
        asset: { type: 'native' as const, code: 'XLM' },
        recipient: 'test-recipient',
        ledgerSequence: 12345,
      };

      const options = {
        expectedAmount: '100',
        allowOverpayment: true,
      };

      const result = (service as any).validateTransaction(details, options);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Insufficient amount. Expected: 100, Got: 50');
    });
  });

  describe('isSupportedAsset', () => {
    it('should return true for XLM (native)', () => {
      const asset: StellarAsset = { type: 'native' };
      expect((service as any).isSupportedAsset(asset)).toBe(true);
    });

    it('should return true for USDC', () => {
      const asset: StellarAsset = { type: 'credit_alphanum4', code: 'USDC' };
      expect((service as any).isSupportedAsset(asset)).toBe(true);
    });

    it('should return true for NGNT', () => {
      const asset: StellarAsset = { type: 'credit_alphanum4', code: 'NGNT' };
      expect((service as any).isSupportedAsset(asset)).toBe(true);
    });

    it('should return false for unsupported assets', () => {
      const asset: StellarAsset = { type: 'credit_alphanum4', code: 'UNKNOWN' };
      expect((service as any).isSupportedAsset(asset)).toBe(false);
    });
  });
});
