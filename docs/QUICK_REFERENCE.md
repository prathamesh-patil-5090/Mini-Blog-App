# Token Family Security - Quick Reference

## TL;DR

Token families prevent token reuse attacks by tracking token versions. If a blacklisted token is reused, all user tokens are invalidated immediately.

## Key Functions

### Creating Token Families

```typescript
// On login/register
const tokenFamilyId = await createTokenFamily(userId)

const payload: JwtPayload = {
  id: user.id,
  name: user.name,
  email: user.email,
  username: user.username,
  tokenFamilyId,
  version: 1
}

const accessToken = await createAccessToken(payload)
const refreshToken = await createRefreshToken(payload)
```

### Refreshing Tokens

```typescript
// Validates family, increments version, blacklists old token
const user = await verifyRefreshToken(refreshToken, req)
const newRefreshToken = await generateNewRefreshToken(user, refreshToken)
const newAccessToken = await createAccessToken(user)
```

### Logout All Devices

```typescript
// Invalidates all token families for user
await invalidateAllUserSessions(userId)
```

## Common Patterns

### Login/Register
```typescript
const hashedPassword = await hashPassword(password)
const newUser = await prisma.author.create({ ... })
const tokenFamilyId = await createTokenFamily(newUser.id)

const payload: JwtPayload = {
  id: newUser.id,
  name: newUser.name,
  email: newUser.email,
  username: newUser.username,
  tokenFamilyId,
  version: 1
}

const accessToken = await createAccessToken(payload)
const refreshToken = await createRefreshToken(payload)
setAuthCookies(res, accessToken, refreshToken)
```

### Refresh Tokens
```typescript
try {
  const user = await verifyRefreshToken(refreshToken, req)
  const newRefreshToken = await generateNewRefreshToken(user, refreshToken)
  const newAccessToken = await createAccessToken(user)
  setAuthCookies(res, newAccessToken, newRefreshToken)

  return res.status(200).json({ message: "Tokens refreshed" })
} catch (err) {
  // Check for security breach
  if (err.message.includes("reuse") || err.message.includes("security breach")) {
    return res.status(403).json({
      error: "Security breach detected - please login again"
    })
  }
  return res.status(401).json({ error: "Invalid token" })
}
```

### Logout
```typescript
await prisma.blacklistedTokens.create({ data: { refreshToken } })
clearAuthCookies(res)
return res.status(200).json({ message: "Logged out" })
```

### Logout All Devices
```typescript
await invalidateAllUserSessions(userId)
clearAuthCookies(res)
return res.status(200).json({ message: "Logged out from all devices" })
```

## Security Events

### What Gets Logged

1. **Blacklisted token reuse** (CRITICAL)
   - Someone tried to use a token that was already used
   - ALL user tokens are invalidated
   - Logged with userId, IP, token

2. **Version mismatch**
   - Token version doesn't match database
   - Indicates replay attack or concurrent use
   - ALL user tokens invalidated

3. **Forced refresh**
   - Refresh attempted while access token still valid
   - Suspicious but not critical
   - Token blacklisted, logged with IP

### Checking Logs

```typescript
// Recent security events
const events = await prisma.suspiciousActivity.findMany({
  orderBy: { createdAt: 'desc' },
  take: 100
})

// Critical events
const critical = await prisma.suspiciousActivity.findMany({
  where: { reason: { contains: 'CRITICAL' } }
})

// Events for specific user
const userEvents = await prisma.suspiciousActivity.findMany({
  where: { userId: 'user_id_here' }
})
```

## Error Messages

| Error | Meaning | Action |
|-------|---------|--------|
| `Token reuse detected - account security breach` | Blacklisted token was used | All tokens invalidated, user must login |
| `Token family has been invalidated` | Account was locked due to security breach | User must login again |
| `Token reuse detected - version mismatch` | Old token was replayed | All tokens invalidated, user must login |
| `Suspicious refresh: access token still valid` | Forced refresh attempt | Token blacklisted, try again |
| `Token family not found` | Token family was deleted | User must login again |

## HTTP Status Codes

- `200` - Success
- `201` - Created (register)
- `400` - Bad request (validation error)
- `401` - Unauthorized (invalid credentials/token)
- `403` - Forbidden (security breach detected)
- `409` - Conflict (user already exists)
- `500` - Server error

## Cookie Configuration

```typescript
const cookieOptions = {
  httpOnly: true,                          // Prevent XSS
  secure: env.APP_STAGE === "production",  // HTTPS only in prod
  sameSite: "strict" as const,             // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000         // 7 days
}
```

## Database Queries

### Find active token families for user
```typescript
const families = await prisma.tokenFamily.findMany({
  where: {
    userId: 'user_id',
    isActive: true
  }
})
```

### Count user sessions
```typescript
const sessionCount = await prisma.tokenFamily.count({
  where: {
    userId: 'user_id',
    isActive: true
  }
})
```

### Cleanup old inactive families (maintenance)
```typescript
const thirtyDaysAgo = new Date()
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

await prisma.tokenFamily.deleteMany({
  where: {
    isActive: false,
    updatedAt: { lt: thirtyDaysAgo }
  }
})
```

## Testing Checklist

- [ ] Login creates token family with version 1
- [ ] Refresh increments version
- [ ] Refresh blacklists old token
- [ ] Reusing blacklisted token invalidates all user tokens
- [ ] Version mismatch invalidates all user tokens
- [ ] Logout blacklists token
- [ ] Logout all invalidates all families
- [ ] Security events are logged
- [ ] Cookies are set correctly
- [ ] Error messages are informative

## Common Mistakes

❌ **Don't return tokens in response body**
```typescript
// BAD
return res.json({ accessToken, refreshToken })
```

✅ **Use HTTPOnly cookies only**
```typescript
// GOOD
setAuthCookies(res, accessToken, refreshToken)
return res.json({ message: "Success" })
```

❌ **Don't check instanceof Error on thrown functions**
```typescript
// BAD
const user: JwtPayload | Error = await verifyRefreshToken(...)
if (user instanceof Error) { ... }
```

✅ **Use try-catch for thrown errors**
```typescript
// GOOD
try {
  const user = await verifyRefreshToken(...)
} catch (err) {
  // handle error
}
```

❌ **Don't silently swallow errors**
```typescript
// BAD
try {
  await validateTokenFamily(...)
} catch {}
```

✅ **Handle or rethrow errors**
```typescript
// GOOD
try {
  await validateTokenFamily(...)
} catch (err) {
  console.error("Validation failed:", err)
  throw err
}
```

## Performance Tips

1. **Use indexes** - Token family queries are indexed on `userId + isActive` and `userId + version`
2. **Cleanup old families** - Periodically delete inactive families older than 30 days
3. **Monitor database size** - Token families grow with each login
4. **Consider TTL** - Set up MongoDB TTL index on inactive families

## Security Best Practices

1. ✅ Use HTTPS in production
2. ✅ Set `secure: true` in production cookies
3. ✅ Enable `httpOnly` on all auth cookies
4. ✅ Use `sameSite: 'strict'`
5. ✅ Monitor suspicious activity logs
6. ✅ Set up alerts for critical events
7. ✅ Rate limit refresh endpoint
8. ✅ Invalidate all tokens on password change

## Environment Variables

```env
JWT_SECRET=your-secret-key-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
JWT_EXPIRES_IN=15m
BCRYPT_ROUNDS=12
APP_STAGE=dev|production
```

## Quick Debug Commands

```bash
# Regenerate Prisma Client
npx prisma generate

# Push schema to database
npx prisma db push

# View database in browser
npx prisma studio

# Check for errors
npm run build
```

## Support

- Full documentation: `docs/TOKEN_FAMILY_SECURITY.md`
- Implementation details: `docs/IMPLEMENTATION_SUMMARY.md`
- Issues: Create GitHub issue with [security] tag
