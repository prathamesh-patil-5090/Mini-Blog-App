# Token Family Security Implementation

## Overview

This document describes the **Token Family** security system implemented in this application to protect against token reuse attacks and compromised accounts.

## What is Token Family?

A **Token Family** is a chain of refresh tokens that are linked together through a unique family ID and version number. Each time a refresh token is rotated (renewed), the version increments within the same family.

### Key Concepts

- **Token Family ID**: A unique identifier that groups related tokens together (one family per login session)
- **Version**: An incrementing number that tracks token rotation within a family
- **Active Status**: Indicates whether a token family is still valid or has been invalidated

## Security Benefits

### 1. **Token Reuse Detection**

If an attacker steals a refresh token and the legitimate user also uses it, one of them will attempt to use a **blacklisted** token. When this happens:

- ✅ All tokens for that user are **immediately invalidated**
- ✅ The security breach is **logged with IP and user details**
- ✅ The user must **log in again** on all devices

### 2. **Version Mismatch Detection**

Each refresh generates a new token with an incremented version. If someone tries to reuse an old token:

- ✅ The version won't match the database
- ✅ All user tokens are invalidated
- ✅ The attempt is logged as suspicious activity

### 3. **Forced Refresh Attack Prevention**

If someone tries to refresh tokens while the access token is still valid:

- ✅ The refresh token is blacklisted
- ✅ The attempt is logged as suspicious
- ✅ Returns an error to the attacker

## Database Schema

```prisma
model TokenFamily {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  userId    String   @db.ObjectId
  version   Int      @default(1)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  lastUsed  DateTime @default(now())

  @@index([userId, isActive])
  @@index([userId, version])
}
```

## JWT Payload Structure

```typescript
interface JwtPayload {
  id: string              // User ID
  name: string            // User name
  username: string        // Username
  email: string           // Email
  tokenFamilyId: string   // Token family identifier
  version: number         // Current version number
}
```

## Flow Diagrams

### Registration/Login Flow

```
User Registers/Logs In
       ↓
Create New User (if register)
       ↓
Create Token Family (version = 1)
       ↓
Generate Access Token + Refresh Token
       ↓
Return Tokens to User
```

### Refresh Token Flow

```
User Requests Token Refresh
       ↓
Verify Refresh Token Signature
       ↓
Check if Token is Blacklisted
   ↓                          ↓
   NO                        YES → SECURITY BREACH!
   ↓                               ↓
Validate Token Family              Invalidate ALL User Tokens
   ↓                               ↓
Check Version Matches              Log Security Event
   ↓         ↓                     ↓
  YES       NO                     Return 403 Error
   ↓         ↓
   ↓    Token Reuse Detected!
   ↓         ↓
   ↓    Invalidate All Tokens
   ↓         ↓
   ↓    Log Security Event
   ↓         ↓
   ↓    Return Error
   ↓
Increment Version (v2, v3, etc.)
   ↓
Blacklist Old Token
   ↓
Generate New Tokens
   ↓
Return to User
```

### Token Reuse Attack Detection

```
Scenario: Attacker steals refresh token, both attacker and user try to use it

User uses token first
    ↓
Token refreshed successfully
    ↓
Old token blacklisted
    ↓
Version incremented (1 → 2)
    ↓
Attacker tries to use OLD token
    ↓
System detects token is BLACKLISTED
    ↓
🚨 SECURITY BREACH DETECTED! 🚨
    ↓
ALL user tokens invalidated
    ↓
Security event logged
    ↓
Both user and attacker logged out
    ↓
User must login again (safe session)
```

## API Endpoints

### 1. Register User
**POST** `/api/auth/register`

Creates a new user and initializes their first token family.

```json
Request:
{
  "name": "John Doe",
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecurePass123!"
}

Response:
{
  "message": "User created successfully",
  "user": {
    "id": "...",
    "name": "John Doe",
    "username": "johndoe",
    "email": "john@example.com"
  }
}
```

### 2. Login User
**POST** `/api/auth/login`

Authenticates user and creates a new token family.

```json
Request:
{
  "email": "john@example.com",
  "password": "SecurePass123!"
}

Response:
{
  "message": "User logged in successfully",
  "user": { ... }
}
```

### 3. Refresh Token
**POST** `/api/auth/refresh`

Rotates tokens with version increment and security checks.

```json
Response (Success):
{
  "message": "Tokens refreshed successfully"
}

Response (Security Breach):
{
  "error": "Security breach detected - please login again",
  "details": "Token reuse detected - version mismatch"
}
```

### 4. Logout
**POST** `/api/auth/logout`

Blacklists the current refresh token.

### 5. Logout All Devices
**POST** `/api/auth/logout-all`

Invalidates all token families for the user (useful after password change).

## Security Event Logging

All suspicious activities are logged in the `SuspiciousActivity` collection:

```typescript
{
  id: string
  userId: string | null
  ip: string
  reason: string
  token: string | null
  createdAt: Date
}
```

### Logged Events:

1. **Blacklisted token reuse** - Critical security breach
2. **Token family validation failure** - Version mismatch or inactive family
3. **Forced refresh attempts** - Refresh while access token still valid

## Best Practices

### For Developers

1. **Always use the helper functions** - Don't create tokens manually
2. **Never skip token family validation** - It's your defense against reuse
3. **Monitor suspicious activity logs** - Set up alerts for security breaches
4. **Invalidate all tokens on password change** - Use `invalidateAllUserSessions(userId)`

### For Production

1. **Set up monitoring** for suspicious activity
2. **Alert on multiple security breach events** from same user
3. **Consider rate limiting** refresh endpoint
4. **Use HTTPS only** in production
5. **Enable secure cookies** (`secure: true` in production)

## Common Attack Scenarios & Defenses

### Scenario 1: Stolen Refresh Token

**Attack**: Hacker steals user's refresh token from compromised device

**Defense**:
- First usage blacklists the token
- Second usage (by attacker OR user) triggers full account lockdown
- All tokens invalidated, attacker loses access

### Scenario 2: Token Replay Attack

**Attack**: Attacker intercepts and replays old refresh tokens

**Defense**:
- Old tokens are blacklisted after use
- Replaying blacklisted token invalidates all user sessions
- Version mismatch also triggers invalidation

### Scenario 3: Concurrent Refresh Attempts

**Attack**: Attacker tries to refresh tokens at same time as user

**Defense**:
- Only one refresh succeeds
- Other attempt gets version mismatch
- All tokens invalidated, both parties logged out

## Migration Guide

If you're adding this to an existing system:

1. **Add TokenFamily model** to Prisma schema
2. **Run migration**: `npx prisma db push`
3. **Update JwtPayload interface** with `tokenFamilyId` and `version`
4. **Update all token creation** to use `createTokenFamily()`
5. **Update refresh logic** to increment versions
6. **Test token reuse detection** in development
7. **Invalidate existing tokens** or require users to re-login

## Testing

### Test Cases to Implement

```typescript
describe('Token Family Security', () => {
  it('should create token family on login', async () => {
    // Test that login creates a new family with version 1
  })

  it('should increment version on refresh', async () => {
    // Test that refresh increases version
  })

  it('should detect token reuse', async () => {
    // Test that using blacklisted token invalidates all user tokens
  })

  it('should invalidate all tokens on logout all', async () => {
    // Test that logout all marks all families as inactive
  })

  it('should reject version mismatch', async () => {
    // Test that old version numbers are rejected
  })

  it('should log security events', async () => {
    // Test that breaches are logged
  })
})
```

## Monitoring Queries

### Find users with multiple security breaches
```javascript
db.suspiciousActivity.aggregate([
  {
    $match: {
      reason: { $regex: /CRITICAL/i }
    }
  },
  {
    $group: {
      _id: "$userId",
      count: { $sum: 1 }
    }
  },
  {
    $match: { count: { $gt: 3 } }
  }
])
```

### Recent security events
```javascript
db.suspiciousActivity.find()
  .sort({ createdAt: -1 })
  .limit(100)
```

## Troubleshooting

### "Token family not found" error
- Token was manually deleted from DB
- Solution: User must log in again

### "Token family has been invalidated" error
- Security breach was detected and all tokens were invalidated
- Solution: User must log in again

### "Version mismatch" error
- Token reuse detected or concurrent refresh
- Solution: All sessions invalidated, user must log in again

## References

- [OWASP JWT Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [RFC 6749 - OAuth 2.0](https://tools.ietf.org/html/rfc6749)
- [Token Rotation Best Practices](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)

## License

This implementation is part of the Blogs App project.
