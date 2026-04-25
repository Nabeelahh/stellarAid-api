# Donations Module

This module provides Stellar blockchain transaction verification services for donations.

## Features

- **Transaction Verification**: Verify Stellar transactions on the blockchain
- **Asset Support**: Supports XLM (native), USDC, and NGNT tokens
- **Validation**: Comprehensive validation of transaction details (amount, recipient, asset)
- **Caching**: Built-in caching for verification results (5-minute TTL)
- **Error Handling**: Robust error handling for blockchain errors
- **Account Verification**: Check if Stellar accounts exist

## API Endpoints

### POST /donations/verify
Verify a Stellar transaction with optional validation parameters.

**Request Body:**
```json
{
  "transactionHash": "string",
  "expectedRecipient": "string (optional)",
  "expectedAmount": "string (optional)",
  "asset": {
    "type": "native|credit_alphanum4|credit_alphanum12",
    "code": "string (optional)",
    "issuer": "string (optional)"
  },
  "allowOverpayment": "boolean (default: false)",
  "tolerancePercentage": "number (0-100, default: 0)",
  "memo": "string (optional)"
}
```

**Response:**
```json
{
  "isValid": "boolean",
  "transactionDetails": {
    "transactionHash": "string",
    "amount": "string",
    "asset": {
      "type": "string",
      "code": "string",
      "issuer": "string"
    },
    "recipient": "string",
    "sender": "string",
    "memo": "string",
    "timestamp": "number"
  },
  "errors": ["string"],
  "warnings": ["string"],
  "verifiedAt": "string",
  "ledgerSequence": "number"
}
```

### GET /donations/verify/:transactionHash
Verify a transaction by hash using default validation.

### GET /donations/asset/:assetCode/:issuer?
Get asset information from the Stellar network.

### GET /donations/account/:accountId/exists
Check if a Stellar account exists.

## Supported Assets

- **XLM**: Native Stellar asset
- **USDC**: USD Coin (stablecoin)
- **NGNT**: Nigerian Naira token

## Configuration

Add these environment variables to your `.env` file:

```env
# Stellar Network Configuration
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
```

## Usage Example

```typescript
import { StellarService } from './services/stellar.service';

// Verify a transaction
const result = await stellarService.verifyTransaction('transaction-hash', {
  expectedRecipient: 'GD5J6HF7E5RE4YXB...',
  expectedAmount: '100',
  allowOverpayment: true,
  tolerancePercentage: 5
});

if (result.isValid) {
  console.log('Transaction verified successfully');
} else {
  console.log('Verification failed:', result.errors);
}
```

## Error Handling

The service provides comprehensive error handling for:

- **Network Errors**: Stellar Horizon API connectivity issues
- **Transaction Errors**: Invalid transaction hashes, malformed transactions
- **Validation Errors**: Amount mismatches, recipient mismatches, unsupported assets
- **Account Errors**: Non-existent accounts, invalid account formats

## Caching

Verification results are cached for 5 minutes to improve performance and reduce API calls to the Stellar network.

## Testing

Run the test suite:

```bash
npm test -- donations
```

## Dependencies

- `@stellar/stellar-sdk`: Stellar SDK for blockchain interactions
- `@nestjs/common`: NestJS framework
- `@nestjs/config`: Configuration management

## Installation

Before using this module, ensure the Stellar SDK is installed:

```bash
npm install @stellar/stellar-sdk
```

## Notes

- The current implementation includes a temporary version that works without the Stellar SDK installed
- Replace the temporary service with the full implementation after SDK installation
- Uncomment the Stellar SDK imports in `stellar.service.ts` after installation
